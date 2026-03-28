import { query } from '../../lib/db.js';

/**
 * Admin: Grant or revoke course access for a user
 * POST   /api/admin/grant-access   - grant access  { user_id, course_id }
 * DELETE /api/admin/grant-access   - revoke access { user_id, course_id }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Verify admin session
  const sessionToken = req.cookies?.session_token;
  if (!sessionToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const adminCheck = await query(
    `SELECT id FROM users WHERE session_token = $1 AND session_expires > NOW() AND is_admin = TRUE`,
    [sessionToken]
  );
  if (adminCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });

  const adminId = adminCheck.rows[0].id;
  const { user_id, course_id } = req.body;

  if (!user_id || !course_id) {
    return res.status(400).json({ success: false, error: 'user_id and course_id are required' });
  }

  if (req.method === 'POST') {
    // Grant access (upsert)
    await query(
      `INSERT INTO user_courses (user_id, course_id, granted_by, granted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [user_id, course_id, adminId]
    );
    return res.status(200).json({ success: true, message: 'Access granted' });
  }

  if (req.method === 'DELETE') {
    await query(
      `DELETE FROM user_courses WHERE user_id=$1 AND course_id=$2`,
      [user_id, course_id]
    );
    return res.status(200).json({ success: true, message: 'Access revoked' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
