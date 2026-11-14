# HostelCare — Role-Based Access Control (RBAC) Specification

## 1. Role Definitions

1. **Student (`ROLE_STUDENT`)**:
   - Primary consumer of the hostel infrastructure.
   - May file issues pertaining to their assigned hostel block and room.
   - Has read access strictly restricted to complaints they personally created.
2. **Staff (`ROLE_STAFF`)**:
   - Maintenance supervisors, caretakers, plumbers, electricians, and technicians.
   - Can view assigned tickets across their designated hostel or domain.
   - Can update ticket progression, update priority, reassign, and supply resolution remarks.
3. **Admin (`ROLE_ADMIN`)**:
   - Chief Warden, Assistant Warden, Facilities Manager, or System Administrator.
   - Unrestricted read, write, and audit privileges across all tickets, users, categories, and system reports.

---

## 2. Granular Permissions Matrix

| Resource / Action | Endpoint / Operation | Student | Staff | Admin | Rule Details |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Auth: Register** | `POST /api/v1/auth/register` | ✅ | ❌ | ❌ | Public self-service registers only as `student`. |
| **Auth: Login** | `POST /api/v1/auth/login` | ✅ | ✅ | ✅ | Open to all registered & active accounts. |
| **Auth: Profile** | `GET /api/v1/auth/me` | ✅ | ✅ | ✅ | Returns current authenticated user record. |
| **Complaints: Create** | `POST /api/v1/complaints` | ✅ | ❌ | ❌ | Only students can file maintenance requests. |
| **Complaints: View List** | `GET /api/v1/complaints` | ✅ | ✅ | ✅ | **Student:** Own tickets only.<br>**Staff:** Assigned/Permitted tickets.<br>**Admin:** All system tickets. |
| **Complaints: View Detail** | `GET /api/v1/complaints/:id` | ✅ | ✅ | ✅ | **Student:** Own ticket only (403 if not owner).<br>**Staff/Admin:** Authorized. |
| **Complaints: Attachment** | `GET /api/v1/complaints/:id/attachments/:attachmentId` | ✅ | ✅ | ✅ | **Student:** Own ticket only (404 anti-enumeration).<br>**Admin:** Authorized campus-wide.<br>**Staff:** Authorized under Option D (own block or active assignment; 404 anti-enumeration otherwise). |
| **Complaints: Assign** | `POST /api/v1/complaints/:id/assign` | ❌ | ✅ | ✅ | Staff supervisors or Admins only. |
| **Complaints: Status Update** | `PATCH /api/v1/complaints/:id/status` | ❌ | ✅ | ✅ | Requires valid status lifecycle transition & remarks. |
| **Complaints: Close** | `PATCH /api/v1/complaints/:id/close` | ✅ | ❌ | ✅ | Student (after satisfaction) or Admin. |
| **Complaints: Submit Feedback** | `POST /api/v1/complaints/:id/feedback` | ✅ | ❌ | ❌ | Student owner only, once complaint is `Resolved` or `Closed`. |
| **Complaints: View Feedback** | `GET /api/v1/complaints/:id/feedback` | ✅ | ✅ | ✅ | Student owner, Option D Staff, Admin. View resolution quality feedback. |
| **Categories: List** | `GET /api/v1/categories` | ✅ | ✅ | ✅ | Publicly visible to all authenticated roles. |
| **Categories: Manage** | `POST/PUT/DELETE /api/v1/categories` | ❌ | ❌ | ✅ | Admin only. |
| **Users: Provision Staff** | `POST /api/v1/users` | ❌ | ❌ | ✅ | Admin only. Controlled `staff` account creation only. Admin creation via API is strictly rejected (400 Bad Request) as Admin accounts are system-seeded. |
| **Users: List Directory** | `GET /api/v1/users` or `GET /api/v1/admin/users` | ❌ | ❌ | ✅ | Admin only. Paginated with role/status/search filters. |
| **Users: Update Details** | `PATCH /api/v1/users/:id` or `PATCH /api/v1/admin/users/:id` | ❌ | ❌ | ✅ | Admin only. Updates name, phone, role, room, block. Last active Admin demotion protected (400 `CANNOT_DISABLE_LAST_ADMIN`). |
| **Users: Toggle Status** | `PATCH /api/v1/users/:id/status` or `PATCH /api/v1/admin/users/:id/status` | ❌ | ❌ | ✅ | Admin only. Self-deactivation forbidden (400 `SELF_DEACTIVATION_DENIED`). Last active Admin deactivation forbidden (400 `CANNOT_DISABLE_LAST_ADMIN`). |
| **Categories: List** | `GET /api/v1/categories` | ✅ | ✅ | ✅ | Publicly visible to all authenticated roles. Admin can supply `?include_inactive=true`. |
| **Categories: Manage** | `POST/PUT/PATCH/DELETE /api/v1/categories` or `/api/v1/admin/categories` | ❌ | ❌ | ✅ | Admin only. Deletion rejected with 409 `CATEGORY_IN_USE` if referenced by historical complaints. |
| **Admin: Live Statistics** | `GET /api/v1/admin/stats` or `GET /api/v1/admin/dashboard` | ❌ | ❌ | ✅ | Admin only. Real database metrics: complaints, users, SLA, and feedback. |
| **Staff: Operations Overview** | `GET /api/v1/staff/overview` | ❌ | ✅ | ✅ | Staff & Admin only. Maintenance queue overview. |
| **Staff: Complaints Queue** | `GET /api/v1/staff/complaints` | ❌ | ✅ | ✅ | Staff & Admin only. Option D visibility, keyword search, status/cat/priority/date filters, pagination, and real-time DB stats. |
| **Staff: View Ticket Details** | `GET /api/v1/staff/complaints/:id` | ❌ | ✅ | ✅ | Staff & Admin only. Option D hybrid visibility (own block or active assignment; 404 anti-enumeration otherwise). |
| **Stats: Dashboard** | `GET /api/v1/stats/dashboard` | ✅ | ✅ | ✅ | Scoped dynamically per role context. |

