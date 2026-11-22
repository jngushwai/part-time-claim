import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { MONTHS, currentMonth, currentYear } from '../utils/format';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const emptyForm = { moduleId: '', classId: '', programme: 'DEGREE', hours: '', startTime: '', endTime: '', hasTransport: false, remarks: '' };

function getDaysInMonth(year, month) {
  const days = [];
  const total = new Date(year, month, 0).getDate();
  for (let d = 1; d <= total; d++) {
    const str = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    days.push({ d, str, dow: new Date(year, month - 1, d).getDay() });
  }
  return days;
}

export default function Timetable() {
  const [entries, setEntries] = useState([]);
  const [modules, setModules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showPopulate, setShowPopulate] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [autoPopulate, setAutoPopulate] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [populating, setPopulating] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const navigate = useNavigate();
  const toast = useToast();

  const loadAll = () => {
    api.get('/timetable').then(r => setEntries(r.data)).catch(console.error);
    api.get('/modules').then(r => setModules(r.data)).catch(console.error);
    api.get('/classes').then(r => setClasses(r.data)).catch(console.error);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const set = k => e => setForm(p => ({ ...p, [k]: e.type === 'checkbox' ? e.target.checked : e.target.value }));

  const saveEntry = async e => {
    e.preventDefault();
    if (selectedDates.size === 0) { toast('Select at least one date', 'error'); return; }
    if (!form.hours && (!form.startTime || !form.endTime)) { toast('Enter hours or start/end time', 'error'); return; }
    try {
      const r = await api.post('/sessions/bulk', { ...form, dates: [...selectedDates].sort() });
      toast(`${r.data.created} session(s) added${r.data.skipped ? `, ${r.data.skipped} skipped` : ''}`);
      setShowAdd(false);
      setForm(emptyForm);
      setSelectedDates(new Set());
    } catch (err) { toast(err.response?.data?.error || 'Error saving', 'error'); }
  };

  const deleteEntry = async id => {
    try { await api.delete(`/timetable/${id}`); toast('Entry removed'); loadAll(); }
    catch { toast('Error deleting', 'error'); }
  };

  const clearAll = async () => {
    try { await api.delete('/timetable'); toast('Timetable cleared'); setShowClearConfirm(false); setImportSummary(null); loadAll(); }
    catch { toast('Error clearing', 'error'); }
  };

  const handleImport = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('month', String(month));
    fd.append('year', String(year));
    fd.append('autoPopulate', autoPopulate ? 'true' : 'false');
    try {
      const r = await api.post('/timetable/import', fd);
      setImportSummary(r.data);
      const parts = [
        `${r.data.imported} slot(s)`,
        `${r.data.modulesCreated} new module(s)`,
        `${r.data.classesCreated} new class(es)`
      ];
      if (r.data.autoPopulated) parts.push(`${r.data.sessionsCreated} session(s) for ${r.data.monthName}`);
      toast(`Auto-filled: ${parts.join(', ')}`);
      loadAll();
    } catch (err) {
      toast(err.response?.data?.error || 'Import failed', 'error');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('dit_token');
      const res = await fetch('/api/timetable/template', { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'timetable_template.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Template downloaded');
    } catch { toast('Download failed', 'error'); }
  };

  const populate = async () => {
    setPopulating(true); setResult(null);
    try {
      const r = await api.post('/timetable/populate', { month, year });
      setResult(r.data);
      toast(r.data.message);
    } catch (err) { toast(err.response?.data?.error || 'Error populating', 'error'); }
    finally { setPopulating(false); }
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const calDays = getDaysInMonth(year, month);
  const firstDow = calDays[0]?.dow ?? 0;

  const toggleDate = str => setSelectedDates(prev => {
    const next = new Set(prev); next.has(str) ? next.delete(str) : next.add(str); return next;
  });
  const selectAllDates = () => setSelectedDates(new Set(calDays.map(d => d.str)));
  const clearDates = () => setSelectedDates(new Set());
  const toggleDow = dowIndex => {
    const matching = calDays.filter(d => d.dow === dowIndex).map(d => d.str);
    const allSel = matching.every(s => selectedDates.has(s));
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (allSel) matching.forEach(s => next.delete(s));
      else matching.forEach(s => next.add(s));
      return next;
    });
  };

  const byDay = {};
  DAYS.forEach(d => { byDay[d] = entries.filter(e => e.dayOfWeek === d); });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Step 1: Upload Weekly Timetable</h1>
          <p className="text-gray-500 text-sm">
            Upload your Excel timetable once — it automatically fills your <strong>Modules</strong>, <strong>Classes</strong>, and monthly <strong>Sessions</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="btn-secondary">⬇ Download Template</button>
          <button onClick={() => setShowAdd(true)} className="btn-secondary">+ Add Sessions Manually</button>
          {entries.length > 0 && (
            <>
              <button onClick={() => { setResult(null); setShowPopulate(true); }} className="btn-secondary">
                📅 Populate Another Month
              </button>
              <button onClick={() => setShowClearConfirm(true)} className="text-red-500 hover:text-red-700 text-sm px-3 py-2 rounded-lg hover:bg-red-50 border border-red-200 transition-colors">
                Clear All
              </button>
            </>
          )}
        </div>
      </div>

      {/* Organized Workflow Stepper */}
      <div className="card bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {[
            { num: '1', title: 'Upload Timetable', desc: 'Upload .xlsx schedule', active: true, to: '/timetable' },
            { num: '2', title: 'Auto-Fill Modules & Classes', desc: `${modules.length} modules · ${classes.length} classes`, active: modules.length > 0 || classes.length > 0, to: '/modules' },
            { num: '3', title: 'Review Sessions & PDF', desc: 'Check hours & upload attendance', active: entries.length > 0, to: '/sessions' },
            { num: '4', title: 'Generate & Submit Claim', desc: 'Submit to HOD or export Excel', active: false, to: '/claims' },
          ].map(step => (
            <button
              key={step.num}
              type="button"
              onClick={() => navigate(step.to)}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white/80 hover:bg-white border border-blue-100/80 text-left transition-colors"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                step.active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step.num}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-gray-800 truncate">{step.title}</div>
                <div className="text-gray-500 truncate">{step.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Primary Upload & Auto-Fill Card */}
      <div className="card border-2 border-dashed border-primary/30 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-gray-800">Upload Excel Timetable & Auto-Fill Everything</h2>
            <p className="text-xs text-gray-500">
              No need to pre-create Modules or Classes. Any new module or class in your Excel sheet is created automatically, and sessions are generated for the selected month.
            </p>
          </div>
          <label className={`btn-primary cursor-pointer px-5 py-3 text-sm font-semibold shadow-sm ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
            {importing ? 'Uploading & Auto-Filling…' : '⬆ Upload Timetable (.xlsx)'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100 text-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoPopulate}
              onChange={e => setAutoPopulate(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="font-medium text-gray-700">Auto-generate monthly sessions on upload for:</span>
          </label>
          <div className="flex items-center gap-2">
            <select
              className="input w-36 py-1.5 text-sm"
              value={month}
              onChange={e => setMonth(+e.target.value)}
              disabled={!autoPopulate}
            >
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              className="input w-24 py-1.5 text-sm"
              value={year}
              onChange={e => setYear(+e.target.value)}
              disabled={!autoPopulate}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Auto-Fill Import Summary Banner */}
      {importSummary && (
        <div className="card bg-green-50 border border-green-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-green-900 text-base">
                ✓ Timetable Uploaded & Auto-Filled Successfully
              </h3>
              <p className="text-xs text-green-800">
                Your modules, classes, weekly timetable, and {importSummary.monthName} {importSummary.year} sessions are ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigate('/sessions')} className="btn-primary text-xs">
                Review Sessions ({importSummary.sessionsCreated}) →
              </button>
              <button onClick={() => navigate('/claims')} className="btn-accent text-xs">
                Generate Claim →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3 border border-green-100">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Timetable Slots</div>
              <div className="text-xl font-bold text-gray-800">{importSummary.imported}</div>
              <div className="text-xs text-gray-500">Weekly teaching slots</div>
            </div>
            <button onClick={() => navigate('/modules')} className="bg-white rounded-xl p-3 border border-green-100 text-left hover:border-primary transition-colors">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Modules Auto-Filled</div>
              <div className="text-xl font-bold text-primary">
                {importSummary.modulesTotal}
                {importSummary.modulesCreated > 0 && (
                  <span className="text-xs font-semibold text-green-600 ml-1.5">+{importSummary.modulesCreated} new</span>
                )}
              </div>
              <div className="text-xs text-primary">View Modules →</div>
            </button>
            <button onClick={() => navigate('/classes')} className="bg-white rounded-xl p-3 border border-green-100 text-left hover:border-primary transition-colors">
              <div className="text-[11px] font-semibold uppercase text-gray-400">Classes Auto-Filled</div>
              <div className="text-xl font-bold text-primary">
                {importSummary.classesTotal}
                {importSummary.classesCreated > 0 && (
                  <span className="text-xs font-semibold text-green-600 ml-1.5">+{importSummary.classesCreated} new</span>
                )}
              </div>
              <div className="text-xs text-primary">View Classes →</div>
            </button>
            <button onClick={() => navigate('/sessions')} className="bg-white rounded-xl p-3 border border-green-100 text-left hover:border-primary transition-colors">
              <div className="text-[11px] font-semibold uppercase text-gray-400">
                Sessions ({importSummary.monthName})
              </div>
              <div className="text-xl font-bold text-green-700">
                {importSummary.sessionsCreated}
                {importSummary.sessionsSkipped > 0 && (
                  <span className="text-xs font-normal text-gray-500 ml-1.5">({importSummary.sessionsSkipped} existing)</span>
                )}
              </div>
              <div className="text-xs text-green-700">Open Sessions →</div>
            </button>
          </div>

          {importSummary.errors?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold">Skipped Rows ({importSummary.errors.length}):</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {importSummary.errors.map((err, idx) => <li key={idx}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Timetable grid by day */}
      {entries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Current Weekly Timetable ({entries.length} {entries.length === 1 ? 'slot' : 'slots'})
            </h2>
            <div className="flex gap-2">
              <button onClick={() => navigate('/modules')} className="text-xs font-medium text-primary hover:underline">Modules ({modules.length})</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => navigate('/classes')} className="text-xs font-medium text-primary hover:underline">Classes ({classes.length})</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => navigate('/sessions')} className="text-xs font-medium text-primary hover:underline">View Sessions →</button>
            </div>
          </div>

          {DAYS.map(day => byDay[day].length > 0 && (
            <div key={day} className="card p-0 overflow-hidden">
              <div className="bg-primary px-4 py-2 flex items-center gap-2">
                <span className="text-white font-bold text-sm">{day}</span>
                <span className="text-blue-200 text-xs">{byDay[day].length} {byDay[day].length === 1 ? 'class' : 'classes'}</span>
              </div>
              <table className="w-full">
                <tbody>
                  {byDay[day].map(e => (
                    <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-bold text-primary w-32">{e.startTime} – {e.endTime}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-800">{e.module?.name || '—'}</div>
                        <div className="text-xs text-gray-400">{e.module?.code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{e.class?.code || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.programme === 'DEGREE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{e.programme}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {e.hasTransport && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Transport</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{e.remarks}</td>
                      <td className="px-4 py-3 w-16">
                        <button onClick={() => deleteEntry(e.id)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Add Sessions Manually Modal */}
      {showAdd && (
        <Modal title="Add Sessions Manually" onClose={() => { setShowAdd(false); setSelectedDates(new Set()); }}>
          <form onSubmit={saveEntry} className="space-y-5">
            <div className="flex gap-2">
              <select className="input flex-1" value={month} onChange={e => { setMonth(+e.target.value); setSelectedDates(new Set()); }}>
                {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input w-24" value={year} onChange={e => { setYear(+e.target.value); setSelectedDates(new Set()); }}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Select Teaching Dates</label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllDates} className="text-xs text-primary hover:underline">All</button>
                  <button type="button" onClick={clearDates} className="text-xs text-gray-400 hover:underline">Clear</button>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 bg-primary text-white text-center text-xs">
                  {DOW_SHORT.map((d, i) => (
                    <button key={d} type="button" onClick={() => toggleDow(i)}
                      className="py-1.5 font-medium hover:bg-white/20 transition-colors w-full" title={`Select all ${d}s`}>{d}</button>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                  {calDays.map(({ d, str }) => (
                    <button key={str} type="button" onClick={() => toggleDate(str)}
                      className={`py-2 text-sm font-medium border border-gray-100 transition-colors ${selectedDates.has(str) ? 'bg-primary text-white' : 'hover:bg-blue-50 text-gray-700'}`}>{d}</button>
                  ))}
                </div>
              </div>
              {selectedDates.size > 0 && <p className="text-xs text-primary mt-1 font-medium">{selectedDates.size} date(s) selected</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Module</label>
                <select className="input" value={form.moduleId} onChange={set('moduleId')} required>
                  <option value="">-- Select --</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Class</label>
                <select className="input" value={form.classId} onChange={set('classId')} required>
                  <option value="">-- Select --</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Programme</label>
                <select className="input" value={form.programme} onChange={set('programme')}>
                  <option value="DEGREE">DEGREE</option>
                  <option value="OD">OD</option>
                </select>
              </div>
              <div>
                <label className="label">Hours per Session</label>
                <input className="input" type="number" min="0.5" max="12" step="0.5" value={form.hours} onChange={set('hours')} placeholder="e.g. 3" />
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">Optional: add start &amp; end time for the record</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Time</label>
                  <input className="input" type="time" value={form.startTime} onChange={set('startTime')} />
                </div>
                <div>
                  <label className="label">End Time</label>
                  <input className="input" type="time" value={form.endTime} onChange={set('endTime')} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="ttransport" checked={form.hasTransport} onChange={set('hasTransport')} className="w-4 h-4 accent-primary" />
              <label htmlFor="ttransport" className="text-sm font-medium text-gray-700">Include Transport (TZS 10,000)</label>
            </div>
            <div>
              <label className="label">Remarks (optional)</label>
              <input className="input" value={form.remarks} onChange={set('remarks')} placeholder="e.g. Lab session" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary flex-1">
                Add {selectedDates.size > 0 ? `${selectedDates.size} ` : ''}Session{selectedDates.size !== 1 ? 's' : ''}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setSelectedDates(new Set()); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Populate Another Month Modal */}
      {showPopulate && (
        <Modal title="Populate Sessions for Another Month" onClose={() => setShowPopulate(false)}>
          <div className="space-y-5">
            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
              <div className="font-bold mb-1">What will happen:</div>
              The system will look at your timetable ({entries.length} entries) and create a session for <strong>every occurrence</strong> of each day in the selected month — skipping any that already exist.
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Month</label>
                <select className="input" value={month} onChange={e => setMonth(+e.target.value)}>
                  {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <select className="input" value={year} onChange={e => setYear(+e.target.value)}>
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {result && (
              <div className={`rounded-xl p-4 text-sm ${result.created > 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200'}`}>
                <div className="font-bold text-base mb-1">{result.created > 0 ? '✓' : '⚠'} {result.message}</div>
                {result.created > 0 && (
                  <button onClick={() => { setShowPopulate(false); navigate('/sessions'); }} className="text-xs font-semibold underline mt-1">
                    Go to Sessions →
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={populate} disabled={populating} className="btn-primary flex-1 py-3">
                {populating ? 'Creating sessions…' : `Populate ${MONTHS[month-1]} ${year}`}
              </button>
              <button onClick={() => setShowPopulate(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <Modal title="Clear Timetable" onClose={() => setShowClearConfirm(false)}>
          <p className="text-gray-600 mb-6">This will remove all {entries.length} timetable entries. Your auto-filled modules, classes, and existing sessions will not be deleted.</p>
          <div className="flex gap-3">
            <button onClick={clearAll} className="btn-danger flex-1">Yes, Clear All</button>
            <button onClick={() => setShowClearConfirm(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
