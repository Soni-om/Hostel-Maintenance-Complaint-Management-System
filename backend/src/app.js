/**
 * HostelCare — Application Initialization & Express Middleware Stack
 * Architecture: RESTful API Layer with Static Frontend Serving
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ==========================================
// 1. Core Global Middleware
// ==========================================

// Enable Cross-Origin Resource Sharing
const corsOptions = {
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging Middleware (Development Diagnostic)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ==========================================
// 2. Static File Serving
// ==========================================

// Serve frontend static assets (HTML, CSS, JS, images)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// Serve secure public uploads (complaint images)
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ==========================================
// 3. API Base & Health Check Route
// ==========================================
const apiPrefix = process.env.API_PREFIX || '/api/v1';

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    application: 'HostelCare',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get(`${apiPrefix}/health`, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    application: 'HostelCare API',
    version: '1.0.0',
    prefix: apiPrefix,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Root route handler: serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==========================================
// 4. Future API Routes Mount Point (Sessions 3+)
// ==========================================
// app.use(`${apiPrefix}/auth`, authRoutes);
// app.use(`${apiPrefix}/complaints`, complaintRoutes);
// app.use(`${apiPrefix}/categories`, categoryRoutes);
// app.use(`${apiPrefix}/users`, userRoutes);
// app.use(`${apiPrefix}/stats`, statsRoutes);

// ==========================================
// 5. 404 & Global Error Handling
// ==========================================

// API 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found on HostelCare server.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const statusCode = err.status || err.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
    // Never expose stack trace in production
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;
