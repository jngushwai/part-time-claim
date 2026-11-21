require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const lecturerRoutes = require('./routes/lecturer');
const moduleRoutes = require('./routes/modules');
const classRoutes = require('./routes/classes');
const sessionRoutes = require('./routes/sessions');
const claimRoutes = require('./routes/claims');
const reportRoutes = require('./routes/reports');
const timetableRoutes = require('./routes/timetable');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/timetable', timetableRoutes);

// Serve frontend static files
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

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
          password: hashed
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
    }
  } catch (err) {
    console.error('Error seeding super admin:', err.message);
  }
}

seedSuperAdmin().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DIT Claims Server running at http://0.0.0.0:${PORT}`);
  });
});
