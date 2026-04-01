/**
 * DecentraForce — Single Serverless Function
 * All routes consolidated here to stay within Vercel Hobby (12 function) limit.
 * Route dispatch is done via req.url path matching.
 */

import { query, getPool } from '../lib/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ─── CORS helper ──────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version');
}

// ─── Admin session check ──────────────────────────────────────────────────────
async function requireAdmin(req, res) {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return null; }
  const r = await query(
    `SELECT id, email, password_hash FROM users WHERE session_token=$1 AND session_expires>NOW() AND is_admin=TRUE`,
    [token]
  );
  if (!r.rows.length) { res.status(403).json({ success: false, error: 'Forbidden' }); return null; }
  return r.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── PUBLIC: GET /api/_public/courses ─────────────────────────────────────────
async function publicCourses(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const r = await query(`
    SELECT id, title, description,
      CASE WHEN length(thumbnail_url)>2000000 THEN '' ELSE thumbnail_url END AS thumbnail_url,
      modules, created_at, price, whatsapp, status, sequence_order
    FROM courses WHERE is_active=TRUE ORDER BY COALESCE(sequence_order,9999), created_at DESC
  `);
  return res.status(200).json({ success: true, courses: r.rows });
}

// ── PUBLIC: POST /api/_public/verify-coupon ───────────────────────────────────
async function verifyCoupon(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { code } = req.body || {};
  await query(`CREATE TABLE IF NOT EXISTS coupons (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, discount_percent INT, created_at TIMESTAMP DEFAULT NOW())`);
  const r = await query('SELECT discount_percent FROM coupons WHERE code=$1', [(code||'').toUpperCase().trim()]);
  if (r.rows.length) return res.status(200).json({ success: true, discount: r.rows[0].discount_percent });
  return res.status(400).json({ success: false, error: 'Invalid or expired coupon' });
}

