# HostelCare — Session 20 Initial Project Audit & Deployment Readiness Report
**System:** Hostel Maintenance & Complaint Management System (PBL Final Submission)<br>
**Date:** 2026-11-14<br>
**Audit Phase:** Phase 1 / Phase A (Pre-Deployment Read-Only Inspection)<br>
**Baseline Git Commit:** `627560a` (`origin/main`)<br>
**Auditor Roles:** Senior Full-Stack Developer, DevOps Engineer, Software Architect, QA Specialist, PBL Project Mentor

---

## 1. Executive Summary & Audit Scope

This audit provides a comprehensive, rigorous, and evidence-based assessment of the **HostelCare** codebase prior to frontend deployment on Vercel, live end-to-end integration with the Railway backend, cross-device testing, and academic Project-Based Learning (PBL) submission preparation.

The inspection covered:
1. **Repository Structure & Configuration**: Directory hierarchy, `package.json`, environment configurations, build specifications.
2. **Frontend Architecture & Client Code**: HTML5 pages, CSS design system, Vanilla JavaScript ES6+ modules.
3. **API Client & Network Layer**: Centralized Fetch API wrappers (`api.js`), configuration resolution (`config.js`), token attachment, and error handling.
4. **Localhost & Hardcoded URI Inventory**: Comprehensive search across all files to detect runtime dependencies on local environments.
5. **Backend Security & CORS**: Cross-Origin Resource Sharing allowlists, preflight handling, trust proxy settings, rate limiting, and RBAC middleware.
6. **Authentication & Session Lifecycle**: JWT token issuance, storage, expiration handling, client-side guards, and profile synchronization.
7. **File Upload & Attachment Security**: Multer staging, MIME verification, 5MB limits, private persistent volume storage, and authenticated streaming.
8. **Documentation & Historical Records**: Existing `README.md`, API specification, test reports (Sessions 18–19), and academic report requirements.

---

## 2. Repository Architecture & Directory Structure

The project conforms to a clean modular architecture separating backend services, relational database migrations, documentation, and frontend client assets:

