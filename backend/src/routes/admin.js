const router = require('express').Router();
const auth = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// All routes in this router require Super Admin
router.use(auth, auth.requireSuperAdmin);

// Super Admin Overview KPIs, chart & recent claims
router.get('/overview', async (req, res) => {
  try {
    const [teachersCount, submissions, sessionAgg] = await Promise.all([
      prisma.user.count({
        where: {
          NOT: {
            OR: [
              { role: 'SUPER_ADMIN' },
              { email: auth.SUPER_ADMIN_EMAIL }
            ]
          }
        }
      }),
      prisma.claimSubmission.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        },
        orderBy: [{ submittedAt: 'desc' }]
      }),
      prisma.session.aggregate({
        _count: { id: true },
        _sum: { hours: true }
      })
    ]);

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalClaimedAmount = 0;
    let approvedAmount = 0;
    let pendingAmount = 0;

    const monthlyMap = {};

    for (const s of submissions) {
      totalClaimedAmount += s.gross;
      if (s.status === 'Approved') {
        approvedCount++;
        approvedAmount += s.gross;
      } else if (s.status === 'Rejected') {
        rejectedCount++;
      } else {
        pendingCount++;
        pendingAmount += s.gross;
      }

      const key = `${s.year}-${String(s.month).padStart(2, '0')}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          key,
          label: `${MONTHS[s.month - 1]} ${s.year}`,
          approved: 0,
          pending: 0,
          rejected: 0,
          count: 0
        };
      }
      monthlyMap[key].count++;
      if (s.status === 'Approved') monthlyMap[key].approved += s.gross;
      else if (s.status === 'Rejected') monthlyMap[key].rejected += s.gross;
      else monthlyMap[key].pending += s.gross;
    }

    const monthlyChart = Object.values(monthlyMap)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-8);

    res.json({
      stats: {
        totalTeachers: teachersCount,
        totalSubmissions: submissions.length,
        pendingCount,
        approvedCount,
        rejectedCount,
        totalClaimedAmount,
        approvedAmount,
        pendingAmount,
        totalSessions: sessionAgg._count.id || 0,
        totalHours: sessionAgg._sum.hours || 0
      },
      monthlyChart,
      recentSubmissions: submissions.slice(0, 8)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List all teachers (normal users) with profile and activity stats
router.get('/teachers', async (req, res) => {
  try {
    const search = (req.query.q || '').trim().toLowerCase();
    const department = (req.query.department || '').trim().toLowerCase();

    const [users, sessionsByUser, modulesByUser, classesByUser] = await Promise.all([
      prisma.user.findMany({
        where: {
          NOT: {
            OR: [
              { role: 'SUPER_ADMIN' },
              { email: auth.SUPER_ADMIN_EMAIL }
            ]
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          lecturer: true,
          claimSubmissions: {
            orderBy: [{ submittedAt: 'desc' }]
          },
          monthlyAttendances: true
        },
        orderBy: [{ createdAt: 'desc' }]
      }),
      prisma.session.groupBy({
        by: ['userId'],
        _count: { id: true },
        _sum: { hours: true, gross: true }
      }),
      prisma.module.groupBy({
        by: ['userId'],
        _count: { id: true }
      }),
      prisma.class.groupBy({
        by: ['userId'],
        _count: { id: true }
      })
    ]);

    const sessionMap = Object.fromEntries(sessionsByUser.map(s => [s.userId, s]));
    const moduleMap = Object.fromEntries(modulesByUser.map(m => [m.userId, m._count.id]));
    const classMap = Object.fromEntries(classesByUser.map(c => [c.userId, c._count.id]));

    let teachers = users.map(u => {
      const sess = sessionMap[u.id];
      const subs = u.claimSubmissions || [];
      const pendingClaims = subs.filter(s => s.status === 'Pending').length;
      const approvedClaims = subs.filter(s => s.status === 'Approved').length;
      const rejectedClaims = subs.filter(s => s.status === 'Rejected').length;
      const totalClaimedGross = subs.reduce((sum, s) => sum + s.gross, 0);
      const approvedGross = subs.filter(s => s.status === 'Approved').reduce((sum, s) => sum + s.gross, 0);

      return {
        id: u.id,
        name: u.lecturer?.name || u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        department: u.lecturer?.department || 'COMPUTER STUDIES',
        academicYear: u.lecturer?.academicYear || '2024/2025',
        bank: u.lecturer?.bank || '',
        branch: u.lecturer?.branch || '',
        accountNo: u.lecturer?.accountNo || '',
        degreeRate: u.lecturer?.degreeRate ?? 15000,
        odRate: u.lecturer?.odRate ?? 10000,
        transportRate: u.lecturer?.transportRate ?? 10000,
        moduleCount: moduleMap[u.id] || 0,
        classCount: classMap[u.id] || 0,
        sessionCount: sess?._count?.id || 0,
        totalHours: sess?._sum?.hours || 0,
        totalSessionGross: sess?._sum?.gross || 0,
        attendancePdfCount: (u.monthlyAttendances || []).length,
        totalSubmissions: subs.length,
        pendingClaims,
        approvedClaims,
        rejectedClaims,
        totalClaimedGross,
        approvedGross,
        lastSubmissionAt: subs[0]?.submittedAt || null
      };
    });

    const departments = [...new Set(teachers.map(t => t.department).filter(Boolean))].sort();

    if (department && department !== 'all') {
      teachers = teachers.filter(t => (t.department || '').toLowerCase() === department);
    }
    if (search) {
      teachers = teachers.filter(t =>
        (t.name || '').toLowerCase().includes(search) ||
        (t.email || '').toLowerCase().includes(search) ||
        (t.department || '').toLowerCase().includes(search)
      );
    }

    res.json({ teachers, departments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Single teacher full profile, modules, classes, recent sessions, and submitted claims
router.get('/teachers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid teacher ID' });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        lecturer: true,
        claimSubmissions: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }]
        },
        monthlyAttendances: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }]
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'Teacher not found' });

    const [modules, classes, recentSessions, sessionAgg] = await Promise.all([
      prisma.module.findMany({ where: { userId: id }, orderBy: [{ code: 'asc' }] }),
      prisma.class.findMany({ where: { userId: id }, orderBy: [{ code: 'asc' }] }),
      prisma.session.findMany({
        where: { userId: id },
        include: { module: true, class: true },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        take: 15
      }),
      prisma.session.aggregate({
        where: { userId: id },
        _count: { id: true },
        _sum: { hours: true, gross: true }
      })
    ]);

    res.json({
      teacher: {
        id: user.id,
        name: user.lecturer?.name || user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lecturer: user.lecturer
      },
      summary: {
        sessionCount: sessionAgg._count.id || 0,
        totalHours: sessionAgg._sum.hours || 0,
        totalSessionGross: sessionAgg._sum.gross || 0,
        submissionCount: user.claimSubmissions.length,
        pendingClaims: user.claimSubmissions.filter(s => s.status === 'Pending').length,
        approvedClaims: user.claimSubmissions.filter(s => s.status === 'Approved').length
      },
      modules,
      classes,
      recentSessions,
      submissions: user.claimSubmissions,
      attendances: user.monthlyAttendances
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All submitted claims across all teachers with filtering
router.get('/claims', async (req, res) => {
  try {
    const { status, teacherId, month, year, q } = req.query;

    const where = {};
    if (status && status !== 'All') where.status = status;
    if (teacherId && teacherId !== 'all') where.userId = parseInt(teacherId, 10);
    if (month && month !== 'all') where.month = parseInt(month, 10);
    if (year && year !== 'all') where.year = parseInt(year, 10);

    const [allSubmissions, teachers] = await Promise.all([
      prisma.claimSubmission.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: [{ submittedAt: 'desc' }]
      }),
      prisma.user.findMany({
        where: {
          NOT: {
            OR: [
              { role: 'SUPER_ADMIN' },
              { email: auth.SUPER_ADMIN_EMAIL }
            ]
          }
        },
        select: { id: true, name: true, email: true, lecturer: { select: { name: true, department: true } } },
        orderBy: [{ name: 'asc' }]
      })
    ]);

    const search = (q || '').trim().toLowerCase();
    const submissions = search
      ? allSubmissions.filter(s =>
          (s.lecturerName || '').toLowerCase().includes(search) ||
          (s.user?.email || '').toLowerCase().includes(search) ||
          (s.department || '').toLowerCase().includes(search) ||
          (s.monthName || '').toLowerCase().includes(search) ||
          (s.hodName || '').toLowerCase().includes(search)
        )
      : allSubmissions;

    // Also compute overall status counts (unfiltered by status) for tab badges
    const statusCountsRaw = await prisma.claimSubmission.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    const counts = { All: 0, Pending: 0, Approved: 0, Rejected: 0 };
    for (const row of statusCountsRaw) {
      counts[row.status] = row._count.id;
      counts.All += row._count.id;
    }

    res.json({
      submissions,
      counts,
      teachers: teachers.map(t => ({
        id: t.id,
        name: t.lecturer?.name || t.name,
        email: t.email,
        department: t.lecturer?.department || 'COMPUTER STUDIES'
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
