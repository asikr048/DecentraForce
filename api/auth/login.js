import { query } from '../../lib/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

/**
 * User login API endpoint
 * POST /api/auth/login
 *
 * Request body (accepts either email or username):
 * {
 *   "email": "user@example.com",
 *   "username": "johndoe"
 * }
 *
 * Response:
 * - 200: Login successful (user exists)
 * - 400: Invalid request or user not found
 * - 500: Server error
 *
 * Note: This implementation supports both email and username login.
 * It creates a session token and sets it as an HTTP-only cookie.
 */

// Rate limiting configuration
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

export default async function handler(req, res) {
  // Apply rate limiting
  await new Promise((resolve, reject) => {
    loginLimiter(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    const { email, password } = req.body;
    
    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate password
    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
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

    // Find user by email
    const result = await query(
      'SELECT id, username, email, created_at, verified FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // User not found
      return res.status(400).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check if user is verified (optional - you might want to allow login without verification)
    if (!user.verified) {
      // Allow login but show verification warning
      console.log(`User ${user.email} logged in but not verified`);
    }

    // TODO: In a real implementation, you would verify the password hash
    // Verify password with bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate a secure session token using crypto
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    // Store session token in database
    await query(
      'UPDATE users SET session_token = $1, session_expires = $2 WHERE id = $3',
      [sessionToken, sessionExpires, user.id]
    );

    // Set HTTP-only secure cookies
    res.setHeader('Set-Cookie', [
      `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Strict; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}HttpOnly`
    ]);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        verified: user.verified
      },
      // For development, also return token in response (not in production)
      sessionToken: process.env.NODE_ENV === 'development' ? sessionToken : undefined,
      redirectUrl: '/' // Redirect to home page after login
    });

  } catch (error) {
    console.error('Login error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// For Vercel serverless functions, we need to export the handler
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};