// ── PUBLIC: POST /api/purchases ─────────────────────────────────────
async function createPurchase(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  // Get user from session
  const token = req.cookies?.session_token;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  
  const userResult = await query(
    `SELECT id FROM users WHERE session_token=$1 AND session_expires>NOW()`,
    [token]
  );
  if (!userResult.rows.length) return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  
  const user = userResult.rows[0];
  const { course_id, sender_number, transaction_id, payment_method } = req.body || {};
  
  if (!course_id) return res.status(400).json({ success: false, error: 'Course ID required' });
  if (!sender_number) return res.status(400).json({ success: false, error: 'Sender number required' });
  if (!transaction_id) return res.status(400).json({ success: false, error: 'Transaction ID required' });
  
  // Verify course exists
  const courseResult = await query('SELECT id FROM courses WHERE id=$1', [course_id]);
  if (!courseResult.rows.length) return res.status(404).json({ success: false, error: 'Course not found' });

  // Ensure purchases table exists
  await query(`CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    sender_number VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert purchase with pending status
  const result = await query(
    `INSERT INTO purchases (user_id, course_id, sender_number, transaction_id, payment_method, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [user.id, course_id, sender_number, transaction_id, payment_method || 'unknown']
  );
  
  return res.status(201).json({ success: true, purchase: result.rows[0] });
}

// ── USER: GET /api/user/purchases ───────────────────────────────────
async function userPurchases(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  
  // Get user from session
  const token = req.cookies?.session_token;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  
  const userResult = await query(
    `SELECT id FROM users WHERE session_token=$1 AND session_expires>NOW()`,
    [token]
  );
  if (!userResult.rows.length) return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  
  const user = userResult.rows[0];
  
  // Ensure purchases table exists
  await query(`CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    sender_number VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);

  // Fetch purchases for this user, join with course details
  const r = await query(`
    SELECT p.*, c.title AS course_title, c.thumbnail_url, c.price, c.whatsapp
    FROM purchases p
    LEFT JOIN courses c ON p.course_id = c.id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC
  `, [user.id]);
  
  return res.status(200).json({ success: true, purchases: r.rows });
}

// ── ADMIN: GET/PUT /api/admin/purchases ─────────────────────────────
async function adminPurchases(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;

  // Ensure purchases table exists (self-healing — no need to visit /api/admin/init first)
  await query(`CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    sender_number VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);

  if (req.method === 'GET') {
    // Fetch purchases and join with course and user tables to get titles and names
    const r = await query(`
      SELECT p.*, c.title AS course_title, u.username AS sender_name
      FROM purchases p
      LEFT JOIN courses c ON p.course_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    return res.status(200).json({ success: true, purchases: r.rows });
  }
  
  if (req.method === 'PUT') {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ success: false, error: 'ID and status required' });
    
    // Update the purchase status
    await query('UPDATE purchases SET status = $1 WHERE id = $2', [status, id]);
    
    // If approved, automatically grant the user access to the course
    if (status === 'approved') {
      const p = await query('SELECT user_id, course_id FROM purchases WHERE id = $1', [id]);
      if (p.rows.length) {
        await query(`
          INSERT INTO user_courses (user_id, course_id, granted_by, granted_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (user_id, course_id) DO NOTHING
        `, [p.rows[0].user_id, p.rows[0].course_id, admin.id]);
      }
    }
    
    return res.status(200).json({ success: true, message: `Purchase ${status}` });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}


// ── AUTH: POST /api/auth/register ─────────────────────────────────────────────
async function authRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ success: false, error: 'username, email and password are required' });
  if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ success: false, error: 'Username must be 3-20 chars (letters, numbers, underscores)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Invalid email format' });

  const dup = await query('SELECT id FROM users WHERE email=$1 OR username=$2', [email.toLowerCase().trim(), username.toLowerCase().trim()]);
  if (dup.rows.length) return res.status(400).json({ success: false, error: 'Email or username already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = uuidv4();
  const verificationExpires = new Date(Date.now() + 24*60*60*1000);

  const r = await query(
    `INSERT INTO users (username,email,password_hash,verification_token,verification_expires)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,username,email,created_at,verified`,
    [username.toLowerCase().trim(), email.toLowerCase().trim(), passwordHash, verificationToken, verificationExpires]
  );
  return res.status(201).json({ success: true, message: 'Registration successful. Please verify your email.', user: r.rows[0] });
}

// ── AUTH: POST /api/auth/login ────────────────────────────────────────────────
async function authLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Invalid email format' });

  const r = await query(
    'SELECT id,username,email,created_at,verified,password_hash,is_admin FROM users WHERE email=$1',
    [email.toLowerCase().trim()]
  );
  if (!r.rows.length) return res.status(400).json({ success: false, error: 'Invalid email or password' });
  const user = r.rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(400).json({ success: false, error: 'Invalid email or password' });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionExpires = new Date(Date.now() + 30*24*60*60*1000);
  await query('UPDATE users SET session_token=$1,session_expires=$2 WHERE id=$3', [sessionToken, sessionExpires, user.id]);

  res.setHeader('Set-Cookie', `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Strict`);
  return res.status(200).json({
    success: true, message: 'Login successful',
    user: { id: user.id, username: user.username, email: user.email, createdAt: user.created_at, verified: user.verified, isAdmin: user.is_admin === true },
    redirectUrl: user.is_admin ? '/admin.html' : '/index.html'
  });
}

// ── AUTH: POST /api/auth/logout ───────────────────────────────────────────────
async function authLogout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const match = (req.headers.cookie || '').match(/session_token=([^;]+)/);
  if (match) await query('UPDATE users SET session_token=NULL,session_expires=NULL WHERE session_token=$1', [match[1]]);
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
  return res.status(200).json({ success: true, message: 'Logout successful', loggedIn: false });
}

// ── AUTH: GET /api/auth/verify ────────────────────────────────────────────────
async function authVerify(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const match = (req.headers.cookie || '').match(/session_token=([^;]+)/);
  if (!match) return res.status(401).json({ success: false, error: 'No session', loggedIn: false });

  const r = await query(
    `SELECT id,username,email,created_at,verified,is_admin FROM users WHERE session_token=$1 AND session_expires>NOW()`,
    [match[1]]
  );
  if (!r.rows.length) return res.status(401).json({ success: false, error: 'Invalid or expired session', loggedIn: false });
  const u = r.rows[0];
  return res.status(200).json({
    success: true, loggedIn: true,
    user: { id: u.id, username: u.username, email: u.email, createdAt: u.created_at, verified: u.verified, isAdmin: u.is_admin === true }
  });
}

// ── AUTH: POST /api/auth/forgot-password ──────────────────────────────────────
// ── AUTH: POST /api/auth/forgot-password ──────────────────────────────────────
async function authForgotPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, error: 'Valid email required' });

  const r = await query('SELECT id,username,email FROM users WHERE email=$1', [email.toLowerCase().trim()]);
  
  // If the user doesn't exist, we still pretend it succeeded to prevent email enumeration
  if (!r.rows.length) return res.status(200).json({ success: true, message: 'If an account exists, a reset PIN was sent.' });

  const user = r.rows[0];
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const pinExpires = new Date(Date.now() + 10*60*1000);

  await query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
  await query('DELETE FROM password_reset_tokens WHERE user_id=$1', [user.id]);
  await query('INSERT INTO password_reset_tokens (user_id,token,expires_at) VALUES ($1,$2,$3)', [user.id, pin, pinExpires]);

  // Send via Resend
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('Resend Error: RESEND_API_KEY env var is not set!');
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'DecentraForce <onboarding@resend.dev>',
        to: [email],
        subject: 'Your Password Reset PIN',
        html: `
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>You requested a password reset for <strong>DecentraForce</strong>.</p>
          <p>Your 6-digit reset PIN is: <strong style="font-size:24px;letter-spacing:4px">${pin}</strong></p>
          <p>This PIN expires in 10 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
          <p>Best regards,<br/>The DecentraForce Team</p>
        `
      })
    });

    const responseData = await emailRes.json();
    if (!emailRes.ok) {
      console.error('Resend Failed — HTTP', emailRes.status, ':', JSON.stringify(responseData));
    } else {
      console.log('Resend Success — Email ID:', responseData.id);
    }
  } catch(e) {
    console.error('Network Error during Resend fetch:', e.message);
  }

  // ✅ FIX: Send the success response back to the frontend
  return res.status(200).json({ success: true, message: 'Reset PIN sent successfully.' });
} // ✅ FIX: Added the missing closing brace!

// ── AUTH: POST /api/auth/reset-password ───────────────────────────────────────

// ── AUTH: POST /api/auth/reset-password ───────────────────────────────────────
async function authResetPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email, pin, newPassword } = req.body || {};
  if (!email || !pin || pin.length !== 6 || !/^\d+$/.test(pin))
    return res.status(400).json({ success: false, error: 'Valid email and 6-digit PIN required' });

  const ur = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()]);
  if (!ur.rows.length) return res.status(404).json({ success: false, error: 'User not found' });
  const userId = ur.rows[0].id;

  const pr = await query(
    `SELECT id FROM password_reset_tokens WHERE user_id=$1 AND token=$2 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,
    [userId, pin]
  );
  if (!pr.rows.length) return res.status(400).json({ success: false, error: 'Invalid or expired PIN' });

  if (newPassword) {
    if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
    await query('DELETE FROM password_reset_tokens WHERE id=$1', [pr.rows[0].id]);
    return res.status(200).json({ success: true, message: 'Password reset successfully.' });
  }
  return res.status(200).json({ success: true, verified: true, message: 'PIN verified.' });
}

// ── AUTH: GET /api/auth/verify-email ─────────────────────────────────────────
async function authVerifyEmail(req, res) {
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  const r = await query(
    `UPDATE users SET verified=TRUE,verification_token=NULL WHERE verification_token=$1 AND verification_expires>NOW() RETURNING id`,
    [token]
  );
  if (!r.rows.length) return res.status(400).json({ success: false, error: 'Invalid or expired token' });
  return res.status(200).json({ success: true, message: 'Email verified.' });
}

// ── ADMIN: GET /api/admin/init ────────────────────────────────────────────────
async function adminInit(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const pool = await getPool();
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT DEFAULT '',
    thumbnail_url TEXT DEFAULT '', video_url TEXT DEFAULT '', price NUMERIC DEFAULT 0,
    whatsapp VARCHAR(255), status VARCHAR(50) DEFAULT 'upcoming', sequence_order INT DEFAULT 9999,
    modules JSONB DEFAULT '{}', is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(255)`);
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'upcoming'`);
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS sequence_order INT DEFAULT 9999`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_courses (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,course_id))`);
// ADD THIS BLOCK RIGHT HERE:
  await pool.query(`CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    sender_number VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);


  const ADMIN_EMAIL = 'asikrac@gmail.com', ADMIN_PASS = 'asikasik', ADMIN_NAME = 'Admin';
  const hash = await bcrypt.hash(ADMIN_PASS, 12);
  const ex = await pool.query('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]);
  if (ex.rows.length) {
    await pool.query('UPDATE users SET password_hash=$1,is_admin=TRUE,verified=TRUE,username=$2 WHERE email=$3', [hash, ADMIN_NAME, ADMIN_EMAIL]);
  } else {
    await pool.query('INSERT INTO users (username,email,password_hash,is_admin,verified) VALUES ($1,$2,$3,TRUE,TRUE)', [ADMIN_NAME, ADMIN_EMAIL, hash]);
  }
  return res.status(200).json({ success: true, message: 'Setup complete. Login: asikrac@gmail.com / asikasik' });
}

// ── ADMIN: GET/POST/PUT/DELETE /api/admin/courses ─────────────────────────────
async function adminCourses(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;

  // Ensure purchases table exists
  await query(`CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    sender_number VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);

  if (req.method === 'GET') {
    const r = await query(`
      SELECT c.id,c.title,c.description,c.video_url,c.modules,c.is_active,c.created_at,
        c.price,c.whatsapp,c.status,c.sequence_order,
        CASE WHEN length(c.thumbnail_url)>2000000 THEN '' ELSE c.thumbnail_url END AS thumbnail_url,
        COUNT(uc.user_id)::int AS enrolled_count
      FROM courses c LEFT JOIN user_courses uc ON uc.course_id=c.id
      GROUP BY c.id ORDER BY COALESCE(c.sequence_order,9999),c.created_at DESC`);
    return res.status(200).json({ success: true, courses: r.rows });
  }
  if (req.method === 'POST') {
    const { title,description,thumbnail_url,video_url,price,whatsapp,modules,is_active,status,sequence_order } = req.body||{};
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    if (price==null) return res.status(400).json({ success: false, error: 'Price required' });
    if (!whatsapp) return res.status(400).json({ success: false, error: 'WhatsApp link required' });
    const r = await query(
      `INSERT INTO courses (title,description,thumbnail_url,video_url,price,whatsapp,modules,is_active,status,sequence_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *`,
      [title,description||'',thumbnail_url||'',video_url||'',price,whatsapp,modules||'{}',is_active!==false,status||'upcoming',sequence_order??9999]
    );
    return res.status(201).json({ success: true, course: r.rows[0] });
  }
  if (req.method === 'PUT') {
    const { id,title,description,thumbnail_url,video_url,price,whatsapp,modules,is_active,status,sequence_order } = req.body||{};
    if (!id) return res.status(400).json({ success: false, error: 'ID required' });
    const r = await query(
      `UPDATE courses SET title=$1,description=$2,thumbnail_url=$3,video_url=$4,price=$5,whatsapp=$6,
       modules=$7::jsonb,is_active=$8,status=$9,sequence_order=$10 WHERE id=$11 RETURNING *`,
      [title,description,thumbnail_url,video_url,price,whatsapp,modules,is_active,status||'upcoming',sequence_order??9999,id]
    );
    return res.status(200).json({ success: true, course: r.rows[0] });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body||{};
    if (!id) return res.status(400).json({ success: false, error: 'ID required' });
    await query('DELETE FROM courses WHERE id=$1', [id]);
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ── ADMIN: GET /api/admin/users ───────────────────────────────────────────────
async function adminUsers(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const r = await query(`
    SELECT u.id,u.username,u.email,u.created_at,u.verified,
      COALESCE(json_agg(json_build_object('course_id',uc.course_id,'title',c.title,'granted_at',uc.granted_at))
        FILTER (WHERE uc.course_id IS NOT NULL),'[]') AS courses
    FROM users u
    LEFT JOIN user_courses uc ON uc.user_id=u.id
    LEFT JOIN courses c ON c.id=uc.course_id
    GROUP BY u.id ORDER BY u.created_at DESC`);
  return res.status(200).json({ success: true, users: r.rows });
}

// ── ADMIN: POST/DELETE /api/admin/grant-access ────────────────────────────────
async function adminGrantAccess(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  const { user_id, course_id } = req.body||{};
  if (!user_id || !course_id) return res.status(400).json({ success: false, error: 'user_id and course_id required' });
  if (req.method === 'POST') {
    await query(`INSERT INTO user_courses (user_id,course_id,granted_by,granted_at) VALUES ($1,$2,$3,NOW())
      ON CONFLICT (user_id,course_id) DO NOTHING`, [user_id, course_id, admin.id]);
    return res.status(200).json({ success: true, message: 'Access granted' });
  }
  if (req.method === 'DELETE') {
    await query('DELETE FROM user_courses WHERE user_id=$1 AND course_id=$2', [user_id, course_id]);
    return res.status(200).json({ success: true, message: 'Access revoked' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ── USER: POST /api/user/update-profile ───────────────────────────────────────
async function userUpdateProfile(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = req.cookies?.session_token;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const userResult = await query(
    `SELECT id, username, email, password_hash FROM users WHERE session_token=$1 AND session_expires>NOW()`,
    [token]
  );
  if (!userResult.rows.length) return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  const user = userResult.rows[0];
  const { type, newUsername, newEmail, currentPassword, newPassword } = req.body || {};

  if (type === 'profile') {
    if (!newUsername || newUsername.trim().length < 2)
      return res.status(400).json({ success: false, error: 'Display name must be at least 2 characters' });
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return res.status(400).json({ success: false, error: 'Valid email required' });
    const dup = await query('SELECT id FROM users WHERE email=$1 AND id!=$2', [newEmail.toLowerCase().trim(), user.id]);
    if (dup.rows.length) return res.status(400).json({ success: false, error: 'Email already in use by another account' });
    await query('UPDATE users SET username=$1, email=$2 WHERE id=$3', [newUsername.trim(), newEmail.toLowerCase().trim(), user.id]);
    return res.status(200).json({ success: true, message: 'Profile updated successfully' });
  }

  if (type === 'password') {
    if (!currentPassword || !newPassword || newPassword.length < 8)
      return res.status(400).json({ success: false, error: 'Current password and new password (min 8 characters) required' });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), user.id]);
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  }

  return res.status(400).json({ success: false, error: 'Invalid update type' });
}

// ── ADMIN: POST /api/admin/update-profile ─────────────────────────────────────
async function adminUpdateProfile(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const admin = await requireAdmin(req, res); if (!admin) return;
  const { type, newEmail, currentPassword, newPassword } = req.body||{};
  if (type === 'email') {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return res.status(400).json({ success: false, error: 'Valid email required' });
    const dup = await query('SELECT id FROM users WHERE email=$1 AND id!=$2', [newEmail, admin.id]);
    if (dup.rows.length) return res.status(400).json({ success: false, error: 'Email already in use' });
    await query('UPDATE users SET email=$1 WHERE id=$2', [newEmail.toLowerCase().trim(), admin.id]);
    return res.status(200).json({ success: true, message: 'Email updated' });
  }
  if (type === 'password') {
    if (!currentPassword || !newPassword || newPassword.length < 8)
      return res.status(400).json({ success: false, error: 'Current password and new password (8+ chars) required' });
    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password incorrect' });
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 12), admin.id]);
    return res.status(200).json({ success: true, message: 'Password updated' });
  }
  return res.status(400).json({ success: false, error: 'Invalid type' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: MENTORS
// ═══════════════════════════════════════════════════════════════════════════════
async function publicMentors(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const result = await query(`SELECT * FROM mentors WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`);
    return res.status(200).json({ success: true, mentors: result.rows });
  } catch (error) {
    console.error('Public Mentors API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
async function publicTestimonials(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const result = await query(`SELECT * FROM testimonials WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`);
    return res.status(200).json({ success: true, testimonials: result.rows });
  } catch (error) {
    console.error('Public Testimonials API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: MENTORS
// ═══════════════════════════════════════════════════════════════════════════════
async function adminMentors(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  try {
    if (req.method === 'GET') {
      const result = await query(`SELECT * FROM mentors ORDER BY sort_order ASC, id ASC`);
      return res.status(200).json({ success: true, mentors: result.rows });
    }
    if (req.method === 'POST') {
      const { name_bn, name_en, title_bn, title_en, bio_bn, bio_en, image_url, twitter_url, linkedin_url, github_url, is_active, sort_order } = req.body||{};
      if (!name_bn || !name_en) return res.status(400).json({ success: false, error: 'name_bn and name_en are required' });
      let finalSort = sort_order;
      if (finalSort === undefined || finalSort === null) {
        const mx = await query('SELECT COALESCE(MAX(sort_order), 0) as m FROM mentors');
        finalSort = mx.rows[0].m + 1;
      }
      const result = await query(
        `INSERT INTO mentors (name_bn,name_en,title_bn,title_en,bio_bn,bio_en,image_url,twitter_url,linkedin_url,github_url,is_active,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [name_bn,name_en,title_bn||'',title_en||'',bio_bn||'',bio_en||'',image_url||'',twitter_url||'',linkedin_url||'',github_url||'',is_active!==false,finalSort]
      );
      return res.status(201).json({ success: true, mentor: result.rows[0] });
    }
    if (req.method === 'PUT') {
      const { id, name_bn, name_en, title_bn, title_en, bio_bn, bio_en, image_url, twitter_url, linkedin_url, github_url, is_active, sort_order } = req.body||{};
      if (!id) return res.status(400).json({ success: false, error: 'Mentor ID required' });
      if (!name_bn || !name_en) return res.status(400).json({ success: false, error: 'name_bn and name_en are required' });
      const result = await query(
        `UPDATE mentors SET name_bn=$1,name_en=$2,title_bn=$3,title_en=$4,bio_bn=$5,bio_en=$6,
         image_url=$7,twitter_url=$8,linkedin_url=$9,github_url=$10,is_active=$11,sort_order=$12 WHERE id=$13 RETURNING *`,
        [name_bn,name_en,title_bn||'',title_en||'',bio_bn||'',bio_en||'',image_url||'',twitter_url||'',linkedin_url||'',github_url||'',is_active!==false,sort_order||0,id]
      );
      return res.status(200).json({ success: true, mentor: result.rows[0] });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body||{};
      if (!id) return res.status(400).json({ success: false, error: 'Mentor ID required' });
      await query('DELETE FROM mentors WHERE id=$1', [id]);
      return res.status(200).json({ success: true, message: 'Mentor deleted' });
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin Mentors API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
async function adminTestimonials(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  try {
    if (req.method === 'GET') {
      const result = await query(`SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC`);
      return res.status(200).json({ success: true, testimonials: result.rows });
    }
    if (req.method === 'POST') {
      const { name_bn, name_en, role_bn, role_en, text_bn, text_en, rating, image_url, is_active, sort_order } = req.body||{};
      if (!name_bn || !name_en || !text_bn || !text_en) return res.status(400).json({ success: false, error: 'name_bn, name_en, text_bn, text_en are required' });
      let finalSort = sort_order;
      if (finalSort === undefined || finalSort === null) {
        const mx = await query('SELECT COALESCE(MAX(sort_order), 0) as m FROM testimonials');
        finalSort = mx.rows[0].m + 1;
      }
      const result = await query(
        `INSERT INTO testimonials (name_bn,name_en,role_bn,role_en,text_bn,text_en,rating,image_url,is_active,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [name_bn,name_en,role_bn||'',role_en||'',text_bn,text_en,rating||5,image_url||'',is_active!==false,finalSort]
      );
      return res.status(201).json({ success: true, testimonial: result.rows[0] });
    }
    if (req.method === 'PUT') {
      const { id, name_bn, name_en, role_bn, role_en, text_bn, text_en, rating, image_url, is_active, sort_order } = req.body||{};
      if (!id) return res.status(400).json({ success: false, error: 'Testimonial ID required' });
      if (!name_bn || !name_en || !text_bn || !text_en) return res.status(400).json({ success: false, error: 'name_bn, name_en, text_bn, text_en are required' });
      const result = await query(
        `UPDATE testimonials SET name_bn=$1,name_en=$2,role_bn=$3,role_en=$4,text_bn=$5,text_en=$6,
         rating=$7,image_url=$8,is_active=$9,sort_order=$10 WHERE id=$11 RETURNING *`,
        [name_bn,name_en,role_bn||'',role_en||'',text_bn,text_en,rating||5,image_url||'',is_active!==false,sort_order||0,id]
      );
      return res.status(200).json({ success: true, testimonial: result.rows[0] });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body||{};
      if (!id) return res.status(400).json({ success: false, error: 'Testimonial ID required' });
      await query('DELETE FROM testimonials WHERE id=$1', [id]);
      return res.status(200).json({ success: true, message: 'Testimonial deleted' });
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin Testimonials API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: REORDER
// ═══════════════════════════════════════════════════════════════════════════════
async function adminReorder(req, res) {
  const admin = await requireAdmin(req, res); if (!admin) return;
  if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const { type, items } = req.body||{};
    const allowed = ['courses', 'mentors', 'testimonials'];
    if (!type || !allowed.includes(type)) return res.status(400).json({ success: false, error: 'Invalid type. Must be: courses, mentors, or testimonials' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'Items array required' });
    for (const item of items) {
      if (item.id === undefined || item.sort_order === undefined)
        return res.status(400).json({ success: false, error: 'Each item must have id and sort_order' });
    }
    await query('BEGIN');
    try {
      for (const item of items) {
        await query(`UPDATE ${type} SET sort_order=$1 WHERE id=$2`, [item.sort_order, item.id]);
      }
      await query('COMMIT');
    } catch (e) { await query('ROLLBACK'); throw e; }
    return res.status(200).json({ success: true, message: 'Order updated' });
  } catch (error) {
    console.error('Admin Reorder API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.url.split('?')[0].replace(/\/$/, '');

  try {
    // Public
    if (path.endsWith('/_public/courses')       || path.endsWith('/public/courses'))       return await publicCourses(req, res);
    if (path.endsWith('/_public/verify-coupon') || path.endsWith('/public/verify-coupon')) return await verifyCoupon(req, res);
    if (path.endsWith('/_public/mentors')       || path.endsWith('/public/mentors'))       return await publicMentors(req, res);
    if (path.endsWith('/_public/testimonials')  || path.endsWith('/public/testimonials'))  return await publicTestimonials(req, res);

    // IMPORTANT: specific routes checked before generic /purchases to avoid endsWith overlap
    if (path.endsWith('/admin/purchases'))     return await adminPurchases(req, res);
    if (path.endsWith('/user/purchases'))      return await userPurchases(req, res);
    if (path.endsWith('/purchases'))           return await createPurchase(req, res);

    // Auth
    if (path.endsWith('/auth/register'))       return await authRegister(req, res);
    if (path.endsWith('/auth/login'))          return await authLogin(req, res);
    if (path.endsWith('/auth/logout'))         return await authLogout(req, res);
    if (path.endsWith('/auth/verify'))         return await authVerify(req, res);
    if (path.endsWith('/auth/forgot-password')) return await authForgotPassword(req, res);
    if (path.endsWith('/auth/reset-password')) return await authResetPassword(req, res);
    if (path.endsWith('/auth/verify-email'))   return await authVerifyEmail(req, res);

    // Admin (remaining)
    if (path.endsWith('/admin/init'))          return await adminInit(req, res);
    if (path.endsWith('/admin/courses'))       return await adminCourses(req, res);
    if (path.endsWith('/admin/users'))         return await adminUsers(req, res);
    if (path.endsWith('/admin/grant-access'))  return await adminGrantAccess(req, res);
    if (path.endsWith('/user/update-profile'))  return await userUpdateProfile(req, res);
    if (path.endsWith('/admin/update-profile')) return await adminUpdateProfile(req, res);
    if (path.endsWith('/admin/mentors'))       return await adminMentors(req, res);
    if (path.endsWith('/admin/testimonials'))  return await adminTestimonials(req, res);
    if (path.endsWith('/admin/reorder'))       return await adminReorder(req, res);

    return res.status(404).json({ success: false, error: `No route: ${path}` });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};