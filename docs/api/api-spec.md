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

### 2.1 Get Complaint Categories
- **Method:** `GET`
- **Endpoint:** `/categories` (also `/api/categories` and `/api/v1/categories`)
- **Access:** Authenticated (`Student`, `Staff`, `Admin`)
- **Query Parameters:**
  - `include_inactive` (boolean, optional, Admin only): If `true` and user is Admin, returns all categories including inactive ones with `complaint_count`. Defaults to returning active-only categories (`active = 1`).
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "categories": [
      {
        "id": 1,
        "name": "Electrical",
        "description": "Ceiling fans, switchboards, lighting, fuses, power socket malfunctions",
        "active": 1,
        "created_at": "2026-11-14T02:07:00.000Z"
      }
    ]
  }
  ```

### 2.2 Create Category
- **Method:** `POST`
- **Endpoint:** `/categories` or `/admin/categories`
- **Access:** `Admin` only (Students and Staff forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Body:**
  ```json
  {
    "name": "HVAC & Air Conditioning",
    "description": "AC cooling, duct repairs, filter replacement, ventilation fans",
    "active": true
  }
  ```
- **Validation:** `name` is required (2–100 chars), case-insensitive unique constraint enforced. Duplicate returns `409 Conflict` (`DUPLICATE_CATEGORY_NAME`).
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message: "Complaint category created successfully.", category }`

### 2.3 Update Category Details
- **Method:** `PUT` or `PATCH`
- **Endpoint:** `/categories/:id` or `/admin/categories/:id`
- **Access:** `Admin` only
- **Body:** `{ name, description, active }`
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: "Complaint category updated successfully.", category }`

### 2.4 Toggle Category Active Status
- **Method:** `PATCH`
- **Endpoint:** `/categories/:id/status` or `/admin/categories/:id/status`
- **Access:** `Admin` only
- **Body:** `{ active: false }` or `{ status: "inactive" }`
- **Behavior:** Inactive categories are excluded from resident ticket submission dropdowns while preserving existing historical complaint associations.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: "Category '...' status updated to inactive.", category }`

### 2.5 Safe Delete Category
- **Method:** `DELETE`
- **Endpoint:** `/categories/:id` or `/admin/categories/:id`
- **Access:** `Admin` only
- **Integrity Rule:** If the category is referenced by one or more complaints (`complaint_count > 0`), deletion is strictly rejected with `409 Conflict` (`CATEGORY_IN_USE`) to preserve foreign key constraints and historical audit trails. Categories with 0 complaints can be safely deleted.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: "Complaint category '...' deleted successfully." }`
- **Errors:**
  - `409 Conflict`: Category is referenced by existing complaints (`code: "CATEGORY_IN_USE"`). Deactivation is recommended.

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
- **Endpoint:** `/complaints/:id/status` (also `/api/staff/complaints/:id/status` and `/api/v1/complaints/:id/status`)
- **Access:** `Staff`, `Admin` (Students forbidden with HTTP 403 `FORBIDDEN_ROLE` unless closing or reopening via dedicated endpoints)
- **Body:**
  ```json
  {
    "status": "resolved",
    "remarks": "Replaced burnt fan speed regulator and verified rotation on all 5 speeds."
  }
  ```
- **Lifecycle Transition Rules:**
  - `pending` $\rightarrow$ `assigned`, `in_progress`
  - `assigned` $\rightarrow$ `in_progress`, `pending`
  - `in_progress` $\rightarrow$ `resolved` (remarks strictly required $\ge 5$ chars), `assigned`
  - `resolved` $\rightarrow$ `closed`, `in_progress` (reopen reason required $\ge 5$ chars)
  - `closed` $\rightarrow$ `in_progress` (Admin only)
  - Invalid transitions return `400 Bad Request`.
- **Atomic Operations:**
  - Row lock with `FOR UPDATE`.
  - When moving to `resolved`: sets `resolved_at = CURRENT_TIMESTAMP`.
  - When moving from `resolved` to `in_progress`: sets `resolved_at = NULL`.
  - Automatically records audit entry in `complaint_status_history` with changer user ID and remarks.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, complaint }`
- **Errors:**
  - `400 Bad Request`: Invalid transition, missing resolution remarks, or terminal closed state.
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Complaint not found or Option D anti-enumeration block.

