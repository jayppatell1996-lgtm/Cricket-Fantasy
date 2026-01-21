/**
 * API Route: Database Health Check
 * GET /api/health
 * 
 * Tests database connectivity and returns status.
 */

import { createClient } from '@libsql/client';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checks = {
    env: {
      hasDbUrl: !!process.env.TURSO_DATABASE_URL,
      hasAuthToken: !!process.env.TURSO_AUTH_TOKEN,
      dbUrlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 20) + '...' || 'not set'
    },
    database: null,
    tables: null
  };

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({
      success: false,
      error: 'Database credentials not configured',
      checks
    });
  }

  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Test basic connectivity
    const testResult = await db.execute('SELECT 1 as test');
    checks.database = { connected: true, test: testResult.rows[0]?.test === 1 };

    // Get table counts
    const tables = ['users', 'tournaments', 'leagues', 'fantasy_teams', 'players', 'roster', 'draft_picks'];
    const tableCounts = {};
    
    for (const table of tables) {
      try {
        const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
        tableCounts[table] = result.rows[0]?.count || 0;
      } catch (err) {
        tableCounts[table] = `Error: ${err.message}`;
      }
    }
    
    checks.tables = tableCounts;

    return res.status(200).json({
      success: true,
      message: 'Database connection healthy',
      checks,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    checks.database = { connected: false, error: error.message };
    
    return res.status(500).json({
      success: false,
      error: 'Database connection failed',
      checks,
      timestamp: new Date().toISOString()
    });
  }
}
