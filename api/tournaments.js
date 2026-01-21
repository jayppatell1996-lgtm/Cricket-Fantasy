// API: Tournaments
import { getDb, generateId } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  try {
    if (req.method === 'GET') {
      // Get all active tournaments
      const result = await db.execute(
        'SELECT * FROM tournaments WHERE is_active = 1 ORDER BY start_date ASC'
      );

      const tournaments = result.rows.map(t => ({
        id: t.id,
        name: t.name,
        shortName: t.short_name,
        type: t.type,
        startDate: t.start_date,
        endDate: t.end_date,
        teams: JSON.parse(t.teams || '[]'),
        description: t.description,
        isTest: Boolean(t.is_test),
        isActive: Boolean(t.is_active)
      }));

      return res.status(200).json({ success: true, tournaments });
    }

    if (req.method === 'POST') {
      // Create a new tournament (admin only)
      const { id, name, shortName, type, startDate, endDate, teams, description, isTest } = req.body;

      const tournamentId = id || generateId();

      await db.execute({
        sql: `INSERT INTO tournaments (id, name, short_name, type, start_date, end_date, teams, description, is_test, is_active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
        args: [tournamentId, name, shortName, type, startDate, endDate, JSON.stringify(teams), description, isTest ? 1 : 0]
      });

      return res.status(201).json({ success: true, tournamentId });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Tournaments API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