### 3.6 Update Complaint Priority
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/priority` (also `/api/staff/complaints/:id/priority` and `/api/v1/complaints/:id/priority`)
- **Access:** `Staff`, `Admin` (Students forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Body:**
  ```json
  {
    "priority": "urgent",
    "remarks": "Water leakage risking electrical short-circuit."
  }
  ```
- **Allowed Priority Values:** `low`, `normal`, `high`, `urgent`.
- **Constraints:**
  - Cannot update priority of a closed complaint (returns `400 Bad Request`).
  - Re-setting to same priority returns `400 Bad Request`.
  - Option D hybrid visibility applies to staff.
  - Logs priority change remark in `complaint_status_history`.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message, complaint }`
- **Errors:**
  - `400 Bad Request`: Invalid priority value or closed complaint.
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Insufficient role permissions (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Complaint not found or Option D anti-enumeration.

### 3.7 Close Complaint
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/close` (also `/api/v1/complaints/:id/close`)
- **Access:** `Student` (owner only), `Admin`
- **Body:** `{ closing_remarks }` (optional)
- **Constraint:** Complaint must be in `resolved` status before closing. Attempting to close non-resolved tickets returns `400 Bad Request`.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: 'Complaint closed successfully.', complaint }`
- **Errors:**
  - `400 Bad Request`: Complaint is not in `resolved` status.
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `404 Not Found`: Complaint not found or student does not own ticket.

### 3.8 Reopen Complaint
- **Method:** `PATCH`
- **Endpoint:** `/complaints/:id/reopen` (also `/api/v1/complaints/:id/reopen`)
- **Access:** `Student` (owner), `Staff` (Option D), `Admin`
- **Body:** `{ reason }` (required, min 5 chars)
- **Constraint:** Complaint must be in `resolved` status (or `closed` for Admin). Reopens ticket to `in_progress` and resets `resolved_at = NULL`.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: 'Complaint reopened successfully.', complaint }`
- **Errors:**
  - `400 Bad Request`: Missing reason or complaint not eligible for reopening.
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `404 Not Found`: Complaint not found or unauthorized under Option D/ownership.

### 3.9 Get Complaint Status History
- **Method:** `GET`
- **Endpoint:** `/complaints/:id/history` (also `/api/staff/complaints/:id/history` and `/api/v1/complaints/:id/history`)
- **Access:** Authenticated (Student owner, Option D Staff, Admin)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, complaint_id, ticket_number, history: [...] }`
- **Errors:**
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `404 Not Found`: Complaint not found or unauthorized under Option D/ownership.

---

## 4. Student Feedback APIs

### 4.1 Submit Feedback
- **Method:** `POST`
- **Endpoint:** `/complaints/:id/feedback` (also `/api/v1/complaints/:id/feedback`)
- **Access:** `Student` (owner only, complaint must be `Resolved` or `Closed`)
- **Body:** `{ rating: 1..5, comments?: string }`
- **Validation Rules:**
  - `rating`: Mandatory integer between 1 and 5.
  - `comments` / `comment`: Optional string, max 2000 characters.
  - Ticket Status: Complaint must be in `resolved` or `closed` status. Submissions on `pending`, `assigned`, or `in_progress` tickets return `400 Bad Request` (`COMPLAINT_NOT_ELIGIBLE`).
  - Idempotency / Duplicate Prevention: Exactly one feedback entry is permitted per complaint (enforced by DB `UNIQUE` constraint). Duplicate submissions return `409 Conflict` (`DUPLICATE_FEEDBACK`).
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message: 'Feedback submitted successfully.', feedback }`
- **Errors:**
  - `400 Bad Request`: Invalid rating, missing rating, or complaint not resolved/closed (`COMPLAINT_NOT_ELIGIBLE`).
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Non-student role attempting feedback submission (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Complaint not found or not owned by student (anti-enumeration).
  - `409 Conflict`: Feedback already recorded for this complaint (`DUPLICATE_FEEDBACK`).

### 4.2 Get Feedback for Complaint
- **Method:** `GET`
- **Endpoint:** `/complaints/:id/feedback` (also `/api/staff/complaints/:id/feedback` and `/api/v1/complaints/:id/feedback`)
- **Access:** Authenticated (Student owner, Option D Staff, Admin)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, complaint_id, feedback: { id, complaint_id, student_id, student_name, rating, comment, created_at } | null }`
- **Errors:**
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `404 Not Found`: Complaint not found or unauthorized under Option D/ownership.

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

