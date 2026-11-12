/**
 * HostelCare — HTTP Server Entrypoint
 * Architecture: Environment loader, HTTP listener, and graceful process management
 */

require('dotenv').config();
const http = require('http');
const app = require('./backend/src/app');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`  HOSTELCARE — HOSTEL MAINTENANCE SYSTEM READY      `);
  console.log('====================================================');
  console.log(`  Environment  : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Local URL    : http://localhost:${PORT}`);
  console.log(`  Network URL  : http://${HOST}:${PORT}`);
  console.log(`  API Health   : http://localhost:${PORT}/api/health`);
  console.log(`  Static App   : Serving from /frontend`);
  console.log('====================================================');
});

// Graceful Shutdown Handlers
const handleShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down HostelCare gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close if graceful shutdown takes longer than 5 seconds
  setTimeout(() => {
    console.error('Forceful shutdown triggered after timeout.');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

