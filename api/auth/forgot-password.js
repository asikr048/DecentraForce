import { query } from '../../lib/db.js';

/**
 * Forgot password API endpoint
 * POST /api/auth/forgot-password
 *
 * Request body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Response:
 * - 200: PIN sent successfully (even if email doesn't exist, for security)
 * - 400: Invalid request
 * - 500: Server error
 *
 * This endpoint generates a 6-digit PIN and sends it via email using EmailJS.
 * The PIN is stored in the database with an expiration time (10 minutes).
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
    const { email } = req.body;

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

    // Check if user exists
    const userResult = await query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // For security, we always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (userResult.rows.length === 0) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      // Still return success to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a reset PIN has been sent.'
      });
    }

    const user = userResult.rows[0];

    // Generate a 6-digit PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store PIN in database
    // First, delete any existing PINs for this user
    await query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [user.id]
    );

    // Create password_reset_tokens table if it doesn't exist
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (tableError) {
      console.log('Table creation error (might already exist):', tableError.message);
    }

    // Insert new PIN
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, pin, pinExpires]
    );

    console.log(`Password reset PIN for ${email}: ${pin} (expires: ${pinExpires})`);

    // Send email using EmailJS
    try {
      // EmailJS configuration
      const serviceId = 'service_wn7dn1f';
      const templateId = 'template_2067o6n';
      const publicKey = 'TxlilKkHJZDum1C5v';
      
      // Prepare email data
      const emailData = {
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: email,
          pin: pin,
          username: user.username,
          app_name: 'DecentraForce',
          reset_link: `https://decentraforce.com/reset-password?email=${encodeURIComponent(email)}&pin=${pin}`
        }
      };

      // Send email using EmailJS REST API
      const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });

      if (emailResponse.ok) {
        console.log(`Password reset email sent to ${email}`);
        return res.status(200).json({
          success: true,
          message: 'A 6-digit PIN has been sent to your email. Please check your inbox.',
          // In development, we might return the PIN for testing
          pin: process.env.NODE_ENV === 'development' ? pin : undefined
        });
      } else {
        const errorText = await emailResponse.text();
        console.error('EmailJS error:', errorText);
        // Even if email fails, we don't want to reveal that to the user
        // for security reasons (email enumeration)
        return res.status(200).json({
          success: true,
          message: 'If an account exists with this email, a reset PIN has been sent.'
        });
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Even if email fails, we don't want to reveal that to the user
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a reset PIN has been sent.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}