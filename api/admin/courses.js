import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const sessionToken = req.cookies?.session_token;
    if (!sessionToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const adminCheck = await query(
      `SELECT id FROM users WHERE session_token = $1 AND session_expires > NOW() AND is_admin = TRUE`,
      [sessionToken]
    );
    if (adminCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });

    if (req.method === 'GET') {
      // BULLETPROOF FIX: We use a SQL CASE statement to check the length of the image string.
      // If it is over 2,000,000 characters (2MB), we return an empty string instead of crashing Vercel.
      const result = await query(`
        SELECT
          c.id, c.title, c.description, c.video_url, c.modules, c.is_active, c.created_at,
          c.price, c.whatsapp, c.status,
          CASE
            WHEN length(c.thumbnail_url) > 2000000 THEN ''
            ELSE c.thumbnail_url
          END as thumbnail_url,
          COUNT(uc.user_id)::int AS enrolled_count
        FROM courses c
        LEFT JOIN user_courses uc ON uc.course_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);
      return res.status(200).json({ success: true, courses: result.rows });
    }

    if (req.method === 'POST') {
      const { title, description, thumbnail_url, video_url, price, whatsapp, modules, is_active, status } = req.body;
      if (!title) return res.status(400).json({ success: false, error: 'Title required' });
      if (price === undefined || price === null) return res.status(400).json({ success: false, error: 'Price required' });
      if (!whatsapp) return res.status(400).json({ success: false, error: 'WhatsApp group link required' });

      const result = await query(
        `INSERT INTO courses (title, description, thumbnail_url, video_url, price, whatsapp, modules, is_active, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING *`,
        [title, description || '', thumbnail_url || '', video_url || '', price, whatsapp, modules || '{}', is_active !== false, status || 'upcoming']
      );
      return res.status(201).json({ success: true, course: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const { id, title, description, thumbnail_url, video_url, price, whatsapp, modules, is_active, status } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Course ID required' });
      if (price === undefined || price === null) return res.status(400).json({ success: false, error: 'Price required' });
      if (!whatsapp) return res.status(400).json({ success: false, error: 'WhatsApp group link required' });

      const result = await query(
        `UPDATE courses SET title=$1, description=$2, thumbnail_url=$3, video_url=$4, price=$5, whatsapp=$6, modules=$7::jsonb, is_active=$8, status=$9
         WHERE id=$10 RETURNING *`,
        [title, description, thumbnail_url, video_url, price, whatsapp, modules, is_active, status || 'upcoming', id]
      );
      return res.status(200).json({ success: true, course: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Course ID required' });
      await query('DELETE FROM courses WHERE id=$1', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allows incoming compressed images
    },
  },
};