import { query } from '../../lib/db.js';

/**
 * User logout API endpoint
 * POST /api/auth/logout
 * 
 * This endpoint clears the user's session by removing the session token
 * from the database and clearing the session cookie.
 * 
 * Response:
 * - 200: Logout successful
 * - 400: Invalid request
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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Get session token from cookies
    const cookies = req.headers.cookie || '';
    const sessionTokenMatch = cookies.match(/session_token=([^;]+)/);
    
    if (sessionTokenMatch) {
      const sessionToken = sessionTokenMatch[1];
      
      // Clear session token from database
      await query(
        'UPDATE users SET session_token = NULL, session_expires = NULL WHERE session_token = $1',
        [sessionToken]
      );
    }

    // Clear cookies by setting them to expire immediately
    res.setHeader('Set-Cookie', [
      'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict',
      'user_id=; Path=/; Max-Age=0; SameSite=Strict'
    ]);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Logout successful',
      loggedIn: false
    });

  } catch (error) {
    console.error('Logout error:', error);
    
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