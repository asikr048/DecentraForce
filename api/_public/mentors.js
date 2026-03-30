import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const result = await query(`
      SELECT *
      FROM mentors
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);
    return res.status(200).json({ success: true, mentors: result.rows });
  } catch (error) {
    console.error('Public Mentors API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}