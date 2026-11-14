# HostelCare — REST API Specification (22 Endpoints)

Base URL: `http://localhost:5000/api/v1`

---

## 1. Authentication & Account APIs

### 1.1 Student Registration
- **Method:** `POST`
- **Endpoint:** `/auth/register`
- **Access:** Public
- **Body:** `{ name, email, password, phone, room_number, hostel_block }`
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message, user }`
- **Validation:** Valid college email, password $\ge 6$ chars, required room & block.

### 1.2 User Login
- **Method:** `POST`
- **Endpoint:** `/auth/login`
- **Access:** Public
- **Body:** `{ email, password }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, token, user: { id, name, email, role, room_number, hostel_block } }`

### 1.3 Current User Profile
- **Method:** `GET`
- **Endpoint:** `/auth/me`
- **Access:** Authenticated (`Student`, `Staff`, `Admin`)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, user }`

### 1.4 Change Password
- **Method:** `PUT`
- **Endpoint:** `/auth/change-password`
- **Access:** Authenticated
- **Body:** `{ current_password, new_password }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message }`

---

## 2. Complaint Categories APIs

### 2.1 Get All Categories
- **Method:** `GET`
- **Endpoint:** `/categories`
- **Access:** Authenticated (`Student`, `Staff`, `Admin`)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, categories: [...] }`

### 2.2 Create Category
- **Method:** `POST`
- **Endpoint:** `/categories`
- **Access:** `Admin`
- **Body:** `{ name, description }`
- **Success:** `201 Created` $\rightarrow$ `{ success: true, category }`

### 2.3 Update Category
- **Method:** `PUT`
- **Endpoint:** `/categories/:id`
- **Access:** `Admin`
- **Body:** `{ name, description, is_active }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, category }`

### 2.4 Delete / Deactivate Category
- **Method:** `DELETE`
- **Endpoint:** `/categories/:id`
- **Access:** `Admin`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message }`

---

## 3. Complaint Management APIs

