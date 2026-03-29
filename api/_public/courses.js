import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});

  try {
    // Fetch only active courses and suppress massive image payloads (over 2MB)
    const result = await query(`
      SELECT
        id, title, description,
        CASE WHEN length(thumbnail_url) > 2000000 THEN '' ELSE thumbnail_url END as thumbnail_url,
        modules, created_at,
        price, whatsapp, status
      FROM courses
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `);
    return res.status(200).json({ success: true, courses: result.rows });
  } catch (error) {
    console.error('Public Courses API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}