require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const authRoutes = require('./routes/auth');
const lecturerRoutes = require('./routes/lecturer');
const moduleRoutes = require('./routes/modules');
const classRoutes = require('./routes/classes');
const sessionRoutes = require('./routes/sessions');
const claimRoutes = require('./routes/claims');
const reportRoutes = require('./routes/reports');
const timetableRoutes = require('./routes/timetable');
const adminRoutes = require('./routes/admin');

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use('/api/auth', authRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/admin', adminRoutes);

async function seedSuperAdmin() {
  try {
    const adminEmail = 'admin@dit.ac.tz';
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const hashed = await bcrypt.hash('AdminPassword123!', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Super Administrator',
          email: adminEmail,
          password: hashed,
          role: 'SUPER_ADMIN'
        }
      });
      await prisma.lecturer.create({
        data: {
          userId: user.id,
          name: 'Super Administrator',
          department: 'ICT & ADMINISTRATION',
          accountName: 'Super Administrator'
        }
      });
      console.log('Super Admin seeded successfully: admin@dit.ac.tz / AdminPassword123!');
    } else if (existing.role !== 'SUPER_ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'SUPER_ADMIN' }
      });
      console.log('Upgraded existing admin@dit.ac.tz account to SUPER_ADMIN role');
    }
  } catch (err) {
    console.error('Error seeding super admin:', err.message);
  }
}

async function loadViteModule() {
  const candidates = [
    path.join(__dirname, '../../node_modules/vite/dist/node/index.js'),
    path.join(__dirname, '../../frontend/node_modules/vite/dist/node/index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return await import(pathToFileURL(p).href);
    }
  }
  return await import('vite');
}

async function startServer() {
  const frontendDir = path.join(__dirname, '../../frontend');
  const frontendDist = path.join(frontendDir, 'dist');
  const useStaticDist = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(frontendDist, 'index.html'));

  if (!useStaticDist) {
    try {
      const { createServer: createViteServer } = await loadViteModule();
      const vite = await createViteServer({
        root: frontendDir,
        configFile: path.join(frontendDir, 'vite.config.js'),
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Mounted Vite middleware for fast dev serving');
    } catch (err) {
      console.warn('Vite middleware unavailable, falling back to static dist:', err.message);
      app.use(express.static(frontendDist));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
        res.sendFile(path.join(frontendDist, 'index.html'));
      });
    }
  } else {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  await seedSuperAdmin();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DIT Claims Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
