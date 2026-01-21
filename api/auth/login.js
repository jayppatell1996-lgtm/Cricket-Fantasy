// API: User Login
import { getDb, verifyPassword } from '../_db.js';

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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();

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

    res.setHeader('Access-Control-Allow-Origin', '*');
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

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login', details: error.message });
  }
}
