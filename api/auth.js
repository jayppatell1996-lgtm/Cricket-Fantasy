// API: Authentication (Login + Signup)
// POST /api/auth?action=signup
// POST /api/auth?action=login

import { createClient } from '@libsql/client';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;
  const db = getDb();

  try {
    // SIGNUP
    if (action === 'signup') {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }

      // Check if user already exists
      const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
        args: [email]
      });

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Create new user
      const userId = generateId();
      const passwordHash = hashPassword(password);
      const isAdmin = email.toLowerCase() === 'admin@t20fantasy.com';

      await db.execute({
        sql: `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) 
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [userId, email.toLowerCase(), passwordHash, name]
      });

      return res.status(201).json({
        success: true,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name,
          isAdmin,
          createdAt: new Date().toISOString()
        }
      });
    }

    // LOGIN
    if (action === 'login') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Find user
      const result = await db.execute({
        sql: 'SELECT id, email, password_hash, name, created_at FROM users WHERE LOWER(email) = LOWER(?)',
        args: [email]
      });

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      // Verify password
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Update last login
      await db.execute({
        sql: "UPDATE users SET updated_at = datetime('now') WHERE id = ?",
        args: [user.id]
      });

      const isAdmin = user.email.toLowerCase() === 'admin@t20fantasy.com';

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin,
          createdAt: user.created_at
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=signup or ?action=login' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
}
