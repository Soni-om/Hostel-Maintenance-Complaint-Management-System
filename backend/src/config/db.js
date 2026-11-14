/**
 * HostelCare — MySQL Database Connection Pooling Module
 * Uses mysql2/promise for connection pooling and parameterized query execution
 * Supports local development, cloud managed MySQL, connection URIs, and TLS/SSL encryption
 */

import mysql from 'mysql2/promise';

const databaseUri = process.env.DATABASE_URL || process.env.MYSQL_URL || null;

// SSL configuration for Cloud MySQL (e.g. Railway public proxy, Aiven, TiDB Cloud, AWS RDS)
const enableSsl = process.env.DB_SSL === 'true' ||
  process.env.MYSQL_SSL === 'true' ||
  Boolean(process.env.DB_SSL_CA);

let sslOptions = undefined;
if (enableSsl) {
  sslOptions = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
  };
  if (process.env.DB_SSL_CA) {
    sslOptions.ca = process.env.DB_SSL_CA;
  }
}

// Pool configuration
let poolConfig;
let connectionMetadata = {
  host: 'localhost',
  port: 3306,
  database: 'hostelcare_db',
  ssl: Boolean(sslOptions)
};

if (databaseUri) {
  try {
    const parsed = new URL(databaseUri);
    connectionMetadata = {
      host: parsed.hostname || 'cloud-host',
      port: parsed.port ? parseInt(parsed.port, 10) : 3306,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'hostelcare_db',
      ssl: Boolean(sslOptions) || parsed.searchParams.has('ssl')
    };
  } catch (e) {
    // URL parsing fallback
  }

  poolConfig = {
    uri: databaseUri,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ...(sslOptions && { ssl: sslOptions })
  };
} else {
  connectionMetadata = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT, 10) || 3306,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'hostelcare_db',
    ssl: Boolean(sslOptions)
  };

  poolConfig = {
    host: connectionMetadata.host,
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: connectionMetadata.database,
    port: connectionMetadata.port,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ...(sslOptions && { ssl: sslOptions })
  };
}

// Create the connection pool
const pool = mysql.createPool(poolConfig);

/**
 * Validates pool connectivity using a lightweight query (SELECT 1)
 * Safely masks all credentials and secrets
 * @returns {Promise<{ success: boolean, latencyMs: number, database: string, host: string, port: number, ssl: boolean }>}
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
        database: connectionMetadata.database,
        host: connectionMetadata.host,
        port: connectionMetadata.port,
        ssl: connectionMetadata.ssl
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
      code: error.code,
      database: connectionMetadata.database,
      host: connectionMetadata.host
    };
  }
}

export default pool;

