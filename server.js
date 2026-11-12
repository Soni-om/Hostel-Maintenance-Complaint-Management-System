/**
 * HostelCare — HTTP Server Entrypoint & Process Lifecycle Manager
 * Architecture: Environment loader, Database pool validation, HTTP listener, and graceful teardown
 */

import 'dotenv/config';
import http from 'node:http';
import app from './backend/src/app.js';
import pool, { testConnection } from './backend/src/config/db.js';

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

const server = http.createServer(app);

// Start server and validate database connectivity
async function startServer() {
  // 1. Validate Database Pool Connectivity
  console.log('Testing MySQL database pool connection...');
  const dbHealth = await testConnection();

  if (dbHealth.success) {
    console.log(`✓ MySQL Connection Pool established successfully (Database: ${dbHealth.database}, Latency: ${dbHealth.latencyMs}ms).`);
  } else {
    console.warn(`! MySQL Pool Warning: Could not connect to database on startup (${dbHealth.error}).`);
    console.warn('  The server will continue running; check your DB_HOST, DB_USER, and DB_PASSWORD in .env.');
  }

  // 2. Start HTTP Server
  server.listen(PORT, HOST, () => {
    console.log('====================================================');
    console.log(`  HOSTELCARE — HOSTEL MAINTENANCE SYSTEM READY      `);
    console.log('====================================================');
    console.log(`  Environment  : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Local URL    : http://localhost:${PORT}`);
    console.log(`  Network URL  : http://${HOST}:${PORT}`);
    console.log(`  API Health   : http://localhost:${PORT}/api/health`);
    console.log(`  DB Health    : http://localhost:${PORT}/api/health/db`);
    console.log(`  Static App   : Serving from /frontend`);
    console.log('====================================================');
  });
}

// Graceful Shutdown Handler
let isShuttingDown = false;
async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down HostelCare gracefully...`);

  // Close HTTP server
  server.close(async () => {
    console.log('✓ HTTP server closed to new connections.');

    // Close MySQL connection pool
    try {
      await pool.end();
      console.log('✓ MySQL connection pool drained and closed.');
    } catch (err) {
      console.error('Error closing MySQL pool:', err.message);
    }

    console.log('Teardown complete. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after timeout if teardown stalls
  setTimeout(() => {
    console.error('Forceful shutdown triggered after 5-second timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();
