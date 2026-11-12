# HostelCare — Relational Database Schema & Data Dictionary

## 1. Entity-Relationship Overview

```mermaid
erDiagram
    HOSTEL_BLOCKS ||--o{ USERS : "houses/manages"
    HOSTEL_BLOCKS ||--o{ COMPLAINTS : "located_in"
    USERS ||--o{ COMPLAINTS : "submits (student)"
    USERS ||--o{ COMPLAINT_ASSIGNMENTS : "assigned_to (staff)"
    USERS ||--o{ COMPLAINT_ASSIGNMENTS : "assigned_by (supervisor)"
    USERS ||--o{ COMPLAINT_STATUS_HISTORY : "changed_by"
    USERS ||--o{ FEEDBACK : "submits (student)"
    COMPLAINT_CATEGORIES ||--o{ COMPLAINTS : "classifies"
    COMPLAINTS ||--o{ COMPLAINT_ASSIGNMENTS : "delegates"
    COMPLAINTS ||--o{ COMPLAINT_STATUS_HISTORY : "tracks_lifecycle"
    COMPLAINTS ||--o{ COMPLAINT_ATTACHMENTS : "contains_proof"
    COMPLAINTS ||--|| FEEDBACK : "evaluates (1-to-1)"

    HOSTEL_BLOCKS {
        int id PK
        varchar block_code UK
        varchar block_name
        int total_floors
        int total_rooms
        boolean is_active
        timestamp created_at
    }

    USERS {
        int id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar phone
        enum role "student, staff, admin"
        enum account_status "active, inactive"
        varchar hostel_block
        varchar room_number
        varchar staff_designation
        timestamp created_at
        timestamp updated_at
    }

    COMPLAINT_CATEGORIES {
        int id PK
        varchar name UK
        varchar description
        boolean active
        timestamp created_at
    }

    COMPLAINTS {
        int id PK
        varchar ticket_number UK
        int student_id FK
        int category_id FK
        varchar title
        text description
        varchar hostel_block
        varchar room_number
        enum priority "low, normal, high, urgent"
        enum status "pending, assigned, in_progress, resolved, closed"
        timestamp created_at
        timestamp updated_at
        datetime resolved_at
    }

    COMPLAINT_ASSIGNMENTS {
        int id PK
        int complaint_id FK
        int staff_id FK
        int assigned_by FK
        text notes
        timestamp assigned_at
        datetime unassigned_at
    }

    COMPLAINT_STATUS_HISTORY {
        int id PK
        int complaint_id FK
        int changed_by FK
        enum old_status
        enum new_status
        text remarks
        timestamp changed_at
    }

    COMPLAINT_ATTACHMENTS {
        int id PK
        int complaint_id FK
        varchar storage_key
        varchar original_name
        varchar mime_type
        bigint size_bytes
        timestamp uploaded_at
    }

    FEEDBACK {
        int id PK
        int complaint_id FK,UK
        int student_id FK
        tinyint rating "CHECK 1..5"
        text comment
        timestamp created_at
    }
```

---

## 2. Table Specifications & Constraints

### 2.1 Table: `hostel_blocks` (Optional / Architectural Master)
Physical hostel blocks / residence halls on campus.
- **`id`**: `INT AUTO_INCREMENT PRIMARY KEY`
- **`block_code`**: `VARCHAR(20) NOT NULL UNIQUE` (e.g. `BLK-A`)
- **`block_name`**: `VARCHAR(100) NOT NULL` (e.g. `Block A (North Wing)`)
- **`total_floors`**: `INT NOT NULL DEFAULT 4`
- **`total_rooms`**: `INT NOT NULL DEFAULT 40`
- **`is_active`**: `BOOLEAN NOT NULL DEFAULT TRUE`

### 2.2 Table: `users`
Central user identity storage supporting role-based access control.
- **`id`**: `INT AUTO_INCREMENT PRIMARY KEY`
- **`email`**: `VARCHAR(150) NOT NULL UNIQUE`
- **`role`**: `ENUM('student', 'staff', 'admin') NOT NULL`
- **`account_status`**: `ENUM('active', 'inactive') NOT NULL DEFAULT 'active'`
- **Indexes**: `idx_users_role`, `idx_users_status`, `idx_users_block_room`

### 2.3 Table: `complaint_categories`
Classification master defining maintenance disciplines.
- **`id`**: `INT AUTO_INCREMENT PRIMARY KEY`
- **`name`**: `VARCHAR(100) NOT NULL UNIQUE` (Electrical, Plumbing, Water Supply, Cleaning, Room Repair, Other Maintenance)
- **`active`**: `BOOLEAN NOT NULL DEFAULT TRUE`

### 2.4 Table: `complaints`
Primary operational ticket entity.
- **`ticket_number`**: `VARCHAR(40) NOT NULL UNIQUE` (`HC-YYYYMMDD-XXXX`)
- **`priority`**: `ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal'`
- **`status`**: `ENUM('pending', 'assigned', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'pending'`
- **Foreign Keys**:
  - `fk_complaint_student`: `student_id -> users(id)` (`ON DELETE RESTRICT ON UPDATE CASCADE`)
  - `fk_complaint_category`: `category_id -> complaint_categories(id)` (`ON DELETE RESTRICT ON UPDATE CASCADE`)
- **Indexes**: `idx_complaints_status`, `idx_complaints_student`, `idx_complaints_category`, `idx_complaints_priority`, `idx_complaints_created`

### 2.5 Table: `complaint_assignments`
Tracks technician delegation and work assignment history.
- **`complaint_id`**: FK $\rightarrow$ `complaints(id)` (`ON DELETE CASCADE`)
- **`staff_id`**: FK $\rightarrow$ `users(id)` (technician)
- **`assigned_by`**: FK $\rightarrow$ `users(id)` (supervisor or administrator)
- **`unassigned_at`**: `DATETIME NULL` (permits reassignments without record deletion)

### 2.6 Table: `complaint_status_history`
Immutable state transition ledger.
- **`old_status`**, **`new_status`**: Strict `ENUM` lifecycle states.
- **`changed_by`**: FK $\rightarrow$ `users(id)`
- **`remarks`**: Mandatory audit justification when resolving or reopening.

### 2.7 Table: `complaint_attachments`
Photo evidence records with file size, MIME-type, and storage key.
- **`complaint_id`**: FK $\rightarrow$ `complaints(id)` (`ON DELETE CASCADE`)
- **`storage_key`**: Sanitized server-side relative path.

### 2.8 Table: `feedback`
Post-resolution student satisfaction rating.
- **`complaint_id`**: FK $\rightarrow$ `complaints(id)` (`UNIQUE`, enforces 1 feedback per complaint).
- **`rating`**: `TINYINT NOT NULL` with `CHECK (rating BETWEEN 1 AND 5)`.