```text
Hostal_Anti/
├── .dockerignore                            # Container build exclusion rules
├── .env                                     # Local development environment keys
├── .env.example                             # Environment variable template
├── .env.production.example                  # Production environment configuration guide
├── .gitignore                               # Git ignore rules (node_modules, uploads, logs)
├── Dockerfile                               # Multi-stage production Alpine Node 20 LTS container
├── package.json                             # Node.js project manifest & scripts
├── package-lock.json                        # Dependency lockfile
├── railway.json                             # Railway Infrastructure as Code descriptor
├── README.md                                # Root project documentation
├── server.js                                # Application entrypoint & HTTP server boot
├── backend/
│   ├── database/
│   │   ├── schema.sql                       # Relational DDL (8 core tables)
│   │   ├── seeds.sql                        # Synthetic development seed dataset
│   │   ├── deploySchema.js                  # Cloud DDL migration & seeding runner
│   │   ├── backupDatabase.js                # Disaster recovery SQL dump export utility
│   │   └── verifySession*.js                # Automated verification suites (Sessions 5–19)
│   ├── src/
│   │   ├── app.js                           # Express app, middleware, routes, centralized error handler
│   │   ├── config/
│   │   │   └── db.js                        # MySQL connection pooling (DATABASE_URL / TLS support)
│   │   ├── controllers/
│   │   │   ├── adminController.js           # User administration & system metrics
│   │   │   ├── authController.js            # Register, login, me, and profile management
│   │   │   ├── categoryController.js        # Complaint category CRUD
│   │   │   ├── complaintController.js       # Complaint submission, listing, attachments, feedback
│   │   │   ├── staffController.js           # Staff queue, assignment, and status transitions
│   │   │   ├── statsController.js           # Aggregated dashboard metrics
│   │   │   └── userController.js            # Identity management
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js            # JWT verification & RBAC role guards
│   │   │   ├── uploadMiddleware.js          # Multer memory storage & 5MB image filter
│   │   │   └── validationMiddleware.js      # express-validator request schemas
│   │   ├── models/
│   │   │   ├── categoryModel.js             # Category SQL queries
│   │   │   ├── complaintModel.js            # Complaint lifecycle & ACID transaction queries
│   │   │   └── userModel.js                 # User identity & authentication SQL queries
│   │   ├── routes/
│   │   │   ├── adminRoutes.js               # /api/admin & /api/v1/admin
│   │   │   ├── authRoutes.js                # /api/auth & /api/v1/auth
│   │   │   ├── categoryRoutes.js            # /api/categories & /api/v1/categories
│   │   │   ├── complaintRoutes.js           # /api/complaints & /api/v1/complaints
│   │   │   ├── staffRoutes.js               # /api/staff & /api/v1/staff
│   │   │   ├── statsRoutes.js               # /api/stats & /api/v1/stats
│   │   │   └── userRoutes.js                # /api/users & /api/v1/users
│   │   └── utils/
│   │       ├── fileStorage.js               # Private persistent disk storage & path traversal guard
│   │       ├── jwt.js                       # JWT sign, verify, and claims extraction
│   │       └── ticketGenerator.js           # Collision-resistant ticket generation (HC-YYYYMMDD-XXXX)
│   └── uploads/
│       └── complaints/                      # Private directory for uploaded defect attachments
├── docs/
│   ├── api/
│   │   └── api-spec.md                      # REST API endpoints reference (22 routes)
│   ├── architecture/
│   │   ├── database-schema.md               # Entity relationship and relational table reference
│   │   ├── rbac-matrix.md                   # Role-Based Access Control matrix & Option D rules
│   │   └── system-overview.md               # Scope, architectural requirements, and constraints
│   ├── deployment/
│   │   └── backend-deployment-guide.md      # Railway cloud provisioning and recovery manual
│   └── testing/
│       ├── test-results-session18.md        # Session 18 test matrix (61 tests)
│       └── test-results-session19.md        # Session 19 test matrix (24 tests)
└── frontend/
    ├── index.html                           # Public landing portal & real-time health indicator
    ├── assets/
    │   ├── css/                             # Stylesheets (variables.css, main.css, components.css)
    │   └── js/                              # JavaScript modules (config.js, api.js, auth.js, utils.js)
    ├── css/                                 # Mirror copy of stylesheets (updated in Session 18)
    ├── js/                                  # Mirror copy of JavaScript modules
    └── pages/
        ├── admin/
        │   └── dashboard.html               # Admin portal (metrics, users, categories, complaints)
        ├── auth/
        │   ├── login.html                   # Sign-in portal with role-based routing
        │   └── register.html                # Student self-registration portal
        ├── staff/
        │   └── dashboard.html               # Staff operational queue & Option D assignment portal
        └── student/
            ├── complaints.html              # Resident complaints list & filter interface
            ├── complaint-details.html       # Ticket detail, timeline view & feedback submission
            ├── dashboard.html               # Student dashboard with live status cards
            └── new-complaint.html           # Complaint creation form with photo attachment

```

---

## 3. Detailed Component Findings

### 3.1 Frontend Assets & Asset Duplication (High Priority Finding)

- **Finding**: The repository contains two parallel directories for client assets:
  - `frontend/assets/css/` vs `frontend/css/`
  - `frontend/assets/js/` vs `frontend/js/`
- **Analysis**:
  - `frontend/index.html` and all pages in `frontend/pages/` import CSS via `/assets/css/variables.css`, `/assets/css/main.css`, and `/assets/css/components.css`.
  - Conversely, all HTML files import JavaScript via `/js/config.js`, `/js/api.js`, `/js/utils.js`, and `/js/auth.js`.
  - While `frontend/assets/js/` and `frontend/js/` are currently byte-identical, `frontend/css/main.css` and `frontend/css/components.css` were updated during Session 18 with mobile accessibility and focus ring enhancements that were **not** mirrored into `frontend/assets/css/`.
