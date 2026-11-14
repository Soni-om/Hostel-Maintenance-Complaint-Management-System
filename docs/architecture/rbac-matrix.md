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
| **Complaints: Feedback** | `POST /api/v1/complaints/:id/feedback` | ✅ | ❌ | ❌ | Student owner only, once complaint is `Resolved`. |
| **Categories: List** | `GET /api/v1/categories` | ✅ | ✅ | ✅ | Publicly visible to all authenticated roles. |
| **Categories: Manage** | `POST/PUT/DELETE /api/v1/categories` | ❌ | ❌ | ✅ | Admin only. |
| **Users: Provision Staff** | `POST /api/v1/users` | ❌ | ❌ | ✅ | Admin only. Controlled `staff` account creation only. Admin creation via API is strictly rejected (400 Bad Request) as Admin accounts are system-seeded. |
| **Users: List Directory** | `GET /api/v1/users` | ❌ | ❌ | ✅ | Admin only. Paginated with role/status filters. |
| **Users: Toggle Status** | `PATCH /api/v1/users/:id/status` | ❌ | ❌ | ✅ | Admin only. Cannot self-deactivate. |
| **Staff: Operations Overview** | `GET /api/v1/staff/overview` | ❌ | ✅ | ✅ | Staff & Admin only. Maintenance queue overview. |
| **Staff: Complaints Queue** | `GET /api/v1/staff/complaints` | ❌ | ✅ | ✅ | Staff & Admin only. Option D visibility, keyword search, status/cat/priority/date filters, pagination, and real-time DB stats. |
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
| `GET` | `/api/v1/users` | Bearer JWT | `admin` | Returns user directory. Never leaks `password_hash`. Paginated. | `200`, `401`, `403` |
| `PATCH` | `/api/v1/users/:id/status` | Bearer JWT | `admin` | Cannot deactivate own admin account. | `200`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/staff/overview` | Bearer JWT | `staff`, `admin` | Maintenance staff dashboard metrics. Students forbidden (403). | `200`, `401`, `403` |
| `GET` | `/api/v1/staff/complaints` | Bearer JWT | `staff`, `admin` | Option D hybrid visibility. Keyword search, multi-field filters, pagination, and real stats. Students forbidden (403). | `200`, `400`, `401`, `403` |
| `POST` | `/api/v1/complaints` | Bearer JWT | `student` | Students only. Auto-assigned ticket `HC-YYYYMMDD-XXXX`. | `201`, `400`, `401`, `403` |
| `GET` | `/api/v1/complaints` | Bearer JWT | All Roles | Student sees own tickets; Staff sees domain; Admin sees all. | `200`, `401`, `403` |
| `GET` | `/api/v1/complaints/:id` | Bearer JWT | All Roles | Student owner only (403 if unowned); Staff/Admin authorized. | `200`, `401`, `403`, `404` |
| `GET` | `/api/v1/complaints/:id/attachments/:attachmentId` | Bearer JWT | `student`, `staff`, `admin` | Student owner only (404 unowned); Admin authorized; Staff authorized under Option D (404 anti-enumeration for non-permitted cross-hostel attempts). | `200`, `400`, `401`, `403`, `404` |

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
