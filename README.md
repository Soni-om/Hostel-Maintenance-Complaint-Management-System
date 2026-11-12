# HostelCare — Hostel Maintenance & Complaint Management System

> **A College Full-Stack Project-Based Learning (PBL) System**  
> Developed with real-world enterprise software architecture, strict security boundaries, relational data integrity, and modern SaaS aesthetics.

---

## 1. Project Overview

**HostelCare** resolves the critical breakdown in communication and tracking associated with informal hostel maintenance complaints (electrical failures, plumbing leaks, water supply outages, cleaning lapses, and room repairs). 

By providing a unified digital platform, HostelCare enables:
- **Students** to lodge complaints with photo evidence, receive an automated unique ticket (`HC-YYYYMMDD-XXXX`), track progress in real-time, and rate service quality.
- **Hostel Staff** to inspect assigned queues, prioritize critical issues, update the complaint lifecycle, and record resolution remarks.
- **Administrators** to oversee university-wide maintenance SLA, provision staff accounts, manage category masters, and access operational analytics.

---

## 2. Technology Stack

### Frontend
- **HTML5**: Semantic, accessible markup.
- **CSS3**: Custom design system, CSS variables, responsive grid/flexbox, SaaS aesthetics.
- **Vanilla JavaScript (ES6+)**: Modular client-side architecture, zero external runtime build dependencies.
- **Fetch API**: Centralized asynchronous HTTP client with automatic JWT token attachment.

### Backend
- **Node.js**: Asynchronous event-driven runtime.
- **Express.js**: Layered REST API framework.
- **Architecture**: Modular separation (Config, Routes, Controllers, Middleware, Models, Utils).

### Database & Security
- **MySQL**: Relational schema across 7 core tables with foreign keys and database transactions.
- **mysql2/promise**: Parameterized queries preventing SQL injection.
- **bcryptjs**: Salt-hashed passwords (10 rounds).
- **JSON Web Tokens (JWT)**: Stateless authentication via `Authorization: Bearer <token>`.
- **Role-Based Access Control (RBAC)**: Backend middleware guards restricting student, staff, and admin operations.
- **Multer**: Secure disk upload with MIME-type filtering, file size limits (5MB), and server-generated unique filenames.

---

## 3. Directory Structure

```text
Hostal_Anti/
├── backend/
│   ├── src/
│   │   ├── config/              # DB pool, JWT secret, constants
│   │   ├── controllers/         # Request handling & business logic
│   │   ├── middleware/          # JWT auth, role guard, validator, upload
│   │   ├── models/              # Relational SQL query models
│   │   ├── routes/              # Express API route declarations
│   │   ├── utils/               # Ticket generator, response wrappers
│   │   └── app.js               # Express application initialization & middleware
│   └── uploads/
│       └── complaints/          # Destination for uploaded complaint photos
├── docs/
│   ├── architecture/
│   │   ├── system-overview.md   # Complete system scope & architectural decisions
│   │   └── rbac-matrix.md       # Role-Based Access Control matrix
│   └── api/
│       └── api-spec.md          # 22 REST API endpoints specification
├── frontend/
│   ├── assets/
│   │   ├── css/
│   │   │   ├── variables.css    # SaaS color palette, spacing, typography tokens
│   │   │   ├── main.css         # Global reset, typography, responsive grid
│   │   │   └── components.css   # Buttons, cards, badges, forms, alerts, navbar
│   │   └── js/
│   │       ├── config.js        # Global client configurations & base URLs
│   │       ├── api.js           # Centralized Fetch API client wrapper
│   │       └── utils.js         # Date formatters, status badge renderers, toasts
│   ├── pages/
│   │   ├── auth/                # login.html, register.html
│   │   ├── student/             # dashboard.html
│   │   ├── staff/               # dashboard.html
│   │   └── admin/               # dashboard.html
│   └── index.html               # Main landing portal with live API health probe
├── .env.example                 # Template for environment variables
├── .gitignore                   # Git ignore patterns for dependencies & credentials
├── package.json                 # Project dependencies & npm scripts
├── README.md                    # Project documentation
└── server.js                    # HTTP server entrypoint & graceful shutdown
```

