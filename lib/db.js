import { Pool } from 'pg';

/**
 * Database connection pool for PostgreSQL (compatible with Vercel Postgres, Neon, and standard PostgreSQL)
 * Environment variables required:
 * - POSTGRES_URL: Connection string for PostgreSQL
 * - POSTGRES_PRISMA_URL: Alternative connection string
 * - POSTGRES_URL_NON_POOLING: Non-pooling connection string
 * - POSTGRES_USER: Database username
 * - POSTGRES_HOST: Database host
 * - POSTGRES_PASSWORD: Database password
 * - POSTGRES_DATABASE: Database name
 * 
 * For Neon: Use the connection string provided by Neon dashboard
 * For Vercel Postgres: Use the connection string provided by Vercel
 */

let pool;

/**
 * Initialize or get the database connection pool
 * @returns {Promise<import('pg').Pool>} Database pool
 */
export async function getPool() {
  if (!pool) {
    // Check for required environment variables
    if (!process.env.POSTGRES_URL) {
      console.warn('POSTGRES_URL environment variable is not set. Using local development fallback.');
      // For local development, you can set a mock or use a local connection
      // In production on Vercel/Neon, this will be automatically set
    }
    
    // Determine which connection string to use
    let connectionString = process.env.POSTGRES_URL;
    
    // If no POSTGRES_URL, try to construct from individual components
    if (!connectionString) {
      const user = process.env.POSTGRES_USER || 'default';
      const password = process.env.POSTGRES_PASSWORD || '';
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || '5432';
      const database = process.env.POSTGRES_DATABASE || 'decentraforce_local';
      
      connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
    
    // Parse the connection string to extract components for Pool config
    const url = new URL(connectionString);
    
    pool = new Pool({
      user: url.username || process.env.POSTGRES_USER || 'default',
      password: url.password || process.env.POSTGRES_PASSWORD || '',
      host: url.hostname || process.env.POSTGRES_HOST || 'localhost',
      port: url.port || process.env.POSTGRES_PORT || '5432',
      database: url.pathname.slice(1) || process.env.POSTGRES_DATABASE || 'decentraforce_local',
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false,
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test the connection
    try {
      const client = await pool.connect();
      console.log('Database connection established successfully');
      client.release();
    } catch (error) {
      console.error('Failed to connect to the database:', error.message);
      throw error;
    }
  }
  
  return pool;
}

/**
 * Execute a SQL query with parameters
 * @param {string} text SQL query text
 * @param {any[]} params Query parameters
 * @returns {Promise<import('pg').QueryResult>} Query result
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
 *//**
 * Initialize the database schema (create tables if they don't exist)
 * This should be run once when setting up the application
 */
export async function initDatabase() {
  try {
    const pool = await getPool();
    
    // 1. Drop the incorrect table so we can rebuild it properly
    await pool.query(`DROP TABLE IF EXISTS sessions CASCADE;`);
    await pool.query(`DROP TABLE IF EXISTS users CASCADE;`);
    
    // 2. Create users table with ALL the columns your API expects
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
    
    // 3. Create password_reset_tokens table (required for forgot password)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database schema initialized successfully with correct columns');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

/**
 * Close the database connection pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}