// API: User Signup
import { getDb, generateId, hashPassword, corsHeaders } from '../_db.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const db = getDb();

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

    // Return user data (without password)
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
}
