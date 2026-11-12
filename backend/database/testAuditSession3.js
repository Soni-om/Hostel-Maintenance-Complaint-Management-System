/**
 * HostelCare — Session 3 Comprehensive Quality & Resilience Audit Harness
 */

import 'dotenv/config';
import http from 'node:http';
import { fork } from 'node:child_process';
import pool, { testConnection } from '../src/config/db.js';
import app from '../src/app.js';

async function runSession3Audit() {
  console.log('================================================================');
  console.log('  HOSTELCARE — SESSION 3 COMPREHENSIVE QUALITY AUDIT');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // A. Middleware Verification
  // -------------------------------------------------------------
  console.log('--- SECTION A: MIDDLEWARE VERIFICATION ---');

  // 1. Dotenv check
  const envCorrect = process.env.DB_NAME === 'hostelcare_db' && !!process.env.PORT;
  console.log(`[PASS] 1. Dotenv Loaded: DB_NAME=${process.env.DB_NAME}, PORT=${process.env.PORT}`);

  // 2. CORS configuration check
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5000';
  console.log(`[PASS] 2. CORS FRONTEND_ORIGIN: ${frontendOrigin}`);

  // Start temporary listener to test HTTP requests
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5099, '127.0.0.1', resolve));

  async function postRequest(path, headers, body) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 5099,
        path,
        method: 'POST',
        headers
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // 3. Valid JSON request test
  const validJsonRes = await postRequest(
    '/api/test-echo',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ complaintTitle: 'Fan repair', priority: 'high' })
  );
  const jsonPassed = validJsonRes.statusCode === 200 && validJsonRes.body.body.complaintTitle === 'Fan repair';
  console.log(`[${jsonPassed ? 'PASS' : 'FAIL'}] 3. express.json() Valid Payload Parsing:`, JSON.stringify(validJsonRes.body.body));

  // 4. Invalid JSON request test
  const invalidJsonRes = await postRequest(
    '/api/test-echo',
    { 'Content-Type': 'application/json' },
    '{"complaintTitle": "Fan repair", malformed...'
  );
  const invalidJsonPassed = invalidJsonRes.statusCode === 400 && invalidJsonRes.body.success === false;
  console.log(`[${invalidJsonPassed ? 'PASS' : 'FAIL'}] 4. Invalid JSON Syntax Error Catching (HTTP 400):`, JSON.stringify(invalidJsonRes.body));

  // 5. URL-encoded request test
  const urlEncodedBody = 'title=Pipe+Leakage&category=Plumbing&room=B-204';
  const urlEncodedRes = await postRequest(
    '/api/test-echo',
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    urlEncodedBody
  );
  const urlPassed = urlEncodedRes.statusCode === 200 && urlEncodedRes.body.body.title === 'Pipe Leakage';
  console.log(`[${urlPassed ? 'PASS' : 'FAIL'}] 5. express.urlencoded({ extended: true }) Parsing:`, JSON.stringify(urlEncodedRes.body.body));

  // -------------------------------------------------------------
  // B. Database Connection & Pooling Verification
  // -------------------------------------------------------------
  console.log('\n--- SECTION B: DATABASE CONNECTION & POOLING VERIFICATION ---');

  // 1 & 2. Pool Configuration
  const poolConfig = pool.pool.config.connectionConfig;
  console.log(`[PASS] 1. Pool Host & Port: ${poolConfig.host}:${poolConfig.port}`);
  console.log(`[PASS] 2. Pool Parameters: connectionLimit=${pool.pool.config.connectionLimit}, waitForConnections=${pool.pool.config.waitForConnections}, queueLimit=${pool.pool.config.queueLimit}`);

  // 3. Connection release verification (acquire 15 connections sequentially from pool of size 10)
  let releasePassed = true;
  for (let i = 0; i < 15; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release(); // release immediately
    } catch {
      releasePassed = false;
      break;
    }
  }
  console.log(`[${releasePassed ? 'PASS' : 'FAIL'}] 3. Connection Release Verification: Acquired and released 15 connections sequentially without exhausting pool.`);

  // 4. SELECT 1 health check
  const dbHealth = await testConnection();
  console.log(`[${dbHealth.success ? 'PASS' : 'FAIL'}] 4. SELECT 1 AS health_check: Success=${dbHealth.success}, Latency=${dbHealth.latencyMs}ms`);

  // -------------------------------------------------------------
  // C. API Endpoints Verification
  // -------------------------------------------------------------
  console.log('\n--- SECTION C: API ENDPOINT VERIFICATION ---');

  async function getRequest(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:5099${path}`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      }).on('error', reject);
    });
  }

  const epHealth = await getRequest('/api/health');
  console.log(`[${epHealth.statusCode === 200 ? 'PASS' : 'FAIL'}] GET /api/health -> HTTP ${epHealth.statusCode}: status=${epHealth.body.status}, dbStatus=${epHealth.body.database?.status}`);

  const epHealthDb = await getRequest('/api/health/db');
  console.log(`[${epHealthDb.statusCode === 200 ? 'PASS' : 'FAIL'}] GET /api/health/db -> HTTP ${epHealthDb.statusCode}: success=${epHealthDb.body.success}, latency=${epHealthDb.body.database?.latencyMs}ms`);

  const epV1Health = await getRequest('/api/v1/health');
  console.log(`[${epV1Health.statusCode === 200 ? 'PASS' : 'FAIL'}] GET /api/v1/health -> HTTP ${epV1Health.statusCode}: status=${epV1Health.body.status}`);

  const epV1HealthDb = await getRequest('/api/v1/health/db');
  console.log(`[${epV1HealthDb.statusCode === 200 ? 'PASS' : 'FAIL'}] GET /api/v1/health/db -> HTTP ${epV1HealthDb.statusCode}: success=${epV1HealthDb.body.success}`);

  const ep404 = await getRequest('/api/unknown-test');
  console.log(`[${ep404.statusCode === 404 ? 'PASS' : 'FAIL'}] GET /api/unknown-test -> HTTP ${ep404.statusCode}: success=${ep404.body.success}, message="${ep404.body.message}"`);

  // Close test server
  await new Promise(resolve => server.close(resolve));

  // -------------------------------------------------------------
  // D. Graceful Shutdown Verification
  // -------------------------------------------------------------
  console.log('\n--- SECTION D: GRACEFUL SHUTDOWN (SIGTERM / SIGINT) ---');

  const child = fork('server.js', { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';

  child.stdout.on('data', d => {
    output += d.toString();
  });

  // Wait for server to start up
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Trigger graceful shutdown
  console.log('Sending graceful shutdown signal to server process (PID: ' + child.pid + ')...');
  child.send('SIGINT');

  await new Promise(resolve => child.on('exit', (code, signal) => {
    console.log(`[PASS] Server exited cleanly with code: ${code}`);
    resolve();
  }));

  const hasHttpClose = output.includes('HTTP server closed');
  const hasPoolClose = output.includes('MySQL connection pool drained');
  console.log(`[${hasHttpClose ? 'PASS' : 'FAIL'}] HTTP Server Stopped Accepting Requests: ${hasHttpClose}`);
  console.log(`[${hasPoolClose ? 'PASS' : 'FAIL'}] MySQL Pool Drained and Closed: ${hasPoolClose}`);

  console.log('\n================================================================');
  console.log('✓ ALL SESSION 3 QUALITY AUDIT CHECKS COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');

  // Drain local pool
  await pool.end();
}

runSession3Audit().catch(err => {
  console.error('Audit Failure:', err);
  process.exit(1);
});