### 6.3 Active Maintenance Technicians Directory
- **Method:** `GET`
- **Endpoint:** `/staff/technicians` (also `/api/v1/staff/technicians`)
- **Access:** `Staff`, `Admin` (Students forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Description:** Returns the active maintenance staff technician directory for complaint assignment dropdowns. Excludes student and administrator accounts.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "technicians": [
      {
        "id": 2,
        "name": "Sunita Sharma",
        "email": "sunita.supervisor@hostelcare.edu",
        "phone": "+91 9811002233",
        "staff_designation": "Hostel Supervisor",
        "hostel_block": "Block A"
      },
      {
        "id": 3,
        "name": "Rajesh Kumar",
        "email": "rajesh.electrician@hostelcare.edu",
        "phone": "+91 9822003344",
        "staff_designation": "Senior Electrician",
        "hostel_block": "Block A"
      }
    ]
  }
  ```
- **Errors:**
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).

### 6.4 Complaint Assignment and Reassignment
- **Method:** `POST`
- **Endpoint:** `/staff/complaints/:id/assign` (also `/complaints/:id/assign` and `/api/v1/staff/complaints/:id/assign`)
- **Access:** `Staff`, `Admin` (Students forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Body:**
  ```json
  {
    "staff_id": 3,
    "notes": "Replace defective 20W LED batten in room study area."
  }
  ```
- **Processing & ACID Transaction Contract:**
  1. Row-level `FOR UPDATE` lock on target complaint row.
  2. Verifies complaint existence (HTTP 404 if not found).
  3. Enforces Option D Hybrid Visibility (HTTP 404 anti-enumeration if staff is cross-block and unassigned).
  4. Rejects closed complaints with HTTP 400 (`Cannot assign a closed complaint`).
  5. Validates target user: existence, `role === 'staff'` (rejects students with HTTP 400), and `account_status === 'active'` (rejects inactive with HTTP 400).
  6. Reassignment Handling: If an active assignment exists (`unassigned_at IS NULL`), sets `unassigned_at = CURRENT_TIMESTAMP`.
  7. Inserts new record in `complaint_assignments` with `assigned_at = CURRENT_TIMESTAMP`.
  8. Status Transition: Moves `pending` complaints to `assigned` and writes `complaint_status_history` audit record. If already assigned or in_progress, records reassignment remark preserving active status.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "message": "Complaint assigned successfully to Rajesh Kumar.",
    "assignment": {
      "id": 5,
      "complaint_id": 3,
      "staff_id": 3,
      "staff_name": "Rajesh Kumar",
      "staff_email": "rajesh.electrician@hostelcare.edu",
      "staff_phone": "+91 9822003344",
      "staff_designation": "Senior Electrician",
      "assigned_by": 2,
      "assigned_by_name": "Sunita Sharma",
      "notes": "Replace defective 20W LED batten in room study area.",
      "assigned_at": "2026-11-14T05:30:00.000Z",
      "unassigned_at": null,
      "is_active": true
    },
    "complaint": {
      "id": 3,
      "ticket_number": "HC-20261103-0003",
      "status": "assigned",
      "previous_status": "pending",
      "is_reassignment": false
    }
  }
  ```
- **Errors:**
  - `400 Bad Request`: Validation failure on `id`, `staff_id`, or `notes` (> 1000 chars); invalid target user (not found, student role, or inactive); complaint is closed.
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Complaint not found or Option D anti-enumeration block.

### 6.5 Complaint Assignment History
- **Method:** `GET`
- **Endpoint:** `/staff/complaints/:id/assignments` (also `/complaints/:id/assignments` and `/api/v1/staff/complaints/:id/assignments`)
- **Access:** `Staff`, `Admin` (Students forbidden with HTTP 403 `FORBIDDEN_ROLE`)
- **Authorization:** Scoped via Option D Hybrid Visibility policy (returns uniform HTTP 404 anti-enumeration for non-permitted cross-hostel attempts).
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "complaint_id": 1,
    "ticket_number": "HC-20261101-0001",
    "assignments": [
      {
        "id": 1,
        "complaint_id": 1,
        "staff_id": 3,
        "staff_name": "Rajesh Kumar",
        "staff_email": "rajesh.electrician@hostelcare.edu",
        "staff_phone": "+91 9822003344",
        "staff_designation": "Senior Electrician",
        "assigned_by": 1,
        "assigned_by_name": "Chief Warden Sharma",
        "notes": "Inspect switchboard immediately.",
        "assigned_at": "2026-11-01T05:30:00.000Z",
        "unassigned_at": null,
        "is_active": true
      }
    ]
  }
  ```
- **Errors:**
  - `400 Bad Request`: Invalid `:id` parameter format.
  - `401 Unauthorized`: Missing or invalid Bearer JWT (`NO_TOKEN`).
  - `403 Forbidden`: Authenticated user is a student (`FORBIDDEN_ROLE`).
  - `404 Not Found`: Complaint not found or Option D anti-enumeration.

---

## 7. Analytics & Dashboard Statistics APIs

### 7.1 Dashboard Overview Metrics
- **Method:** `GET`
- **Endpoint:** `/stats/dashboard`
- **Access:** Authenticated (Data dynamically scoped to Student/Staff/Admin context)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, stats: { total, pending, in_progress, resolved, closed, avg_resolution_hours } }`

