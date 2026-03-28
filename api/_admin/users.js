import { query } from '../../lib/db.js';

/**
 * Admin: Get all users + their course access
 * GET /api/admin/users
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Verify admin session
  const sessionToken = req.cookies?.session_token;
  if (!sessionToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const adminCheck = await query(
    `SELECT id, email FROM users WHERE session_token = $1 AND session_expires > NOW() AND is_admin = TRUE`,
    [sessionToken]
  );
  if (adminCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });

  if (req.method === 'GET') {
    const result = await query(`
      SELECT u.id, u.username, u.email, u.created_at, u.verified,
        COALESCE(
          json_agg(
            json_build_object('course_id', uc.course_id, 'title', c.title, 'granted_at', uc.granted_at)
          ) FILTER (WHERE uc.course_id IS NOT NULL),
          '[]'
        ) AS courses
      FROM users u
      LEFT JOIN user_courses uc ON uc.user_id = u.id
      LEFT JOIN courses c ON c.id = uc.course_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return res.status(200).json({ success: true, users: result.rows });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
