# HostelCare — System Architecture & Scope Document

## 1. Executive Summary

**HostelCare** is an enterprise-grade Hostel Maintenance & Complaint Management System designed to streamline informal, untracked hostel maintenance issues into a structured, trackable, and auditable digital workflow. The application connects three key stakeholders:
1. **Students** who reside in hostels and face living and maintenance challenges.
2. **Hostel Staff** (Maintenance supervisors, wardens, and technicians) who inspect, prioritize, assign, and resolve complaints.
3. **Administrators** (Chief wardens, hostel management, IT administrators) who oversee system governance, user roles, category configuration, and SLA reporting.

---

## 2. Technology Stack & Architectural Decisions

| Layer | Technology | Decision Rationale |
| :--- | :--- | :--- |
| **Frontend** | Semantic HTML5, Modular CSS3, Vanilla JavaScript (ES6+), Fetch API | Zero-build complexity, lightweight footprint, cross-browser compatibility, perfect for foundational full-stack curriculum mastery without framework obfuscation. |
| **Backend** | Node.js, Express.js | Asynchronous non-blocking I/O, robust middleware ecosystem, unified JavaScript stack, standard REST API architecture. |
| **Database** | MySQL with `mysql2/promise` | Strict relational schema, ACID transaction guarantees for financial/audit state transitions, foreign key constraints, high concurrency. |
| **Auth & Security** | JWT (JSON Web Tokens), `bcryptjs`, RBAC Middleware | Stateless authentication, cryptographically secure password storage (salt rounds 10), granular role-level route authorization. |
| **Media Storage** | `multer` | Disk storage with MIME-type inspection, extension validation, size caps (5MB), and UUID/timestamp sanitized filenames. |

---

## 3. Project Scope & Module Breakdown

### Module 1: Authentication & Identity Management
- **Public Student Registration**: Self-service onboarding for students with hostel room and block details.
- **Controlled Staff/Admin Provisioning**: Administrative creation of staff and admin accounts (preventing unauthorized elevated role registration).
- **Session & Token Management**: Secure JWT issuance with configurable expiry (`7d`), verified by Express middleware on protected routes.
- **Password Security**: Irreversible one-way hashing with `bcryptjs`.

### Module 2: Complaint Ticketing & Media Attachment
- **Unique Ticket Numbering**: Algorithmic ticket ID generation format: `HC-YYYYMMDD-XXXX` (e.g., `HC-20261112-0042`).
- **Standardized Categories**: Pre-configured categories (Electrical, Plumbing, Water Supply, Cleaning, Carpentry, Room Maintenance, Others).
- **Priority Tiers**: `Low`, `Medium`, `High`, `Urgent`.
- **Media Proof**: Secure upload of photo evidence with sanitization, restriction to `image/jpeg`, `image/png`, and `image/webp`.

### Module 3: Workflow & State Lifecycle Engine
- **Lifecycle Transition Rules**:
  $$\text{Pending} \longrightarrow \text{Assigned} \longrightarrow \text{In Progress} \longrightarrow \text{Resolved} \longrightarrow \text{Closed}$$
- **Reopening Protocol**: Documented transition permitted from `Resolved` back to `In Progress` upon student dissatisfaction or incomplete work.
- **Resolution Remarks**: Compulsory explanation logged by staff when updating ticket to `Resolved`.
- **Audit History**: Every transition creates an immutable record in `complaint_status_history` containing the changer's user ID, old status, new status, timestamp, and optional remarks.

### Module 4: Feedback & Quality Assurance
- **Post-Resolution Rating**: 1 to 5 star rating submitted by the complaint owner.
- **Feedback Comments**: Qualitative assessment to measure maintenance crew effectiveness and hostel quality of life.

### Module 5: Administrative Governance & Master Data
- **User Directory**: View, activate, and deactivate student or staff accounts.
- **Category Master**: Add, rename, or retire complaint categories dynamically.
- **Audit Trails**: Full visibility into ticket life cycles and assignments.

### Module 6: Dashboards, Analytics & Reporting
- **Student Dashboard**: Quick ticket creation, active vs. resolved ticket counts, recent status tracking.
- **Staff Dashboard**: Assigned queues, severity badges, quick status transition action modals, search & filter.
- **Admin Dashboard**: System-wide KPI cards (Total, Pending, In Progress, Resolved, Overdue), category distribution charts, and exportable operational summaries.