---

## 8. Administrator Management & Governance APIs

### 8.1 List System Users
- **Method:** `GET`
- **Endpoint:** `/admin/users` (also `/users` and `/api/v1/admin/users`)
- **Access:** `Admin` only (Students and Staff receive HTTP 403 `FORBIDDEN_ROLE`)
- **Query Parameters:**
  - `role` (`student`, `staff`, `admin`)
  - `status` (`active`, `inactive`)
  - `search` (keyword matched against name or email)
  - `page` (positive integer, default 1)
  - `limit` (integer 1–50, default 10)
- **Security:** Never returns `password_hash`.
- **Success:** `200 OK`
  ```json
  {
    "success": true,
    "users": [
      {
        "id": 1,
        "name": "Chief Warden Sharma",
        "email": "admin@hostelcare.edu",
        "role": "admin",
        "account_status": "active",
        "phone": "+91 9811002233"
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 8, "totalPages": 1 }
  }
  ```

### 8.2 Get User Account by ID
- **Method:** `GET`
- **Endpoint:** `/admin/users/:id` (also `/users/:id`)
- **Access:** `Admin` only
- **Success:** `200 OK` $\rightarrow$ `{ success: true, user }` (excludes `password_hash`)
- **Errors:** `404 Not Found` if user does not exist.

### 8.3 Update User Account Details
- **Method:** `PATCH`
- **Endpoint:** `/admin/users/:id` (also `/users/:id`)
- **Access:** `Admin` only
- **Body:** `{ name, phone, role, account_status, staff_designation, hostel_block, room_number }`
- **Guards:**
  - **Self-Deactivation Guard:** Administrators cannot deactivate their own active account (`400 SELF_DEACTIVATION_DENIED`).
  - **Last Active Admin Guard:** Cannot deactivate or demote the last active Administrator account away from `admin` (`400 CANNOT_DISABLE_LAST_ADMIN`).
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: "User account updated successfully.", user }`

### 8.4 Toggle User Account Status
- **Method:** `PATCH`
- **Endpoint:** `/admin/users/:id/status` (also `/users/:id/status`)
- **Access:** `Admin` only
- **Body:** `{ account_status: "inactive" }`
- **Guards:**
  - Rejects self-deactivation (`400 SELF_DEACTIVATION_DENIED`).
  - Rejects deactivating the last active Admin account (`400 CANNOT_DISABLE_LAST_ADMIN`).
- **Success:** `200 OK` $\rightarrow$ `{ success: true, message: "Account status updated to 'inactive' successfully.", user }`

### 8.5 Administrator Dashboard Live Analytics
- **Method:** `GET`
- **Endpoint:** `/admin/stats` or `/admin/dashboard`
- **Access:** `Admin` only
- **Metrics Computed from Live MySQL Database:**
  - `complaints`: Counts broken down by status (`total`, `pending`, `assigned`, `in_progress`, `resolved`, `closed`).
  - `priorities`: Counts by priority (`low`, `normal`, `high`, `urgent`).
  - `users`: Counts by role (`total`, `students`, `staff`, `active_staff`, `admins`, `inactive`).
  - `performance`: SLA statistics (`resolved_total`, `avg_resolution_hours`).
  - `feedback`: Student feedback analytics (`total`, `avg_rating`, star distribution 1–5).
  - `categories`: All categories with associated complaint counts.
  - `blocks`: Complaint counts per hostel block.
  - `recent_complaints`: Latest 10 complaints with student, category, and ticket info.
- **Success:** `200 OK` $\rightarrow$ `{ success: true, stats: { complaints, priorities, users, performance, feedback, categories, blocks, recent_complaints } }`
- **Errors:**
  - `401 Unauthorized`: Missing or invalid Bearer JWT.
  - `403 Forbidden`: Non-admin role (`FORBIDDEN_ROLE`).

