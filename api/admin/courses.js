import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Verify admin session
    const sessionToken = req.cookies?.session_token;
    if (!sessionToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const adminCheck = await query(
      `SELECT id FROM users WHERE session_token = $1 AND session_expires > NOW() AND is_admin = TRUE`,
      [sessionToken]
    );
    if (adminCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });

    if (req.method === 'GET') {
      const result = await query(`
        SELECT c.*, COUNT(uc.user_id)::int AS enrolled_count
        FROM courses c
        LEFT JOIN user_courses uc ON uc.course_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);
      return res.status(200).json({ success: true, courses: result.rows });
    }

    if (req.method === 'POST') {
      const { title, description, thumbnail_url, video_url, modules, is_active } = req.body;
      if (!title) return res.status(400).json({ success: false, error: 'Title required' });

      const result = await query(
        `INSERT INTO courses (title, description, thumbnail_url, video_url, modules, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [title, description || '', thumbnail_url || '', video_url || '', modules || '[]', is_active !== false]
      );
      return res.status(201).json({ success: true, course: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const { id, title, description, thumbnail_url, video_url, modules, is_active } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Course ID required' });

      const result = await query(
        `UPDATE courses SET title=$1, description=$2, thumbnail_url=$3, video_url=$4, modules=$5, is_active=$6
         WHERE id=$7 RETURNING *`,
        [title, description, thumbnail_url, video_url, modules, is_active, id]
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

// THIS IS CRITICAL: Increases the payload limit to allow Base64 Image strings
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};