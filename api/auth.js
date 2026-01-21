// API: Authentication (Signup & Login)
// /api/auth?action=signup - Register new user
// /api/auth?action=login - Login existing user

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

// Simple password hashing (use bcrypt in production)
function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash_${password}_${Math.abs(hash) % 100}`;
}

function verifyPassword(password, hash) {
  return hash === hashPassword(password);
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

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();
  const { action } = req.query;
  const { email, password, name } = req.body;

  try {
    // ============================================
    // SIGNUP
    // ============================================
    if (action === 'signup') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Check if user exists
      const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [email.toLowerCase()]
      });

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Create user
      const userId = generateId();
      const passwordHash = hashPassword(password);
      const isAdmin = email.toLowerCase() === 'admin@t20fantasy.com';

      await db.execute({
        sql: `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [userId, email.toLowerCase(), passwordHash, name || email.split('@')[0]]
      });

      return res.status(201).json({
        success: true,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          isAdmin
        }
      });
    }

    // ============================================
    // LOGIN
    // ============================================
    if (action === 'login') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await db.execute({
        sql: 'SELECT id, email, password_hash, name FROM users WHERE email = ?',
        args: [email.toLowerCase()]
      });

      if (result.rows.length === 0) {
        // User doesn't exist - auto-create for easier testing
        const userId = generateId();
        const passwordHash = hashPassword(password);
        const isAdmin = email.toLowerCase() === 'admin@t20fantasy.com';

        await db.execute({
          sql: `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [userId, email.toLowerCase(), passwordHash, name || email.split('@')[0]]
        });

        return res.status(200).json({
          success: true,
          user: {
            id: userId,
            email: email.toLowerCase(),
            name: email.split('@')[0],
            isAdmin
          }
        });
      }

      const user = result.rows[0];
      
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid password' });
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
          isAdmin
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=signup or ?action=login' });

  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
