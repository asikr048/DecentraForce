import { query, getPool } from '../../lib/db.js';
import bcrypt from 'bcrypt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  try {
    const pool = await getPool();

    // 1. Add is_admin column safely
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;`);

    // 2. Create courses table with all required columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        thumbnail_url TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        price NUMERIC DEFAULT 0,
        whatsapp VARCHAR(255),
        status VARCHAR(50) DEFAULT 'upcoming',
        modules JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safety checks: Add missing columns if the table was created previously without them
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(255);`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'upcoming';`);

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

    // 4. Seed Mock Courses perfectly formatted for the Admin Panel
    const courseCount = await pool.query('SELECT COUNT(*) FROM courses');
    if (parseInt(courseCount.rows[0].count) === 0) {
      
      // Helper to generate the exact JSON structure your admin.html uses
      const buildModules = (category, level, lectures, exercises, assignments) => JSON.stringify({
        content: "Welcome to this amazing DecentraForce course. You will learn everything you need to succeed in Web3.",
        lectures, exercises, assignments, category, level, curriculum: []
      });

      const mockCourses = [
        { title: 'Blockchain Fundamentals & Web3 Intro', desc: 'Grasp the core concepts of distributed ledgers, consensus mechanisms, and the decentralized web.', price: 2200, status: 'ongoing', whatsapp: 'https://chat.whatsapp.com/mock1', mod: buildModules('Blockchain', 'Beginner', 45, 12, 4) },
        { title: 'Smart Contract Development with Solidity', desc: 'Write, test, and deploy secure Ethereum smart contracts from scratch to production.', price: 2800, status: 'upcoming', whatsapp: 'https://chat.whatsapp.com/mock2', mod: buildModules('Solidity', 'Intermediate', 60, 20, 8) },
        { title: 'NFT Creation, Minting & Marketplace', desc: 'Create and launch your own NFT collection with royalties, metadata, and marketplace listings.', price: 1800, status: 'completed', whatsapp: 'https://chat.whatsapp.com/mock3', mod: buildModules('NFT', 'Beginner', 30, 8, 3) },
        { title: 'DeFi Protocols & Yield Strategy Mastery', desc: 'Deep dive into liquidity pools, AMMs, lending protocols, and advanced yield farming strategies.', price: 0, status: 'upcoming', whatsapp: 'https://chat.whatsapp.com/mock4', mod: buildModules('DeFi', 'Advanced', 80, 25, 10) }
      ];
      
      for (const c of mockCourses) {
        await pool.query(
          `INSERT INTO courses (title, description, price, status, whatsapp, modules, is_active) VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)`,
          [c.title, c.desc, c.price, c.status, c.whatsapp, c.mod]
        );
      }
    }

    // 5. Upsert admin user
    const ADMIN_EMAIL    = 'asikrac@gmail.com';
    const ADMIN_PASSWORD = 'asikasik';
    const ADMIN_USERNAME = 'Admin';

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

    let action;
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE users SET password_hash = $1, is_admin = TRUE, verified = TRUE, username = $2 WHERE email = $3`,
        [hashedPassword, ADMIN_USERNAME, ADMIN_EMAIL]
      );
      action = 'updated';
    } else {
      await pool.query(
        `INSERT INTO users (username, email, password_hash, is_admin, verified) VALUES ($1, $2, $3, TRUE, TRUE)`,
        [ADMIN_USERNAME, ADMIN_EMAIL, hashedPassword]
      );
      action = 'created';
    }

    return res.status(200).json({
      success: true,
      message: `✅ Vercel Admin setup complete! User ${action}. Real editable mock courses initialized.`,
      instructions: [
        '1. Go to /login.html',
        '2. Login with asikrac@gmail.com / asikasik',
        '3. Go to Manage Courses in the Admin Panel to edit them!'
      ]
    });

  } catch (err) {
    console.error('Admin init error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export const config = { api: { bodyParser: false } };