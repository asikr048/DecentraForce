import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
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

    if (req.method === 'PUT') {
      const { type, items } = req.body;

      const allowedTypes = ['courses', 'mentors', 'testimonials'];
      if (!type || !allowedTypes.includes(type)) {
        return res.status(400).json({ success: false, error: 'Invalid type. Must be one of: courses, mentors, testimonials' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Items array is required and must not be empty' });
      }

      // Validate each item has id and sort_order
      for (const item of items) {
        if (item.id === undefined || item.sort_order === undefined) {
          return res.status(400).json({ success: false, error: 'Each item must have id and sort_order' });
        }
      }

      // Perform updates in a transaction
      await query('BEGIN');
      try {
        for (const item of items) {
          await query(
            `UPDATE ${type} SET sort_order = $1 WHERE id = $2`,
            [item.sort_order, item.id]
          );
        }
        await query('COMMIT');
      } catch (updateError) {
        await query('ROLLBACK');
        throw updateError;
      }

      return res.status(200).json({ success: true, message: 'Order updated' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin Reorder API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};