/**
 * HostelCare — Express Application Initialization & Middleware Stack
 * Architecture: REST API Layer, Static Frontend Serving, Health Probes, and Centralized Error Handling
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { testConnection } from './config/db.js';
import authRoutes from './routes/authRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ==========================================
// 1. Core Global Middleware
// ==========================================

// Cross-Origin Resource Sharing
const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Diagnostic Request Logger (Development Mode)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ==========================================
// 2. Static File Serving & Uploads Guard
// ==========================================

// Serve frontend static assets (HTML, CSS, JS, images)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// Uploads Access Guard: Direct public access to student photographs is forbidden
app.use('/uploads', (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Access Denied: Direct public access to complaint attachments is forbidden. Authentication and authorization required.'
  });
});

// ==========================================
// 3. Health Check Routes (App & Database)
// ==========================================
const apiPrefix = process.env.API_PREFIX || '/api/v1';

/**
 * Health check handler that performs a live SELECT 1 probe against MySQL
 */
async function handleHealthCheck(req, res) {
  const dbHealth = await testConnection();
  const isHealthy = dbHealth.success;
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    application: 'HostelCare',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: isHealthy ? 'connected' : 'disconnected',
      latencyMs: dbHealth.latencyMs,
      database: isHealthy ? (dbHealth.database || 'hostelcare_db') : undefined,
      ...(!isHealthy && { message: 'Database service is temporarily unavailable' })
    }
  });
}

/**
 * Dedicated database health check handler
 */
async function handleDbHealthCheck(req, res) {
  const dbHealth = await testConnection();
  const statusCode = dbHealth.success ? 200 : 503;

  return res.status(statusCode).json({
    success: dbHealth.success,
    database: {
      status: dbHealth.success ? 'connected' : 'disconnected',
      latencyMs: dbHealth.latencyMs,
      targetDatabase: dbHealth.success ? (dbHealth.database || 'hostelcare_db') : undefined,
      ...(!dbHealth.success && { message: 'Database service is temporarily unreachable' })
    },
    timestamp: new Date().toISOString()
  });
}

// Health Check Endpoints
app.get('/api/health', handleHealthCheck);
app.get('/api/health/db', handleDbHealthCheck);
app.get(`${apiPrefix}/health`, handleHealthCheck);
app.get(`${apiPrefix}/health/db`, handleDbHealthCheck);

// Middleware Echo Diagnostic Endpoint (Verifies express.json and express.urlencoded)
app.post('/api/test-echo', (req, res) => {
  return res.status(200).json({
    success: true,
    contentType: req.headers['content-type'],
    body: req.body
  });
});

// Root route handler: serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==========================================
// 4. Feature Routes (Authentication & Identity)
// ==========================================
app.use('/api/auth', authRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);

// ==========================================
// 5. Centralized 404 Route Handler
// ==========================================
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found on HostelCare server.`
  });
});

// ==========================================
// 6. Centralized Error Handling Middleware
// ==========================================
app.use((err, req, res, next) => {
  // Handle invalid/malformed JSON syntax from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload received. Request body syntax is malformed.'
    });
  }

  console.error('Unhandled Server Error:', err);
  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
    // Never expose stack trace in production environments
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
