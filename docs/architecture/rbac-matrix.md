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
| **Complaints: Assign** | `POST /api/v1/complaints/:id/assign` | ❌ | ✅ | ✅ | Staff supervisors or Admins only. |
| **Complaints: Status Update** | `PATCH /api/v1/complaints/:id/status` | ❌ | ✅ | ✅ | Requires valid status lifecycle transition & remarks. |
| **Complaints: Close** | `PATCH /api/v1/complaints/:id/close` | ✅ | ❌ | ✅ | Student (after satisfaction) or Admin. |
| **Complaints: Feedback** | `POST /api/v1/complaints/:id/feedback` | ✅ | ❌ | ❌ | Student owner only, once complaint is `Resolved`. |
| **Categories: List** | `GET /api/v1/categories` | ✅ | ✅ | ✅ | Publicly visible to all authenticated roles. |
| **Categories: Manage** | `POST/PUT/DELETE /api/v1/categories` | ❌ | ❌ | ✅ | Admin only. |
| **Users: List & Manage** | `/api/v1/users/*` | ❌ | ❌ | ✅ | Admin only. |
| **Stats: Dashboard** | `GET /api/v1/stats/dashboard` | ✅ | ✅ | ✅ | Scoped dynamically per role context. |
