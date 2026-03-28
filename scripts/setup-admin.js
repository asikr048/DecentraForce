/**
 * Run this script ONCE to set up admin account and new tables.
 * Usage: node scripts/setup-admin.js
 *
 * This will:
 *   1. Add is_admin column to users table
 *   2. Create courses table
 *   3. Create user_courses table
 *   4. Upsert the admin user (asikrac@gmail.com / asikasik)
 */

import { getPool } from '../lib/db.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function setupAdmin() {
  const pool = await getPool();

  // 1. Add is_admin column if it doesn't exist
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
  `);
  console.log('✅ is_admin column ready');

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
  console.log('✅ courses table ready');

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
  console.log('✅ user_courses table ready');

  // 4. Upsert admin user
  const ADMIN_EMAIL = 'asikrac@gmail.com';
  const ADMIN_PASSWORD = 'asikasik';
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

  if (existing.rows.length > 0) {
    // Update existing user to be admin with correct password
    await pool.query(
      `UPDATE users SET password_hash = $1, is_admin = TRUE, verified = TRUE WHERE email = $2`,
      [hashedPassword, ADMIN_EMAIL]
    );
    console.log('✅ Admin user updated');
  } else {
    // Create admin user
    await pool.query(
      `INSERT INTO users (username, email, password_hash, is_admin, verified)
       VALUES ($1, $2, $3, TRUE, TRUE)`,
      ['Admin', ADMIN_EMAIL, hashedPassword]
    );
    console.log('✅ Admin user created');
  }

  console.log('\n🎉 Admin setup complete!');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log('\nYou can now log in at /login.html and access the admin panel at /admin.html');

  process.exit(0);
}

setupAdmin().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