---

## 4. Role-Based Access Control (RBAC) Matrix

| Operation | Student | Staff | Admin |
| :--- | :---: | :---: | :---: |
| Self-Registration | ✅ | ❌ *(Admin created)* | ❌ *(System seeded)* |
| Sign In & Profile | ✅ | ✅ | ✅ |
| Lodge Complaint with Photos | ✅ | ❌ | ❌ |
| View Own Complaints | ✅ | ❌ | ❌ |
| View Assigned / Hostel Queue | ❌ | ✅ | ✅ |
| Update Status & Add Resolution Remarks | ❌ | ✅ | ✅ |
| Submit Resolution Feedback & Rating | ✅ | ❌ | ❌ |
| Manage Categories & Users | ❌ | ❌ | ✅ |
| System Performance Analytics | ❌ | ❌ | ✅ |

---

## 5. Complaint State Lifecycle

```
[Pending] ──> [Assigned] ──> [In Progress] ──> [Resolved] ──> [Closed]
                                    ^               │
                                    └──────(Reopen)─┘
```

- Every state change logs an immutable entry in `complaint_status_history`.
- Moving to `Resolved` strictly mandates staff resolution remarks.
- Reopening requires explicit reason logging.

---

## 6. Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (Current environment: v24.18.0)
- **NPM**: v9.0.0 or higher
- **MySQL**: v8.0 or higher (configured in Phase 1, Session 2)

### Installation
1. Clone the repository and navigate to root:
   ```bash
   cd Hostal_Anti
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   # Copy template to active .env
   cp .env.example .env
   ```

4. Run the development server:
   ```bash
   npm run dev
   # or standard node:
   npm start
   ```

5. Open in browser:
   - **Main Portal**: `http://localhost:5000`
   - **Health API**: `http://localhost:5000/api/health`

---

## 7. 20-Session Incremental Roadmap

- **Phase 1: Foundation & Architecture (Sessions 1–5)**
  - `Session 1`: Project Introduction, Scope, Requirements & Environment Setup *(Current)*
  - `Session 2`: MySQL Database Schema & Table Relationships
  - `Session 3`: Database Connection Pooling & Seeding
  - `Session 4`: Authentication & JWT Security Backend
  - `Session 5`: Frontend Authentication & Layout Integration
- **Phase 2: Complaint Engine & Ticketing (Sessions 6–9)**
  - `Session 6`: Complaint Data Model & Ticket Generation
  - `Session 7`: Multer Photo Attachment Handling
  - `Session 8`: Student Complaint Submission UI
  - `Session 9`: Student Complaint Tracking & Details
- **Phase 3: Staff Operations & Resolution Workflow (Sessions 10–12)**
  - `Session 10`: Staff Queue & Filtering API
  - `Session 11`: Complaint Assignment & Reassignment
  - `Session 12`: Status Transition & Resolution Remarks
- **Phase 4: Feedback, Admin & Governance (Sessions 13–16)**
  - `Session 13`: User Management & Role Provisioning
  - `Session 14`: Complaint Category Master Management
  - `Session 15`: Student Feedback & Rating System
  - `Session 16`: Analytics & Executive Dashboard
- **Phase 5: Testing, Hardening & Deployment (Sessions 17–20)**
  - `Session 17`: Form Validation & Security Audits
  - `Session 18`: Comprehensive Automated & Manual QA Test Suite
  - `Session 19`: Documentation, API Specs & PBL Report Preparation
  - `Session 20`: Final Deployment, Demo Preparation & Submission

---

## 8. Session 1 Status

- **Status**: Completed & Verified
- **Verification**: Backend starts cleanly, health probe returns `200 OK`, frontend static assets serve without errors, and Git repository initialized with clean commits.