### 3.1 Create Complaint (With Optional Photo Attachment)
- **Method:** `POST`
- **Endpoint:** `/complaints` (also `/api/v1/complaints`)
- **Access:** `Student` only
- **Content-Type:** `application/json` OR `multipart/form-data`
- **Fields (JSON or Multipart):**
  - `title` (string, 5–150 chars, required)
  - `description` (string, 10–2000 chars, required)
  - `category_id` (integer >= 1, required)
  - `room_number` (string, optional, must match student's registered room if supplied)
  - `photo` (file, optional, multipart only): Single image file (JPEG, PNG, WEBP), max 5MB
- **Policy & Security Pipeline:**
  - `requireAuth` -> `requireRole('student')` -> Multer in-memory buffer -> Magic byte inspection & Sharp re-encoding -> input validation -> atomic database transaction.
  - Re-encodes validated images and strips EXIF metadata (clearing GPS, device info, and payload comments).
  - Unpredictable server-generated filename (`complaint-<timestamp>-<random-hex>.<ext>`) stored in private directory outside public static root.
  - `student_id`, `block_id`, and `hostel_block` derived strictly from authenticated student profile (`req.user`).
  - Client-controlled `priority` is forbidden; defaults to `'normal'`.
  - Rejects attempts to supply privileged fields (`priority`, `status`, `student_id`, `assigned_staff_id`, `ticket_number`, `block_id`, `hostel_block`).
  - Generates unique ticket number `HC-YYYYMMDD-XXXX` in `Asia/Kolkata` (IST) timezone.
  - Atomically records initial `pending` state transition in `complaint_status_history` and attachment in `complaint_attachments`.
  - Safe rollback and unlinking: If database operations fail, any staged file is immediately unlinked.
- **Success:** `201 Created`
  ```json
  {
    "success": true,
    "message": "Complaint lodged successfully.",
    "complaint": {
      "id": 1,
      "ticket_number": "HC-20261114-0001",
      "student_id": 5,
      "category_id": 1,
      "category_name": "Electrical",
      "title": "Ceiling fan regulator burnt and sparking",
      "description": "The speed regulator is sparking when turned to speed 3. Smells of burning plastic. Cannot operate fan.",
      "block_id": 1,
      "hostel_block": "Block A",
      "room_number": "A-102",
      "priority": "normal",
      "status": "pending",
      "created_at": "2026-11-14T07:15:00.000Z",
      "updated_at": "2026-11-14T07:15:00.000Z",
      "attachment": {
        "id": 1,
        "original_name": "regulator_damage.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 1420580,
        "uploaded_at": "2026-11-14T07:15:00.000Z",
        "download_url": "/api/v1/complaints/1/attachments/1"
      }
    }
  }
  ```
  *(If no photo was attached, `"attachment": null` is returned).*
- **Errors:**
  - `400 Bad Request`: Validation failure, privileged field injection, room mismatch, incomplete profile, invalid category, or unexpected file fields (`LIMIT_UNEXPECTED_FILE`).
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is not a student (staff/admin rejected with `FORBIDDEN_ROLE`).
  - `413 Payload Too Large`: Uploaded file exceeds 5MB limit (`FILE_TOO_LARGE`).
  - `415 Unsupported Media Type`: Unsupported format, magic-byte mismatch, or corrupted image (`UNSUPPORTED_MEDIA_TYPE`, `INVALID_IMAGE_SIGNATURE`, `CORRUPTED_IMAGE`).
  - `503 Service Unavailable`: Daily ticket limit (9999) reached.

### 3.2 List Student Complaints (Filtered & Paginated)
- **Method:** `GET`
- **Endpoints:** `/complaints/mine` and `/complaints` (also `/api/v1/complaints/mine` and `/api/v1/complaints`)
- **Access:** `Student` only
- **Query Parameters:**
  - `page` (optional integer $\ge 1$, default: `1`): Current page number
  - `limit` (optional integer $1 \le \text{limit} \le 50$, default: `10`): Items per page
  - `status` (optional string): Filter by complaint status (`pending`, `assigned`, `in_progress`, `resolved`, `closed`)
  - `category_id` (optional integer $\ge 1$): Filter by complaint category ID
- **Ordering:** Newest first (`created_at DESC, id DESC`)
- **Ownership Guarantee:** `c.student_id` is derived strictly from `req.user.id`. Both data selection and total count queries apply identical ownership filtering.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "complaints": [
      {
        "id": 1,
        "ticket_number": "HC-20261101-0001",
        "student_id": 5,
        "category_id": 1,
        "category_name": "Electrical",
        "title": "Ceiling fan regulator burnt and sparking",
        "description": "The speed regulator is sparking...",
        "block_id": 1,
        "hostel_block": "Block A",
        "room_number": "A-102",
        "priority": "high",
        "status": "in_progress",
        "created_at": "2026-11-01T04:45:00.000Z",
        "updated_at": "2026-11-12T19:05:32.000Z",
        "resolved_at": null
      }
    ],
    "pagination": {
      "total": 2,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Invalid pagination numbers (`page < 1`, `limit < 1` or `> 50`) or invalid filters (`invalid status`, `category_id < 1`).
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `403 Forbidden`: Authenticated user is not a student (staff/admin rejected).

### 3.3 Get Single Complaint Details (Student Owner)
- **Method:** `GET`
- **Endpoint:** `/complaints/:id` (also `/api/v1/complaints/:id`)
- **Access:** `Student` (owner only)
- **Parameters:**
  - `id` (path parameter, integer $\ge 1$): Primary key ID of the complaint
- **Ownership & Anti-Enumeration Policy:**
  - Query enforces `WHERE c.id = ? AND c.student_id = req.user.id`.
  - Inaccessible complaints (belonging to another resident) and non-existent IDs return an identical `404 Not Found` response with message `"Complaint not found."`. This prevents ID enumeration attacks.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "complaint": {
      "id": 1,
      "ticket_number": "HC-20261101-0001",
      "student_id": 5,
      "category_id": 1,
      "category_name": "Electrical",
      "title": "Ceiling fan regulator burnt and sparking",
      "description": "The speed regulator is sparking when turned to speed 3. Smells of burning plastic. Cannot operate fan.",
      "block_id": 1,
      "hostel_block": "Block A",
      "room_number": "A-102",
      "priority": "high",
      "status": "in_progress",
      "created_at": "2026-11-01T04:45:00.000Z",
      "updated_at": "2026-11-12T19:05:32.000Z",
      "resolved_at": null,
      "remarks": "Technician procured replacement regulator from store, inspection underway.",
      "latest_remarks": "Technician procured replacement regulator from store, inspection underway."
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: `id` is not a positive integer.
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `403 Forbidden`: Authenticated user is not a student (staff/admin rejected).
  - `404 Not Found`: Complaint not found or does not belong to the authenticated student (`{ "success": false, "message": "Complaint not found." }`).

### 3.4 Download Complaint Attachment
- **Method:** `GET`
- **Endpoints:** `/complaints/:id/attachments/:attachmentId` and `/complaints/:id/attachment` (also `/api/v1/complaints/:id/attachments/:attachmentId`)
- **Access:** Authenticated (`Student` owner, `Staff` within Option D domain/assignment, `Admin`)
- **Policy & Security:**
  - Enforces `requireAuth`.
  - **Student Access:** Strictly enforced ownership (`attachment.student_id === req.user.id`). Unauthorized cross-student attempts and non-existent IDs return an identical `404 Not Found` response (`{ "success": false, "message": "Attachment not found." }`) to eliminate ID enumeration.
  - **Admin Access:** Authorized for administrative inspection and auditing across all system tickets campus-wide.
  - **Staff Access (Option D: Hybrid Domain & Assignment Visibility):**
    - Staff members can access attachments if the complaint belongs to their assigned hostel block (`complaint.hostel_block = req.user.hostel_block`), OR if the complaint has an active assignment to them (`complaint_assignments.staff_id = req.user.id` and `unassigned_at IS NULL`).
    - Staff accounts with `hostel_block IS NULL` can access only complaints actively assigned to them.
    - Unauthorized cross-hostel staff attempts return uniform `404 Not Found` (`{ "success": false, "message": "Attachment not found." }`) to eliminate ticket/attachment ID enumeration.
  - Protects against path traversal via strict `resolveSafeStoragePath` root boundary checks.
  - Streams file directly from private directory (`backend/uploads/complaints/`) with security headers.
- **Headers Sent by Server:**
  - `Content-Type`: Verified MIME type (`image/jpeg`, `image/png`, `image/webp`)
  - `Content-Disposition`: `inline; filename="<sanitized_filename>"`
  - `X-Content-Type-Options`: `nosniff`
  - `Cache-Control`: `private, no-cache, no-store, must-revalidate`
- **Success:** `200 OK` (Binary image stream)
- **Errors:**
  - `400 Bad Request`: Invalid `:id` or `:attachmentId` format.
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user role is not authorized (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Attachment record does not exist, file missing on disk, or inaccessible complaint under Option D / Student ownership policy (`{ "success": false, "message": "Attachment not found." }`).

### 3.5 Assign / Reassign Complaint
- **Method:** `POST`
- **Endpoint:** `/complaints/:id/assign`
- **Access:** `Staff`, `Admin`
- **Body:** `{ assigned_to_user_id, notes }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, assignment }`

### 3.5 Update Complaint Status
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/status`
- **Access:** `Staff`, `Admin`
- **Body:** `{ status, remarks }` (remarks required when status is `Resolved`)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, status }`

### 3.6 Update Complaint Priority
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/priority`
- **Access:** `Staff`, `Admin`
- **Body:** `{ priority }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, priority }`

### 3.7 Close Complaint
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/close`
- **Access:** `Student` (owner), `Admin`
- **Body:** `{ closing_remarks }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message }`

### 3.8 Reopen Complaint
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/reopen`
- **Access:** `Student` (owner), `Admin`
- **Body:** `{ reason }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message }`

---

## 4. Student Feedback APIs

### 4.1 Submit Feedback
- **Method:** `POST`
- **Endpoint:** `/complaints/:id/feedback`
- **Access:** `Student` (owner only, complaint must be `Resolved` or `Closed`)
- **Body:** `{ rating (1-5), comments }`
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message, feedback }`

### 4.2 Get Feedback for Complaint
- **Method:** `GET`
- **Endpoint:** `/complaints/:id/feedback`
- **Access:** Authenticated (Student owner, Staff, Admin)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, feedback }`

---

## 5. Administrative & User Management APIs

### 5.1 List All Users
- **Method:** `GET`
- **Endpoint:** `/users?role=&status=&search=&page=&limit=`
- **Access:** `Admin`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, users: [...], pagination }`

### 5.2 Create Staff User (Controlled Provisioning)
- **Method:** `POST`
- **Endpoint:** `/users` (also `/api/v1/users`)
- **Access:** `Admin` only
- **Policy:** Strictly allows creation of `staff` accounts only. Administrator accounts are strictly system-seeded and cannot be created via the API. Any attempt to provision `role: 'admin'`, `role: 'student'`, or arbitrary roles returns `400 Bad Request`.
- **Body:** `{ name, email, password, role: 'staff', phone, staff_designation, hostel_block }`
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message: 'Staff account provisioned successfully.', user: { id, name, email, role: 'staff', ... } }`
- **Errors:**
  - `400 Bad Request`: Validation failure or attempt to provision unauthorized role (`admin`, `student`, arbitrary).
  - `401 Unauthorized`: Missing or invalid Admin JWT.
  - `403 Forbidden`: Authenticated user is not an Admin.
  - `409 Conflict`: Email already registered.

### 5.3 Toggle User Status (Activate/Deactivate)
- **Method:** `PATCH`
- **Endpoint:** `/users/:id/status`
- **Access:** `Admin`
- **Body:** `{ is_active: boolean }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message }`

---

## 6. Staff Maintenance Desk APIs

### 6.1 Staff Maintenance Overview
- **Method:** `GET`
- **Endpoint:** `/staff/overview` (also `/api/v1/staff/overview`)
- **Access:** `Staff`, `Admin`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, data: { staffName, role, designation, assignedHostel, activeQueueCount } }`
- **Errors:**
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).

