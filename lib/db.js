import { createPool } from '@vercel/postgres';

/**
 * Database connection pool for Vercel Postgres
 * Environment variables required:
 * - POSTGRES_URL: Connection string for Vercel Postgres
 * - POSTGRES_PRISMA_URL: Alternative connection string
 * - POSTGRES_URL_NON_POOLING: Non-pooling connection string
 * - POSTGRES_USER: Database username
 * - POSTGRES_HOST: Database host
 * - POSTGRES_PASSWORD: Database password
 * - POSTGRES_DATABASE: Database name
 */

let pool;

/**
 * Initialize or get the database connection pool
 * @returns {Promise<import('@vercel/postgres').Pool>} Database pool
 */
export async function getPool() {
  if (!pool) {
    // Check for required environment variables
    if (!process.env.POSTGRES_URL) {
      console.warn('POSTGRES_URL environment variable is not set. Using local development fallback.');
      // For local development, you can set a mock or use a local connection
      // In production on Vercel, this will be automatically set
    }
    
    pool = createPool({
      connectionString: process.env.POSTGRES_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  
  return pool;
}

/**
 * Execute a SQL query with parameters
 * @param {string} text SQL query text
 * @param {any[]} params Query parameters
 * @returns {Promise<import('@vercel/postgres').QueryResult>} Query result
 */
export async function query(text, params) {
  const pool = await getPool();
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Initialize the database schema (create tables if they don't exist)
 * This should be run once when setting up the application
 */
export async function initDatabase() {
  try {
    const pool = await getPool();
    
    // Create users table with username field
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(100),
        verification_expires TIMESTAMP WITH TIME ZONE,
        session_token VARCHAR(100),
        session_expires TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_verified ON users(verified);
      CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
    `);
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function testConnection() {
  try {
    const pool = await getPool();
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('Database connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}