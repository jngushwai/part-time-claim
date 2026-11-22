const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'dit-claims-secret-2024';

function serializeUser(user) {
  const role = authMiddleware.isSuperAdmin(user) ? 'SUPER_ADMIN' : (user.role || 'TEACHER');
  return { id: user.id, name: user.name, email: user.email, role };
}

function signToken(user) {
  const payload = serializeUser(user);
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: cleanEmail, password: hashed, role: 'TEACHER' }
    });
    await prisma.lecturer.create({
      data: { userId: user.id, name: user.name, accountName: user.name }
    });
    const token = signToken(user);
    res.json({ token, user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ token, user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const cleanEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      const randomPassword = await bcrypt.hash(Math.random().toString(), 10);
      user = await prisma.user.create({
        data: {
          name: (name || cleanEmail.split('@')[0]).trim(),
          email: cleanEmail,
          password: randomPassword,
          role: 'TEACHER'
        }
      });
      await prisma.lecturer.create({
        data: { userId: user.id, name: user.name, accountName: user.name }
      });
    }
    const token = signToken(user);
    res.json({ token, user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword || '', user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