### 6.2 Staff Complaints Queue (Search, Multi-Field Filters & Real DB Stats)
- **Method:** `GET`
- **Endpoint:** `/staff/complaints` (also `/api/v1/staff/complaints`)
- **Access:** `Staff`, `Admin` (Students strictly forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Query Parameters:**
  - `page` (integer $\ge 1$, default: 1): Page number for pagination.
  - `limit` (integer 1–50, default: 10): Items per page.
  - `keyword` (string, max 100 chars): Case-insensitive search across `ticket_number`, `title`, `description`, `student_name`, `room_number`.
  - `status` (string, allowlist: `pending`, `assigned`, `in_progress`, `resolved`, `closed`): Filter by ticket status.
  - `category_id` (integer $\ge 1$): Filter by complaint category.
  - `priority` (string, allowlist: `low`, `normal`, `high`, `urgent`): Filter by priority.
  - `start_date` (string, strict `YYYY-MM-DD`): Beginning of created_at date range.
  - `end_date` (string, strict `YYYY-MM-DD`): End of created_at date range (inclusive to 23:59:59.999).
  - `assigned_to_me` (boolean/string: `'true'` / `'false'`): Filter tickets actively assigned to requesting user.
  - `sort_by` (string, allowlist: `created_at`, `priority`, `status`, `id`, `ticket_number`, default: `created_at`).
  - `sort_order` (string, allowlist: `asc`, `desc`, default: `desc`).
- **Authorization & Visibility Policy (Option D: Hybrid Domain & Assignment Visibility):**
  - **Admin:** Global campus-wide access to all complaints across all blocks.
  - **Staff:** Authorized to view complaints where `complaint.hostel_block = req.user.hostel_block` OR an active assignment exists (`complaint_assignments.staff_id = req.user.id` and `unassigned_at IS NULL`).
  - **NULL hostel_block:** Staff with `hostel_block IS NULL` view only complaints actively assigned to them.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "complaints": [
      {
        "id": 1,
        "ticket_number": "HC-20261101-0001",
        "student_id": 5,
        "student_name": "Rahul Sharma",
        "student_email": "rahul.cs23@hostelcare.edu",
        "student_phone": "+91 9855006677",
        "category_id": 1,
        "category_name": "Electrical",
        "title": "Ceiling fan regulator burnt and sparking",
        "description": "The speed regulator is sparking when turned to speed 3...",
        "block_id": 1,
        "hostel_block": "Block A",
        "room_number": "A-102",
        "priority": "high",
        "status": "in_progress",
        "created_at": "2026-11-01T04:45:00.000Z",
        "updated_at": "2026-11-01T08:50:00.000Z",
        "resolved_at": null,
        "assigned_staff_id": 3,
        "assigned_staff_name": "Rajesh Kumar",
        "assigned_at": "2026-11-01T05:30:00.000Z",
        "attachment_id": 1,
        "has_attachment": true,
        "attachment_download_url": "/api/v1/complaints/1/attachments/1"
      }
    ],
    "pagination": {
      "total": 4,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    },
    "stats": {
      "totalPermitted": 4,
      "assignedToMe": 3,
      "pendingReview": 1,
      "inProgress": 1,
      "resolved": 1
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Validation failure on query parameters (e.g. invalid status, category, date range, page/limit boundaries, sort column).
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).

---

## 7. Analytics & Dashboard Statistics APIs

### 6.1 Dashboard Overview Metrics
- **Method:** `GET`
- **Endpoint:** `/stats/dashboard`
- **Access:** Authenticated (Data dynamically scoped to Student/Staff/Admin context)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, stats: { total, pending, in_progress, resolved, closed, avg_resolution_hours } }`

