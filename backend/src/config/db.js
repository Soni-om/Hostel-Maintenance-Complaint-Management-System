/**
 * HostelCare — MySQL Database Connection Pooling Module
 * Uses mysql2/promise for connection pooling and parameterized query execution
 */

import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hostelcare_db',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

// Create the connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Validates pool connectivity using a lightweight query (SELECT 1)
 * @returns {Promise<{ success: boolean, latencyMs: number, database: string }>}
 */
export async function testConnection() {
  const start = Date.now();
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1 AS health_check');
      const latencyMs = Date.now() - start;
      return {
        success: true,
        latencyMs,
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    console.error('MySQL Pool Connection Error:', error.message);
    return {
      success: false,
      latencyMs,
      error: error.message,
      code: error.code
    };
  }
}

export default pool;