- **Impact**: Because HTML pages import `/assets/css/`, they currently load the pre-Session 18 CSS, missing some mobile responsive tweaks.
- **Recommended Action (Phase B/D)**: Synchronize `frontend/assets/css/` with `frontend/css/` so that all pages benefit from the latest responsive styling regardless of import path.

### 3.2 Dynamic API Base URL Resolution (Critical Deployment Blocker)

- **Finding**: In `frontend/js/config.js` (and `frontend/assets/js/config.js`), the function `resolveApiOrigin()` is defined as follows:
  ```javascript
  function resolveApiOrigin() {
    if (typeof window === 'undefined') return 'http://localhost:5000';
    if (window.__API_BASE_URL__) return window.__API_BASE_URL__.replace(/\/+$/, '');
    if (window.location && window.location.protocol === 'file:') return 'http://localhost:5000';
    if (window.location && window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    return 'http://localhost:5000';
  }
  ```
- **Analysis**:
  - In a unified local deployment where Express serves static files from `frontend/`, `window.location.origin` is `http://localhost:5000`, so `/api/v1` correctly reaches Express.
  - When the frontend is deployed to a static host such as **Vercel** (e.g. `https://hostelcare.vercel.app`), `window.location.origin` evaluates to `https://hostelcare.vercel.app`.
  - Since the Express backend is hosted separately on Railway (`https://backend-production-84d31806.up.railway.app`), all client API requests will target Vercel itself, resulting in `404 Not Found` for all API calls unless properly redirected.
- **Impact**: The deployed frontend on Vercel will be completely severed from the Railway backend unless `config.js` is enhanced or a Vercel reverse proxy rewrite is configured.
- **Recommended Action (Phase B)**:
  1. Update `resolveApiOrigin()` to detect known cloud hostnames (e.g. `vercel.app`) or hostnames other than `localhost` / `127.0.0.1`, and automatically return the production Railway backend URL: `https://backend-production-84d31806.up.railway.app`.
  2. Maintain `window.__API_BASE_URL__` global override support.
  3. Configure `vercel.json` rewrites (`/api/(.*)` -> `https://backend-production-84d31806.up.railway.app/api/$1`) as an additional robust defense-in-depth routing mechanism.

### 3.3 Token Trust Boundary in `api.js` (Security & Integration Finding)

- **Finding**: In `frontend/js/api.js`, `isTrustedOrigin()` checks:
  ```javascript
  function isTrustedOrigin(targetUrlStr, baseUrlStr) {
    ...
    if (targetUrl.origin === window.location.origin) return true;
    if (baseUrlStr) {
      const base = new URL(baseUrlStr, ...);
      if (targetUrl.origin === base.origin) return true;
    }
    return false;
  }
  ```
- **Analysis**:
  - The JWT Bearer token is attached to requests **only** if `isTrustedOrigin` evaluates to `true`.
  - When `CONFIG.API_BASE_URL` is set to `https://backend-production-84d31806.up.railway.app/api/v1`, `base.origin` matches the Railway domain.
  - However, in `api.js` lines 84–89, requests starting with `/api/` (such as direct endpoints) fallback to:
    ```javascript
    const origin = window.location.origin || 'http://localhost:5000';
    url = `${origin}${endpoint}`;
    ```
    On Vercel, this would target the Vercel domain instead of the Railway API.
- **Impact**: Calls to root `/api/*` endpoints would fail to attach credentials or route to the wrong host.
- **Recommended Action (Phase B)**: Update `api.js` to derive the root API origin from `window.CONFIG.API_BASE_URL` rather than `window.location.origin` when running on remote origins.

### 3.4 Backend CORS Allowlist & Railway Configuration (Security Finding)

- **Finding**: In `backend/src/app.js`, CORS is configured via:
  ```javascript
  const rawFrontendOrigin = process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || '*';
  const allowedOrigins = rawFrontendOrigin.split(',').map(o => o.trim()).filter(Boolean);
  ```
- **Analysis**:
  - In Session 19, `FRONTEND_ORIGIN` on the Railway `backend` service was set to `*` to allow preliminary probing.
  - Requirement 5 (Phase 3) strictly mandates: *"Do not use unrestricted wildcard origins in production. Allow the actual deployed frontend origin."*
