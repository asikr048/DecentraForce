import { query, initDatabase } from '../../lib/db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';

/**
 * User registration API endpoint
 * POST /api/auth/register
 *
 * Request body:
 * {
 *   "username": "johndoe",
 *   "email": "user@example.com"
 * 
 * }
 *
 * Response:
 * - 201: User created successfully
 * - 400: Invalid request or email/username already exists
 * - 500: Server error
 */

// Rate limiting configuration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 registration attempts per windowMs
  message: 'Too many registration attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export default async function handler(req, res) {
  // Apply rate limiting
  await new Promise((resolve, reject) => {
    registerLimiter(req, res, (result) => {
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
    // ADD THIS LINE:
    await initDatabase();
    const { username, email, password } = req.body;

    // Validate username
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

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

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Validate username format (alphanumeric, underscores, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
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

    // Check if username already exists
    const existingUsername = await query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );

    if (existingUsername.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }

    // Check if email already exists
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Generate verification token
    const verificationToken = uuidv4();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create new user
    const result = await query(
      `INSERT INTO users (username, email, password_hash, verification_token, verification_expires)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, created_at, verified`,
      [username.toLowerCase().trim(), email.toLowerCase().trim(), passwordHash, verificationToken, verificationExpires]
    );

    const newUser = result.rows[0];

    // In a real application, you would:
    // 1. Send verification email with the token
    // 2. Store the email sending job in a queue
    // 3. Return appropriate response

    // For now, we'll just log the token (in production, never log sensitive data)
    console.log(`New user registered: ${email}, verification token: ${verificationToken}`);

    // Return success response
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for verification.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.created_at,
        verified: newUser.verified
      },
      // In production, don't return the token to the client
      // This is just for demonstration
      verificationToken: process.env.NODE_ENV === 'development' ? verificationToken : undefined
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

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