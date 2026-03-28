import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Verify admin
    const sessionToken = req.cookies?.session_token;
    if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });
    const adminCheck = await query(`SELECT id FROM users WHERE session_token = $1 AND is_admin = TRUE`, [sessionToken]);
    if (adminCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });

    // Auto-create table if missing
    await query(`CREATE TABLE IF NOT EXISTS coupons (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, discount_percent INT, created_at TIMESTAMP DEFAULT NOW())`);

    if (req.method === 'GET') {
      const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
      return res.status(200).json({ success: true, coupons: result.rows });
    }
    
    if (req.method === 'POST') {
      const { code, discount } = req.body;
      await query('INSERT INTO coupons (code, discount_percent) VALUES ($1, $2)', [code.toUpperCase().trim(), parseInt(discount)]);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      await query('DELETE FROM coupons WHERE id = $1', [req.body.id]);
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}