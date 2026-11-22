const router = require('express').Router();
const auth = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const ExcelJS = require('exceljs');
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

function cellToString(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    // ExcelJS parses time-only cells as Date objects (UTC epoch 1899-12-30)
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof val === 'object') {
    if (Array.isArray(val.richText)) return val.richText.map(r => r.text || '').join('').trim();
    if (val.text !== undefined) return String(val.text).trim();
    if (val.result !== undefined) return cellToString(val.result);
  }
  return String(val).trim();
}

function normalizeTime(rawVal) {
  if (rawVal instanceof Date) {
    const hh = String(rawVal.getUTCHours()).padStart(2, '0');
    const mm = String(rawVal.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof rawVal === 'number' && rawVal >= 0 && rawVal < 1) {
    const totalMinutes = Math.round(rawVal * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const str = cellToString(rawVal);
  if (!str) return '';
  // Match HH:MM or H:MM (with optional AM/PM)
  const m = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return str;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const meridiem = (m[3] || '').toLowerCase();
  if (meridiem === 'pm' && hh < 12) hh += 12;
  if (meridiem === 'am' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function calcHours(start, end) {
  const sp = String(start || '').split(':').map(Number);
  const ep = String(end || '').split(':').map(Number);
  if (sp.length < 2 || ep.length < 2 || sp.some(isNaN) || ep.some(isNaN)) return 0;
  return ((ep[0] * 60 + ep[1]) - (sp[0] * 60 + sp[1])) / 60;
}

function normalizeProgramme(raw, classCode) {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'OD' || v.includes('DIPLOMA')) return 'OD';
  if (v === 'DEGREE' || v.includes('BENG') || v.includes('BACHELOR')) return 'DEGREE';
  if (/^OD/i.test(classCode || '')) return 'OD';
  return 'DEGREE';
}

function inferClassYear(classCode, explicitYear) {
  if (explicitYear) return String(explicitYear).trim();
  const str = String(classCode || '').trim();
  // e.g. BENG24BEBE-2 -> "2", OD23CS-1 -> "1"
  const suffix = str.match(/[-_\s]([1-4])$/);
  if (suffix) return suffix[1];
  const yrWord = str.match(/(?:yr|year)\s*([1-4])/i);
  if (yrWord) return yrWord[1];
  return '1';
}

function getDatesInMonth(year, month, dayOfWeek) {
  const dates = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    if (d.getDay() === dayOfWeek) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function detectColumns(headerRow) {
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).toLowerCase();
  });

  const findCol = (patterns) => {
    for (let c = 1; c < headers.length; c++) {
      const h = headers[c] || '';
      if (patterns.some(p => h.includes(p))) return c;
    }
    return null;
  };

  const hasModuleNameHeader = headers.some(h => h && h.includes('module') && h.includes('name'));

  if (hasModuleNameHeader) {
    return {
      day: findCol(['day']) || 1,
      moduleCode: findCol(['module code', 'mod code', 'code']) || 2,
      moduleName: findCol(['module name', 'mod name']) || 3,
      classCode: findCol(['class']) || 4,
      programme: findCol(['prog']) || 5,
      startTime: findCol(['start', 'from']) || 6,
      endTime: findCol(['end', 'to']) || 7,
      transport: findCol(['transport']) || 8,
      remarks: findCol(['remark', 'note']) || 9,
      year: findCol(['year']),
      semester: findCol(['sem'])
    };
  }

  // Classic 8-column layout (backwards compatible)
  return {
    day: findCol(['day']) || 1,
    moduleCode: findCol(['module']) || 2,
    moduleName: null,
    classCode: findCol(['class']) || 3,
    programme: findCol(['prog']) || 4,
    startTime: findCol(['start', 'from']) || 5,
    endTime: findCol(['end', 'to']) || 6,
    transport: findCol(['transport']) || 7,
    remarks: findCol(['remark', 'note']) || 8,
    year: findCol(['year']),
    semester: findCol(['sem'])
  };
}

async function populateMonthSessions(userId, yearNum, monthNum, entriesInput, replaceExisting = false) {
  const lecturer = await prisma.lecturer.findUnique({ where: { userId } });
  const degreeRate = lecturer?.degreeRate ?? 15000;
  const odRate = lecturer?.odRate ?? 10000;
  const transportRate = lecturer?.transportRate ?? 10000;

  let replaced = 0;
  if (replaceExisting) {
    const pad = String(monthNum).padStart(2, '0');
    const del = await prisma.session.deleteMany({
      where: { userId, date: { startsWith: `${yearNum}-${pad}` } }
    });
    replaced = del.count;
  }

  const entries = entriesInput || await prisma.timetableEntry.findMany({ where: { userId } });
  const created = [];
  const skipped = [];

  for (const entry of entries) {
    const dayNum = DAY_MAP[entry.dayOfWeek.toLowerCase()];
    if (dayNum === undefined) continue;

    const hours = calcHours(entry.startTime, entry.endTime);
    if (!hours || hours <= 0) continue;

    const dates = getDatesInMonth(yearNum, monthNum, dayNum);

    for (const date of dates) {
      if (!replaceExisting) {
        const existing = await prisma.session.findFirst({
          where: { userId, date, moduleId: entry.moduleId, classId: entry.classId, startTime: entry.startTime }
        });
        if (existing) { skipped.push(date); continue; }
      }

      const hourlyRate = entry.programme === 'DEGREE' ? degreeRate : odRate;
      const tuition = Math.round(hours * hourlyRate);
      const transport = entry.hasTransport ? transportRate : 0;

      const session = await prisma.session.create({
        data: {
          userId,
          date,
          moduleId: entry.moduleId,
          classId: entry.classId,
          programme: entry.programme,
          startTime: entry.startTime,
          endTime: entry.endTime,
          hours,
          hourlyRate,
          tuition,
          transport,
          gross: tuition + transport,
          remarks: entry.remarks || ''
        }
      });
      created.push(session);
    }
  }

  return { created: created.length, skipped: skipped.length, replaced };
}

// Check whether sessions or timetable entries already exist for a target month/year
router.get('/existing-check', auth, async (req, res) => {
  try {
    const now = new Date();
    const monthNum = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const yearNum = parseInt(req.query.year, 10) || now.getFullYear();
    const pad = String(monthNum).padStart(2, '0');

    const [sessionCount, timetableCount] = await Promise.all([
      prisma.session.count({
        where: { userId: req.user.id, date: { startsWith: `${yearNum}-${pad}` } }
      }),
      prisma.timetableEntry.count({
        where: { userId: req.user.id }
      })
    ]);

    res.json({
      month: monthNum,
      monthName: MONTHS[monthNum - 1],
      year: yearNum,
      sessionCount,
      timetableCount,
      hasExistingSessions: sessionCount > 0
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get all timetable entries
router.get('/', auth, async (req, res) => {
  try {
    const entries = await prisma.timetableEntry.findMany({
      where: { userId: req.user.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });
    const [modules, classes] = await Promise.all([
      prisma.module.findMany({ where: { userId: req.user.id } }),
      prisma.class.findMany({ where: { userId: req.user.id } })
    ]);
    const modMap = Object.fromEntries(modules.map(m => [m.id, m]));
    const clsMap = Object.fromEntries(classes.map(c => [c.id, c]));
    const enriched = entries.map(e => ({
      ...e,
      module: modMap[e.moduleId],
      class: clsMap[e.classId]
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add single entry
router.post('/', auth, async (req, res) => {
  try {
    const { dayOfWeek, moduleId, classId, programme, startTime, endTime, hasTransport, remarks } = req.body;
    const entry = await prisma.timetableEntry.create({
      data: {
        userId: req.user.id,
        dayOfWeek,
        moduleId: parseInt(moduleId, 10),
        classId: parseInt(classId, 10),
        programme,
        startTime,
        endTime,
        hasTransport: !!hasTransport,
        remarks: remarks || ''
      }
    });
    res.json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete entry
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await prisma.timetableEntry.deleteMany({ where: { id, userId: req.user.id } });
    if (result.count === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clear all entries (current user only)
router.delete('/', auth, async (req, res) => {
  try {
    await prisma.timetableEntry.deleteMany({ where: { userId: req.user.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import timetable from Excel -> auto-fills Modules, Classes, Timetable, and optionally Sessions for the selected month
router.post('/import', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a valid Excel (.xlsx) timetable file' });
    }

    const now = new Date();
    const targetMonth = parseInt(req.body.month, 10) || (now.getMonth() + 1);
    const targetYear = parseInt(req.body.year, 10) || now.getFullYear();
    const autoPopulate = req.body.autoPopulate !== 'false' && req.body.autoPopulate !== '0';
    const replaceExisting = req.body.replaceExisting === 'true' || req.body.replaceExisting === true || req.body.replaceExisting === '1';

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'Uploaded Excel file has no worksheets' });

    const cols = detectColumns(sheet.getRow(1));
    const parsedRows = [];
    const errors = [];

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const dayRaw = cellToString(row.getCell(cols.day).value);
      const moduleCode = cellToString(row.getCell(cols.moduleCode).value);
      const moduleName = cols.moduleName ? cellToString(row.getCell(cols.moduleName).value) : '';
      const classCode = cellToString(row.getCell(cols.classCode).value);
      const progRaw = cellToString(row.getCell(cols.programme).value);
      const startTime = normalizeTime(row.getCell(cols.startTime).value);
      const endTime = normalizeTime(row.getCell(cols.endTime).value);
      const transportRaw = cellToString(row.getCell(cols.transport).value).toLowerCase();
      const remarks = cols.remarks ? cellToString(row.getCell(cols.remarks).value) : '';
      const explicitYear = cols.year ? cellToString(row.getCell(cols.year).value) : '';
      const explicitSemester = cols.semester ? cellToString(row.getCell(cols.semester).value) : '';

      if (!dayRaw && !moduleCode && !classCode && !startTime && !endTime) continue;

      if (!dayRaw || !moduleCode || !classCode || !startTime || !endTime) {
        errors.push(`Row ${i}: Missing required field (Day, Module Code, Class Code, Start Time, or End Time)`);
        continue;
      }

      const dayNum = DAY_MAP[dayRaw.toLowerCase()];
      if (dayNum === undefined) {
        errors.push(`Row ${i}: Unknown day "${dayRaw}". Use Monday, Tuesday, Wednesday, etc.`);
        continue;
      }

      const hours = calcHours(startTime, endTime);
      if (!hours || hours <= 0) {
        errors.push(`Row ${i}: Invalid time range "${startTime} - ${endTime}" (end time must be after start time)`);
        continue;
      }

      const dayOfWeek = DAYS[dayNum];
      const programme = normalizeProgramme(progRaw, classCode);
      const hasTransport = ['yes', 'true', '1', 'y'].includes(transportRaw);

      parsedRows.push({
        rowNum: i,
        dayOfWeek,
        moduleCode,
        moduleName,
        classCode,
        programme,
        startTime,
        endTime,
        hasTransport,
        remarks,
        year: inferClassYear(classCode, explicitYear),
        semester: explicitSemester || '1'
      });
    }

    if (parsedRows.length === 0) {
      return res.status(400).json({
        error: errors[0] || 'No valid timetable rows found in the uploaded Excel file',
        errors
      });
    }

    // Load existing modules & classes for this user into case-insensitive lookup maps
    const [existingModules, existingClasses] = await Promise.all([
      prisma.module.findMany({ where: { userId: req.user.id } }),
      prisma.class.findMany({ where: { userId: req.user.id } })
    ]);

    const modByCode = new Map(existingModules.map(m => [m.code.trim().toLowerCase(), m]));
    const clsByCode = new Map(existingClasses.map(c => [c.code.trim().toLowerCase(), c]));

    const createdModules = [];
    const createdClasses = [];
    const touchedModuleIds = new Set();
    const touchedClassIds = new Set();

    // Clear this user's existing weekly timetable before inserting the new schedule
    await prisma.timetableEntry.deleteMany({ where: { userId: req.user.id } });

    const importedEntries = [];

    for (const item of parsedRows) {
      // 1. Auto-fill Module if not present
      const modKey = item.moduleCode.trim().toLowerCase();
      let mod = modByCode.get(modKey);
      if (!mod) {
        mod = await prisma.module.create({
          data: {
            userId: req.user.id,
            code: item.moduleCode,
            name: item.moduleName || item.moduleCode,
            programme: item.programme,
            status: 'active'
          }
        });
        modByCode.set(modKey, mod);
        createdModules.push(mod);
      } else if (item.moduleName && (mod.name === mod.code || !mod.name)) {
        mod = await prisma.module.update({
          where: { id: mod.id },
          data: { name: item.moduleName }
        });
        modByCode.set(modKey, mod);
      }
      touchedModuleIds.add(mod.id);

      // 2. Auto-fill Class if not present
      const clsKey = item.classCode.trim().toLowerCase();
      let cls = clsByCode.get(clsKey);
      if (!cls) {
        cls = await prisma.class.create({
          data: {
            userId: req.user.id,
            code: item.classCode,
            programme: item.programme,
            year: item.year,
            semester: item.semester
          }
        });
        clsByCode.set(clsKey, cls);
        createdClasses.push(cls);
      }
      touchedClassIds.add(cls.id);

      // 3. Create Timetable Entry
      const entry = await prisma.timetableEntry.create({
        data: {
          userId: req.user.id,
          dayOfWeek: item.dayOfWeek,
          moduleId: mod.id,
          classId: cls.id,
          programme: item.programme,
          startTime: item.startTime,
          endTime: item.endTime,
          hasTransport: item.hasTransport,
          remarks: item.remarks
        }
      });
      importedEntries.push(entry);
    }

    // 4. Auto-populate Sessions for the selected month & year
    let sessionsCreated = 0;
    let sessionsSkipped = 0;
    let sessionsReplaced = 0;
    if (autoPopulate && importedEntries.length > 0) {
      const pop = await populateMonthSessions(req.user.id, targetYear, targetMonth, importedEntries, replaceExisting);
      sessionsCreated = pop.created;
      sessionsSkipped = pop.skipped;
      sessionsReplaced = pop.replaced;
    }

    res.json({
      imported: importedEntries.length,
      modulesCreated: createdModules.length,
      modulesTotal: touchedModuleIds.size,
      classesCreated: createdClasses.length,
      classesTotal: touchedClassIds.size,
      sessionsCreated,
      sessionsSkipped,
      sessionsReplaced,
      autoPopulated: autoPopulate,
      month: targetMonth,
      monthName: MONTHS[targetMonth - 1],
      year: targetYear,
      createdModules: createdModules.map(m => ({ id: m.id, code: m.code, name: m.name })),
      createdClasses: createdClasses.map(c => ({ id: c.id, code: c.code, programme: c.programme })),
      errors
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Download blank timetable template (now includes MODULE NAME so auto-fill captures full names)
router.get('/template', auth, async (req, res) => {
  try {
    const [modules, classes] = await Promise.all([
      prisma.module.findMany({ where: { userId: req.user.id, status: 'active' } }),
      prisma.class.findMany({ where: { userId: req.user.id } })
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Timetable');
    ws.columns = [
      { header: 'DAY OF WEEK', key: 'day', width: 14 },
      { header: 'MODULE CODE', key: 'moduleCode', width: 16 },
      { header: 'MODULE NAME', key: 'moduleName', width: 30 },
      { header: 'CLASS CODE', key: 'class', width: 18 },
      { header: 'PROGRAMME', key: 'prog', width: 12 },
      { header: 'START TIME', key: 'start', width: 12 },
      { header: 'END TIME', key: 'end', width: 12 },
      { header: 'TRANSPORT (Yes/No)', key: 'transport', width: 20 },
      { header: 'REMARKS', key: 'remarks', width: 20 },
    ];
    const hRow = ws.getRow(1);
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } };
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const examples = [
      ['Monday', 'COU 07202', 'Computer Architecture', 'BENG24BEBE-2', 'DEGREE', '14:00', '17:00', 'No', 'Lecture'],
      ['Monday', 'COU 07202', 'Computer Architecture', 'BENG24BEBE-2', 'DEGREE', '18:00', '21:00', 'No', 'Evening'],
      ['Wednesday', 'CSEU 07203', 'Data Structures & Algorithms', 'BENG23EE-1', 'DEGREE', '09:00', '12:00', 'Yes', 'Lab'],
    ];
    examples.forEach(e => ws.addRow(e));

    const info = wb.addWorksheet('Reference');
    info.getCell('A1').value = 'VALID DAYS'; info.getCell('A1').font = { bold: true };
    DAYS.slice(1).forEach((d, i) => info.getCell(`A${i + 2}`).value = d);
    info.getCell('C1').value = 'EXISTING MODULES (AUTO-CREATED IF NEW)'; info.getCell('C1').font = { bold: true };
    modules.forEach((m, i) => { info.getCell(`C${i + 2}`).value = m.code; info.getCell(`D${i + 2}`).value = m.name; });
    info.getCell('F1').value = 'EXISTING CLASSES (AUTO-CREATED IF NEW)'; info.getCell('F1').font = { bold: true };
    classes.forEach((c, i) => info.getCell(`F${i + 2}`).value = c.code);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="timetable_template.xlsx"');
    await wb.xlsx.write(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Populate sessions for a given month from timetable
router.post('/populate', auth, async (req, res) => {
  try {
    const monthNum = parseInt(req.body.month, 10);
    const yearNum = parseInt(req.body.year, 10);
    const replaceExisting = req.body.replaceExisting === true || req.body.replaceExisting === 'true';
    if (!monthNum || monthNum < 1 || monthNum > 12 || !yearNum) {
      return res.status(400).json({ error: 'Valid month and year are required' });
    }
    const entries = await prisma.timetableEntry.findMany({ where: { userId: req.user.id } });
    if (!entries.length) {
      return res.status(400).json({ error: 'No timetable entries found. Please upload your timetable first.' });
    }

    const { created, skipped, replaced } = await populateMonthSessions(req.user.id, yearNum, monthNum, entries, replaceExisting);

    const msg = replaceExisting && replaced > 0
      ? `Replaced ${replaced} existing session(s) and created ${created} new session(s)`
      : `Created ${created} session(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ''}`;

    res.json({
      created,
      skipped,
      replaced,
      message: msg
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
