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
      const result = await query(`
        SELECT *
        FROM testimonials
        ORDER BY sort_order ASC, id ASC
      `);
      return res.status(200).json({ success: true, testimonials: result.rows });
    }

    if (req.method === 'POST') {
      const {
        name_bn, name_en, role_bn, role_en, text_bn, text_en,
        rating, image_url, is_active, sort_order
      } = req.body;

      if (!name_bn || !name_en || !text_bn || !text_en) {
        return res.status(400).json({ success: false, error: 'name_bn, name_en, text_bn, text_en are required' });
      }

      let finalSortOrder = sort_order;
      if (finalSortOrder === undefined || finalSortOrder === null) {
        const maxResult = await query('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM testimonials');
        finalSortOrder = maxResult.rows[0].max_sort + 1;
      }

      const result = await query(
        `INSERT INTO testimonials (
          name_bn, name_en, role_bn, role_en, text_bn, text_en,
          rating, image_url, is_active, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          name_bn, name_en, role_bn || '', role_en || '',
          text_bn, text_en,
          rating || 5, image_url || '',
          is_active !== false, finalSortOrder
        ]
      );
      return res.status(201).json({ success: true, testimonial: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const {
        id, name_bn, name_en, role_bn, role_en, text_bn, text_en,
        rating, image_url, is_active, sort_order
      } = req.body;

      if (!id) return res.status(400).json({ success: false, error: 'Testimonial ID required' });
      if (!name_bn || !name_en || !text_bn || !text_en) {
        return res.status(400).json({ success: false, error: 'name_bn, name_en, text_bn, text_en are required' });
      }

      const result = await query(
        `UPDATE testimonials SET
          name_bn=$1, name_en=$2, role_bn=$3, role_en=$4, text_bn=$5, text_en=$6,
          rating=$7, image_url=$8, is_active=$9, sort_order=$10
        WHERE id=$11
        RETURNING *`,
        [
          name_bn, name_en, role_bn || '', role_en || '',
          text_bn, text_en,
          rating || 5, image_url || '',
          is_active !== false, sort_order || 0,
          id
        ]
      );
      return res.status(200).json({ success: true, testimonial: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Testimonial ID required' });
      await query('DELETE FROM testimonials WHERE id=$1', [id]);
      return res.status(200).json({ success: true, message: 'Testimonial deleted' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin Testimonials API Error:', error);
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