- **Impact**: While functional, a wildcard CORS origin in production is a potential CSRF/credential leakage concern.
- **Recommended Action (Phase C)**: Once the Vercel deployment URL is established (e.g. `https://hostelcare-*.vercel.app`), update the Railway environment variable `FRONTEND_ORIGIN` to explicitly list:
  `https://hostelcare.vercel.app,http://localhost:5000,http://127.0.0.1:5000`
  This eliminates wildcard permissions while preserving local development capability.

### 3.5 Exhaustive Localhost & 127.0.0.1 Inventory

A comprehensive scan of the repository identified all references to `localhost` and `127.0.0.1`:

| File Path | Line(s) | Context / Code Snippet | Classification | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| `.env` | 7, 8, 11 | `FRONTEND_ORIGIN=http://localhost:5000`, `DB_HOST=localhost` | Local Config | None (local dev only, gitignored) |
| `.env.example` | 12, 13, 16 | `FRONTEND_ORIGIN=http://localhost:5000`, `DB_HOST=localhost` | Documentation Template | None (standard template) |
| `.env.production.example` | 21 | `FRONTEND_ORIGIN=https://hostelcare.vercel.app,http://localhost:5000` | Documentation Template | Verified production ready |
| `Dockerfile` | 34 | `HEALTHCHECK ... http://127.0.0.1:5000/api/health` | Container Local Healthcheck | Valid (Docker container internal probe) |
| `server.js` | 41, 43, 44 | Startup console logs (`http://localhost:${PORT}`) | Informational Logging | Valid (terminal output only) |
| `backend/src/config/db.js` | 29, 59 | Fallback default `host: 'localhost'` | Defensive Fallback | Valid (production uses `DATABASE_URL` / `MYSQLHOST`) |
| `frontend/js/config.js` | 8, 16, 22 | Fallbacks to `'http://localhost:5000'` | Client Fallback | **Needs Update**: Cloud detection required |
| `frontend/assets/js/config.js` | 8, 16, 22 | Fallbacks to `'http://localhost:5000'` | Client Fallback | **Needs Update**: Cloud detection required |
| `frontend/js/api.js` | 27, 87, 200 | Fallbacks to `'http://localhost:5000'` | Client Fallback | **Needs Update**: Sync with centralized config |
| `frontend/assets/js/api.js` | 27, 87, 200 | Fallbacks to `'http://localhost:5000'` | Client Fallback | **Needs Update**: Sync with centralized config |
| `backend/database/verifySession*.js`| Various | Integration test harness running on `127.0.0.1` | Automated Test | Valid (isolated test runners) |
| `docs/api/api-spec.md` | 3 | `Base URL: http://localhost:5000/api/v1` | Documentation | **Needs Update**: Add production URL |
| `README.md` | 150, 151 | Getting Started local URLs | Documentation | **Needs Update**: Add production live links |

### 3.6 Upload Storage & Persistent Volume Integrity

- **Finding**: Attachment files are stored in `backend/uploads/complaints/` locally, and mapped to `/app/backend/uploads` in Railway.
- **Analysis**:
  - `backend/src/utils/fileStorage.js` honors `process.env.UPLOAD_DIR`, dynamically resolving the persistent volume mount in Railway (`uploads-volume`, ID `68a07fca-...`).
  - Path traversal defense (`storageKey.includes('..')`) is implemented and verified.
  - The static route handler explicitly forbids public access to `/uploads`:
    ```javascript
    app.use('/uploads', (req, res) => {
      res.status(403).json({ success: false, code: 'FORBIDDEN_DIRECTORY', message: 'Direct access to upload directory is forbidden.' });
    });
    ```
  - Attachments are served strictly through authenticated streaming (`GET /api/complaints/:id/attachments/:attachmentId`), enforcing ownership for Students and Option D visibility for Staff.
- **Status**: **VERIFIED & SECURE**.

### 3.7 Documentation Gaps

