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
        FROM mentors
        ORDER BY sort_order ASC, id ASC
      `);
      return res.status(200).json({ success: true, mentors: result.rows });
    }

    if (req.method === 'POST') {
      const {
        name_bn, name_en, title_bn, title_en, bio_bn, bio_en,
        image_url, twitter_url, linkedin_url, github_url,
        is_active, sort_order
      } = req.body;

      if (!name_bn || !name_en) {
        return res.status(400).json({ success: false, error: 'name_bn and name_en are required' });
      }

      let finalSortOrder = sort_order;
      if (finalSortOrder === undefined || finalSortOrder === null) {
        const maxResult = await query('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM mentors');
        finalSortOrder = maxResult.rows[0].max_sort + 1;
      }

      const result = await query(
        `INSERT INTO mentors (
          name_bn, name_en, title_bn, title_en, bio_bn, bio_en,
          image_url, twitter_url, linkedin_url, github_url,
          is_active, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          name_bn, name_en, title_bn || '', title_en || '',
          bio_bn || '', bio_en || '',
          image_url || '', twitter_url || '', linkedin_url || '', github_url || '',
          is_active !== false, finalSortOrder
        ]
      );
      return res.status(201).json({ success: true, mentor: result.rows[0] });
    }

    if (req.method === 'PUT') {
      const {
        id, name_bn, name_en, title_bn, title_en, bio_bn, bio_en,
        image_url, twitter_url, linkedin_url, github_url,
        is_active, sort_order
      } = req.body;

      if (!id) return res.status(400).json({ success: false, error: 'Mentor ID required' });
      if (!name_bn || !name_en) {
        return res.status(400).json({ success: false, error: 'name_bn and name_en are required' });
      }

      const result = await query(
        `UPDATE mentors SET
          name_bn=$1, name_en=$2, title_bn=$3, title_en=$4, bio_bn=$5, bio_en=$6,
          image_url=$7, twitter_url=$8, linkedin_url=$9, github_url=$10,
          is_active=$11, sort_order=$12
        WHERE id=$13
        RETURNING *`,
        [
          name_bn, name_en, title_bn || '', title_en || '',
          bio_bn || '', bio_en || '',
          image_url || '', twitter_url || '', linkedin_url || '', github_url || '',
          is_active !== false, sort_order || 0,
          id
        ]
      );
      return res.status(200).json({ success: true, mentor: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'Mentor ID required' });
      await query('DELETE FROM mentors WHERE id=$1', [id]);
      return res.status(200).json({ success: true, message: 'Mentor deleted' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin Mentors API Error:', error);
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