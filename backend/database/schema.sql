-- ============================================================================
-- HOSTELCARE RELATIONAL DATABASE SCHEMA (MySQL 8.0+)
-- System: Hostel Maintenance & Complaint Management System
-- PBL Phase 1 — Session 2 Database Definition
-- ============================================================================

-- Ensure UTF8MB4 character set for international text & emojis
CREATE DATABASE IF NOT EXISTS hostelcare_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hostelcare_db;

-- Disable foreign key checks during schema creation/migration
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. OPTIONAL/MASTER TABLE: hostel_blocks
-- Physical hostel wings/blocks for spatial grouping and technician allocation
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS hostel_blocks;
CREATE TABLE hostel_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  block_code VARCHAR(20) NOT NULL UNIQUE COMMENT 'Short code e.g. BLK-A, BLK-B',
  block_name VARCHAR(100) NOT NULL COMMENT 'Full descriptive name e.g. Block A (North Wing)',
  total_floors INT NOT NULL DEFAULT 4,
  total_rooms INT NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. CORE TABLE: users
-- Unified user entity supporting Student, Staff, and Admin roles
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,
  role ENUM('student', 'staff', 'admin') NOT NULL,
  account_status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  hostel_block VARCHAR(50) NULL COMMENT 'Associated hostel block for student or staff supervisor',
  room_number VARCHAR(20) NULL COMMENT 'Room number for student resident',
  staff_designation VARCHAR(100) NULL COMMENT 'e.g. Electrician, Plumber, Supervisor, Warden',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (account_status),
  INDEX idx_users_block_room (hostel_block, room_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. CORE TABLE: complaint_categories
-- Master categories classifying maintenance issues
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS complaint_categories;
CREATE TABLE complaint_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. CORE TABLE: complaints
-- Primary maintenance complaint tickets logged by students
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS complaints;
CREATE TABLE complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(40) NOT NULL UNIQUE COMMENT 'Unique ticket format: HC-YYYYMMDD-XXXX',
  student_id INT NOT NULL COMMENT 'Foreign key to users.id (Student owner)',
  category_id INT NOT NULL COMMENT 'Foreign key to complaint_categories.id',
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  hostel_block VARCHAR(50) NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('pending', 'assigned', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL COMMENT 'Timestamp when complaint moved to resolved state',
  CONSTRAINT fk_complaint_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_complaint_category
    FOREIGN KEY (category_id) REFERENCES complaint_categories(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_complaints_status (status),
  INDEX idx_complaints_student (student_id),
  INDEX idx_complaints_category (category_id),
  INDEX idx_complaints_priority (priority),
  INDEX idx_complaints_created (created_at),
  INDEX idx_complaints_block (hostel_block)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. CORE TABLE: complaint_assignments
-- Work delegation audit trail linking complaints to maintenance staff
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS complaint_assignments;
CREATE TABLE complaint_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  staff_id INT NOT NULL COMMENT 'Staff member assigned to resolve the issue',
  assigned_by INT NOT NULL COMMENT 'Supervisor or Admin who performed the assignment',
  notes TEXT NULL COMMENT 'Instructions or special equipment notes',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unassigned_at DATETIME NULL COMMENT 'Set when reassigned or reassignment occurs',
  CONSTRAINT fk_assignment_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assignment_staff
    FOREIGN KEY (staff_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assignment_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_assignment_complaint (complaint_id),
  INDEX idx_assignment_staff (staff_id),
  INDEX idx_assignment_active (complaint_id, unassigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. CORE TABLE: complaint_status_history
-- Immutable audit log of every lifecycle state transition
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS complaint_status_history;
CREATE TABLE complaint_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  changed_by INT NOT NULL COMMENT 'User who triggered the state transition',
  old_status ENUM('pending', 'assigned', 'in_progress', 'resolved', 'closed') NULL,
  new_status ENUM('pending', 'assigned', 'in_progress', 'resolved', 'closed') NOT NULL,
  remarks TEXT NULL COMMENT 'Mandatory when resolving or reopening tickets',
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_history_changed_by
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_history_complaint (complaint_id),
  INDEX idx_history_changed_by (changed_by),
  INDEX idx_history_date (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. CORE TABLE: complaint_attachments
-- Metadata and disk storage keys for uploaded photograph proof
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS complaint_attachments;
CREATE TABLE complaint_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  storage_key VARCHAR(500) NOT NULL COMMENT 'Server-generated sanitized storage filename/path',
  original_name VARCHAR(255) NOT NULL COMMENT 'Original client filename',
  mime_type VARCHAR(100) NOT NULL COMMENT 'image/jpeg, image/png, image/webp',
  size_bytes BIGINT UNSIGNED NOT NULL COMMENT 'File size in bytes (max 5MB)',
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachment_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_attachment_complaint (complaint_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. CORE TABLE: feedback
-- Post-resolution quality assurance ratings and student comments
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS feedback;
CREATE TABLE feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL UNIQUE COMMENT 'One feedback per resolved ticket',
  student_id INT NOT NULL,
  rating TINYINT NOT NULL COMMENT '1 to 5 star rating',
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_feedback_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  INDEX idx_feedback_student (student_id),
  INDEX idx_feedback_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable foreign key constraints
SET FOREIGN_KEY_CHECKS = 1;