---

## 3. Comprehensive Endpoint Security & Status Code Matrix

| HTTP Method | Endpoint | Authentication | Allowed Roles | Ownership & Policy Restrictions | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | None (Public) | Public | Role forced to `student`. Public elevation attempts return 403. | `201`, `400`, `403`, `409` |
| `POST` | `/api/v1/auth/login` | None (Public) | All Roles | Account must be `active`. bcrypt verification. Generic 401 error. | `200`, `400`, `401`, `403` |
| `GET` | `/api/v1/auth/me` | Bearer JWT | `student`, `staff`, `admin` | Live DB check (`findById`). Excludes `password_hash`. Account must be `active`. | `200`, `401`, `403` |
| `POST` | `/api/v1/auth/logout` | Optional Bearer | All Roles | Client-side token discard acknowledgment. | `200` |
| `POST` | `/api/v1/users` | Bearer JWT | `admin` | Admin can provision `staff` accounts only. Admin accounts are system-seeded; `role: 'admin'` rejected with 400 Bad Request. Bcrypt 10 rounds. | `201`, `400`, `401`, `403`, `409` |
| `GET` | `/api/v1/users` or `/api/v1/admin/users` | Bearer JWT | `admin` | Returns user directory. Never leaks `password_hash`. Paginated with role/status/search filters. | `200`, `401`, `403` |
| `GET` | `/api/v1/admin/users/:id` | Bearer JWT | `admin` | Returns single user profile without password_hash. | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/users/:id` or `/api/v1/admin/users/:id` | Bearer JWT | `admin` | Updates user details. Demoting last active Admin forbidden (`CANNOT_DISABLE_LAST_ADMIN`). | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/users/:id/status` or `/api/v1/admin/users/:id/status` | Bearer JWT | `admin` | Cannot deactivate own admin account. Disabling last active Admin forbidden (`CANNOT_DISABLE_LAST_ADMIN`). | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/categories` | Bearer JWT | All Roles | Active complaint categories. Admin can pass `?include_inactive=true` to see all. | `200`, `401` |
| `POST` | `/api/v1/admin/categories` | Bearer JWT | `admin` | Creates new category. Unique name enforced (409). | `201`, `400`, `401`, `403`, `409` |
| `PATCH` | `/api/v1/admin/categories/:id` | Bearer JWT | `admin` | Updates category description or name. | `200`, `400`, `401`, `403`, `404`, `409` |
| `PATCH` | `/api/v1/admin/categories/:id/status` | Bearer JWT | `admin` | Toggles category active status. Inactive categories excluded from student ticket forms. | `200`, `400`, `401`, `403`, `404` |
| `DELETE` | `/api/v1/admin/categories/:id` | Bearer JWT | `admin` | Deletes unused category. Rejected with 409 `CATEGORY_IN_USE` if referenced by complaints. | `200`, `400`, `401`, `403`, `404`, `409` |
| `GET` | `/api/v1/admin/stats` or `/api/v1/admin/dashboard` | Bearer JWT | `admin` | Comprehensive live system statistics from MySQL database. Students & Staff forbidden (403). | `200`, `401`, `403` |
| `GET` | `/api/v1/staff/overview` | Bearer JWT | `staff`, `admin` | Maintenance staff dashboard metrics. Students forbidden (403). | `200`, `401`, `403` |
| `GET` | `/api/v1/staff/technicians` | Bearer JWT | `staff`, `admin` | Active technicians directory (`role = 'staff'`, `account_status = 'active'`). Excludes students and admin. | `200`, `401`, `403` |
| `GET` | `/api/v1/staff/complaints` | Bearer JWT | `staff`, `admin` | Option D hybrid visibility. Keyword search, multi-field filters, pagination, and real stats. Students forbidden (403). | `200`, `400`, `401`, `403` |
| `GET` | `/api/v1/staff/complaints/:id` | Bearer JWT | `staff`, `admin` | Option D hybrid visibility. Students forbidden (403). Non-permitted cross-hostel returns uniform 404 anti-enumeration. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/stats/dashboard` | Bearer JWT | `student`, `staff`, `admin` | Dynamically returns role-scoped dashboard metrics computed from live database aggregates. | `200`, `401` |
| `POST` | `/api/v1/staff/complaints/:id/assign` | Bearer JWT | `staff`, `admin` | Assigns or reassigns complaint. Option D scope. Validates active staff role (rejects students & inactive staff with 400). Atomic ACID transaction, FOR UPDATE lock, moves Pending to Assigned. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/staff/complaints/:id/assignments` | Bearer JWT | `staff`, `admin` | Chronological assignment history and delegation audit timeline. Option D anti-enumeration (404). | `200`, `400`, `401`, `403`, `404` |
| `POST` | `/api/v1/complaints` | Bearer JWT | `student` | Students only. Auto-assigned ticket `HC-YYYYMMDD-XXXX`. | `201`, `400`, `401`, `403` |
| `GET` | `/api/v1/complaints` | Bearer JWT | All Roles | Student sees own tickets; Staff sees domain; Admin sees all. | `200`, `401`, `403` |
| `GET` | `/api/v1/complaints/:id` | Bearer JWT | All Roles | Student owner only (403 if unowned); Staff/Admin authorized. | `200`, `401`, `403`, `404` |
| `GET` | `/api/v1/complaints/:id/attachments/:attachmentId` | Bearer JWT | `student`, `staff`, `admin` | Student owner only (404 unowned); Admin authorized; Staff authorized under Option D (404 anti-enumeration for non-permitted cross-hostel attempts). | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/complaints/:id/status` | Bearer JWT | `staff`, `admin` | Updates status through state machine (`pending` $\rightarrow$ `assigned`/`in_progress` $\rightarrow$ `resolved` $\rightarrow$ `closed`). Option D scope. Remarks required for `resolved`. Status history recorded. | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/complaints/:id/priority` | Bearer JWT | `staff`, `admin` | Updates priority (`low`, `normal`, `high`, `urgent`). Option D scope. Closed complaints rejected with 400. Students forbidden (403). Status history recorded. | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/complaints/:id/close` | Bearer JWT | `student`, `admin` | Closes resolved complaint. Student owner or Admin only. Non-resolved complaints rejected with 400. Status history recorded. | `200`, `400`, `401`, `403`, `404` |
| `PATCH` | `/api/v1/complaints/:id/reopen` | Bearer JWT | `student`, `staff`, `admin` | Reopens resolved complaint to `in_progress`. Reason required. Resets `resolved_at = NULL`. Status history recorded. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/complaints/:id/history` | Bearer JWT | All Roles | Chronological status history audit trail. Student owner, Option D Staff, Admin. | `200`, `400`, `401`, `403`, `404` |

---

## 4. Security Audit Resolutions

### [SEC-11-MED-01] Staff Attachment Download Authorization (Resolved — Session 13)
- **Status**: Resolved & Enforced via Option D.
- **Resolution**:
  1. Option D (Hybrid Domain & Assignment Visibility) implemented for all staff endpoints and attachments.
  2. Staff member is authorized to access and download attachments if:
     - `complaint.hostel_block = req.user.hostel_block`, OR
     - `complaint_assignments.staff_id = req.user.id` AND `unassigned_at IS NULL`.
  3. Staff accounts with `hostel_block IS NULL` are restricted to their actively assigned tickets.
  4. Non-assigned cross-hostel staff attempts return uniform `HTTP 404 Not Found` to prevent ticket/attachment existence enumeration.
  5. Verified across live regression test suites (`verifySession11.js` and `verifySession13.js`).