- **Root `README.md`**: Currently outdated (written during Session 1). Lacks descriptions of Sessions 2–20, features such as RBAC Option D, status transition lifecycle, admin dashboards, cloud architecture, live Railway backend, and live Vercel frontend.
- **Deployment Documentation**: `docs/deployment/backend-deployment-guide.md` exists and covers Railway. A dedicated `docs/deployment/frontend-deployment-guide.md` is required for Vercel.
- **PBL Academic Deliverables**: The 50+ page project report (Phase 13), 18-slide presentation (Phase 14), and system diagrams (Phase 15) must be generated using authentic implementation data.

---

## 4. Deployment Readiness Checklist & Risk Assessment

| Assessment Category | Item Checked | Status | Risk / Notes |
| :--- | :--- | :--- | :--- |
| **Backend Service** | Railway Express deployment | **PASSED** | Online, deployment `4b42b731-...` active |
| **Backend Database** | Railway Managed MySQL 8.0 | **PASSED** | Online, latency 40ms, persistent storage active |
| **Database Schema** | All 8 tables & initial seeds | **PASSED** | Verified via `deploySchema.js` |
| **Backend Health** | `/api/health` & `/api/health/db` | **PASSED** | Zero credentials leaked, status 200 |
| **CORS Configuration** | Allowlist handling | **ATTENTION** | Currently wildcard (`*`); needs Vercel domain restriction |
| **Frontend Config** | Cloud API Base URL resolution | **BLOCKED** | Needs cloud origin detection before Vercel deploy |
| **CSS Consistency** | `assets/css/` vs `css/` | **ATTENTION** | Needs synchronization to include Session 18 polish |
| **Vercel Routing** | Static SPA / Multi-page routing | **PENDING** | `vercel.json` routing rules required |
| **Auth & RBAC** | JWT verification & Option D | **PASSED** | Verified in Session 19 regression suite |
| **File Storage** | Persistent volume mount | **PASSED** | Verified at `/app/backend/uploads` |
| **Git Working Tree** | Clean state, no secrets | **PASSED** | Zero secrets, `HEAD` at `627560a` |

---

## 5. Phase-by-Phase Remediation & Execution Plan

To ensure a seamless, secure, and verifiable final deployment, the subsequent phases will proceed in strict order:

1. **Phase B (Phase 2): Production API Configuration**
   - Update `frontend/js/config.js` and `frontend/assets/js/config.js` to automatically detect cloud environments (`window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'`) and route to `https://backend-production-84d31806.up.railway.app/api/v1`.
   - Update `frontend/js/api.js` and `frontend/assets/js/api.js` so that root `/api/` endpoints resolve against the configured backend origin.
   - Synchronize `frontend/assets/css/` with `frontend/css/` to preserve all Session 18 responsive improvements.
   - Create `vercel.json` with clean static rewrites and API proxies.

2. **Phase C (Phase 3): CORS Allowlist Update**
   - Configure Railway `FRONTEND_ORIGIN` to authorize the Vercel domain once generated, alongside localhost.

3. **Phase D & E (Phases 4–5): Frontend Deployment & Live Integration**
   - Deploy static frontend to Vercel.
   - Verify live communication with Railway backend.
   - Verify health checks and login from the live frontend.

4. **Phases F, G, H, I (Phases 6–10): Multi-Role & Cross-Device Live Verification**
   - Execute end-to-end Student, Staff, and Admin workflows on the live deployed system.
   - Perform security testing (IDOR, malicious uploads, unauthorized roles).
   - Test responsive viewports (Mobile, Tablet, Desktop).

5. **Phases J, K, L, M, N, O, P (Phases 11–18): Documentation, Reports & Final Deliverables**
   - Update `README.md` and API specifications.
   - Generate system diagrams (Architecture, ER, Use Case, DFD, Lifecycle).
   - Author the 50+ page PBL academic report and 18-slide presentation.
   - Final quality assurance report and Git submission verification.

---

**Audit Sign-off:**<br>
The repository architecture is sound, secure, and ready for Phase B implementation once the cloud configuration adjustments are applied.
