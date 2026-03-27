import { query } from '../../lib/db.js';

/**
 * Session verification API endpoint
 * GET /api/auth/verify
 * 
 * This endpoint verifies if the user has a valid session cookie
 * and returns user information if logged in.
 * 
 * Response:
 * - 200: User is logged in (returns user data)
 * - 401: No valid session (user is not logged in)
 * - 500: Server error
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
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

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    // Get session token from cookies
    const cookies = req.headers.cookie || '';
    const sessionTokenMatch = cookies.match(/session_token=([^;]+)/);
    
    if (!sessionTokenMatch) {
      return res.status(401).json({
        success: false,
        error: 'No session token found',
        loggedIn: false
      });
    }

    const sessionToken = sessionTokenMatch[1];

    // Find user by session token
    const result = await query(
      `SELECT id, username, email, created_at, verified, session_expires 
       FROM users 
       WHERE session_token = $1 AND session_expires > NOW()`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        loggedIn: false
      });
    }

    const user = result.rows[0];

    // Return user information
    return res.status(200).json({
      success: true,
      message: 'User is logged in',
      loggedIn: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        verified: user.verified
      }
    });

  } catch (error) {
    console.error('Session verification error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// For Vercel serverless functions
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};