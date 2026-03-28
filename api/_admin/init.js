import { query, getPool } from '../../lib/db.js';
import bcrypt from 'bcrypt';

/**
 * ONE-TIME admin setup endpoint.
 * GET /api/admin/init
 *
 * - Creates the admin user (asikrac@gmail.com / asikasik) if not present
 * - Adds is_admin column, courses table, user_courses table
 * - Deletes itself from being useful after first run via a DB flag
 *
 * AFTER running this once, DELETE this file from your repo.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  try {
    const pool = await getPool();

    // 1. Add is_admin column safely
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    `);

    // 2. Create courses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        thumbnail_url TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        modules JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create user_courses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_courses (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        granted_by INTEGER REFERENCES users(id),
        granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, course_id)
      );
    `);

    // 4. Upsert admin user
    const ADMIN_EMAIL    = 'asikrac@gmail.com';
    const ADMIN_PASSWORD = 'asikasik';
    const ADMIN_USERNAME = 'Admin';

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );

    let action;
    if (existing.rows.length > 0) {
      // Update existing user → make admin, fix password hash
      await pool.query(
        `UPDATE users
         SET password_hash = $1, is_admin = TRUE, verified = TRUE, username = $2
         WHERE email = $3`,
        [hashedPassword, ADMIN_USERNAME, ADMIN_EMAIL]
      );
      action = 'updated';
    } else {
      // Create fresh admin user
      await pool.query(
        `INSERT INTO users (username, email, password_hash, is_admin, verified)
         VALUES ($1, $2, $3, TRUE, TRUE)`,
        [ADMIN_USERNAME, ADMIN_EMAIL, hashedPassword]
      );
      action = 'created';
    }

    return res.status(200).json({
      success: true,
      message: `✅ Admin setup complete! User ${action}.`,
      instructions: [
        '1. Go to /login.html',
        '2. Login with asikrac@gmail.com / asikasik',
        '3. You will be redirected to /admin.html',
        '⚠️  DELETE the file api/admin/init.js from your repo after this!'
      ]
    });

  } catch (err) {
    console.error('Admin init error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export const config = {
  api: { bodyParser: false }
};
