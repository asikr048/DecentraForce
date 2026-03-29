import { query } from '../../lib/db.js';
import bcrypt from 'bcrypt';

/**
 * Password reset API endpoint
 * POST /api/auth/reset-password
 *
 * Request body for PIN verification:
 * {
 *   "email": "user@example.com",
 *   "pin": "123456"
 * }
 *
 * Request body for password reset (after PIN verification):
 * {
 *   "email": "user@example.com",
 *   "pin": "123456",
 *   "newPassword": "newSecurePassword123"
 * }
 *
 * Response:
 * - 200: Password reset successful
 * - 400: Invalid PIN, expired PIN, or weak password
 * - 404: User not found
 * - 500: Server error
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { email, pin, newPassword } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate PIN
    if (!pin || typeof pin !== 'string' || pin.length !== 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'Valid 6-digit PIN is required'
      });
    }

    // Check if user exists
    const userResult = await query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if PIN is valid and not expired
    const pinResult = await query(
      `SELECT id, token, expires_at 
       FROM password_reset_tokens 
       WHERE user_id = $1 AND token = $2 AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, pin]
    );

    if (pinResult.rows.length === 0) {
      // Check if PIN exists but expired
      const expiredPinResult = await query(
        `SELECT id FROM password_reset_tokens 
         WHERE user_id = $1 AND token = $2`,
        [user.id, pin]
      );

      if (expiredPinResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'PIN has expired. Please request a new one.'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid PIN. Please check and try again.'
        });
      }
    }

    const pinRecord = pinResult.rows[0];

    // If newPassword is provided, update the password
    if (newPassword) {
      // Validate password strength
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters long'
        });
      }

      // Hash the new password with bcrypt
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      console.log(`Password reset for user ${email}`);
      
      // Update user password with hash
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hashedPassword, user.id]
      );

      // Delete the used PIN
      await query(
        'DELETE FROM password_reset_tokens WHERE id = $1',
        [pinRecord.id]
      );

      return res.status(200).json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
      });
    } else {
      // PIN verification only - return success
      return res.status(200).json({
        success: true,
        message: 'PIN verified successfully. You can now set a new password.',
        verified: true
      });
    }

  } catch (error) {
    console.error('Password reset error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}