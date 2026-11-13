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

### 3.1 Create Complaint
- **Method:** `POST`
- **Endpoint:** `/complaints`
- **Access:** `Student`
- **Content-Type:** `multipart/form-data`
- **Body:** `{ title, description, category_id, priority, room_number, hostel_block, photo }`
- **Success:** `201 Created` $\rightarrow$ `{ success: true, message, complaint: { ticket_number, ... } }`

### 3.2 List Complaints (Filtered & Paginated)
- **Method:** `GET`
- **Endpoint:** `/complaints?status=&category=&priority=&search=&page=&limit=`
- **Access:** Authenticated (Student sees own, Staff sees assigned/domain, Admin sees all)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, data: [...], pagination: { total, page, limit, totalPages } }`

### 3.3 Get Single Complaint Details
- **Method:** `GET`
- **Endpoint:** `/complaints/:id`
- **Access:** Authenticated (Student owner, Staff, Admin)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, complaint, history, assignments, feedback }`

### 3.4 Assign / Reassign Complaint
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

## 6. Analytics & Dashboard Statistics APIs

### 6.1 Dashboard Overview Metrics
- **Method:** `GET`
- **Endpoint:** `/stats/dashboard`
- **Access:** Authenticated (Data dynamically scoped to Student/Staff/Admin context)
- **Success:** `200 OK` $\rightarrow$ `{ success: true, stats: { total, pending, in_progress, resolved, closed, avg_resolution_hours } }`

