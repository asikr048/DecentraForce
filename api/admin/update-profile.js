import { query } from '../../lib/db.js';
import bcrypt from 'bcrypt';

/**
 * Admin: Update own profile (email or password)
 * POST /api/admin/update-profile
 * Body: { type: 'email'|'password', newEmail?, currentPassword?, newPassword? }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Verify admin session
  const sessionToken = req.cookies?.session_token;
  if (!sessionToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const adminCheck = await query(
    `SELECT id, email, password_hash FROM users WHERE session_token = $1 AND session_expires > NOW() AND is_admin = TRUE`,
    [sessionToken]
  );
  if (adminCheck.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });

  const admin = adminCheck.rows[0];
  const { type, newEmail, currentPassword, newPassword } = req.body;

  if (type === 'email') {
    if (!newEmail) return res.status(400).json({ success: false, error: 'New email required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) return res.status(400).json({ success: false, error: 'Invalid email format' });

    // Check if email already taken
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, admin.id]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already in use' });

    await query('UPDATE users SET email = $1 WHERE id = $2', [newEmail.toLowerCase().trim(), admin.id]);
    return res.status(200).json({ success: true, message: 'Email updated successfully' });
  }

  if (type === 'password') {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, admin.id]);
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  }

  return res.status(400).json({ success: false, error: 'Invalid type. Use "email" or "password".' });
}
