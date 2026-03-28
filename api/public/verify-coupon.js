import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.body;
    // Auto-create table just in case it doesn't exist yet so it doesn't crash
    await query(`CREATE TABLE IF NOT EXISTS coupons (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, discount_percent INT, created_at TIMESTAMP DEFAULT NOW())`);
    
    const result = await query('SELECT discount_percent FROM coupons WHERE code = $1', [code.toUpperCase().trim()]);
    
    if (result.rows.length > 0) {
      return res.status(200).json({ success: true, discount: result.rows[0].discount_percent });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid or expired coupon' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}