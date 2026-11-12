-- ============================================================================
-- HOSTELCARE SYNTHETIC DEVELOPMENT SEED DATA
-- System: Hostel Maintenance & Complaint Management System
-- PBL Phase 1 — Session 2 Realistic Demonstration Data
-- Password for all seed accounts: Password@123
-- ============================================================================

USE hostelcare_db;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE feedback;
TRUNCATE TABLE complaint_attachments;
TRUNCATE TABLE complaint_status_history;
TRUNCATE TABLE complaint_assignments;
TRUNCATE TABLE complaints;
TRUNCATE TABLE complaint_categories;
TRUNCATE TABLE users;
TRUNCATE TABLE hostel_blocks;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. SEED: hostel_blocks
-- ----------------------------------------------------------------------------
INSERT INTO hostel_blocks (id, block_code, block_name, total_floors, total_rooms, is_active) VALUES
(1, 'BLK-A', 'Block A (North Wing)', 4, 48, 1),
(2, 'BLK-B', 'Block B (South Wing)', 4, 48, 1),
(3, 'BLK-C', 'Block C (East Wing)', 3, 36, 1),
(4, 'BLK-D', 'Block D (West Wing)', 3, 36, 1);

-- ----------------------------------------------------------------------------
-- 2. SEED: users
-- 1 Admin, 3 Staff (Supervisor, Electrician, Plumber), 4 Students
-- BCrypt Hash: $2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, phone, role, account_status, hostel_block, room_number, staff_designation) VALUES
-- Administrator
(1, 'Chief Warden Sharma', 'admin@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9811002233', 'admin', 'active', NULL, NULL, 'Chief Hostel Administrator'),

-- Staff Maintenance Team
(2, 'Sunita Sharma', 'sunita.supervisor@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9822003344', 'staff', 'active', 'Block A', NULL, 'Maintenance Supervisor'),
(3, 'Rajesh Kumar', 'rajesh.electrician@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9833004455', 'staff', 'active', 'Block A', NULL, 'Senior Electrician'),
(4, 'Ramesh Patel', 'ramesh.plumber@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9844005566', 'staff', 'active', 'Block B', NULL, 'Plumbing Specialist'),

-- Students
(5, 'Rahul Sharma', 'rahul.cs23@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9855006677', 'student', 'active', 'Block A', 'A-102', NULL),
(6, 'Priya Verma', 'priya.ee24@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9866007788', 'student', 'active', 'Block B', 'B-204', NULL),
(7, 'Aman Gupta', 'aman.me23@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9877008899', 'student', 'active', 'Block A', 'A-310', NULL),
(8, 'Sneha Rao', 'sneha.cv24@hostelcare.edu', '$2a$10$9i4HF7IgiPZx4Ng.SCpKIeHGIcVsW6Nf9OIE/NjnZhuskb65jdCqO', '+91 9888009900', 'student', 'active', 'Block C', 'C-115', NULL);

-- ----------------------------------------------------------------------------
-- 3. SEED: complaint_categories
-- ----------------------------------------------------------------------------
INSERT INTO complaint_categories (id, name, description, active) VALUES
(1, 'Electrical', 'Ceiling fans, switchboards, lighting, fuses, power socket malfunctions', 1),
(2, 'Plumbing', 'Water leakage, pipe blocks, washbasin taps, flush valve defects', 1),
(3, 'Water Supply', 'Water shortages, contaminated water, geyser failures, storage tank overflow', 1),
(4, 'Cleaning', 'Room sanitation, corridor cleanliness, washroom hygiene, garbage clearance', 1),
(5, 'Room Repair', 'Doors, window latches, study tables, almirah locks, bed frame damage', 1),
(6, 'Other Maintenance', 'Pest control, internet port structural damage, common room amenities', 1);

-- ----------------------------------------------------------------------------
-- 4. SEED: complaints
-- Cover the full status lifecycle: pending, assigned, in_progress, resolved, closed
-- ----------------------------------------------------------------------------
INSERT INTO complaints (id, ticket_number, student_id, category_id, title, description, hostel_block, room_number, priority, status, created_at, resolved_at) VALUES
-- 1. In Progress Electrical Ticket
(1, 'HC-20261101-0001', 5, 1, 'Ceiling fan regulator burnt and sparking', 'The speed regulator is sparking when turned to speed 3. Smells of burning plastic. Cannot operate fan.', 'Block A', 'A-102', 'high', 'in_progress', '2026-11-01 10:15:00', NULL),

-- 2. Assigned Plumbing Ticket
(2, 'HC-20261102-0002', 6, 2, 'Continuous tap leakage in bathroom sink', 'Water dripping constantly from cold water faucet. Water wastage and constant dripping noise.', 'Block B', 'B-204', 'normal', 'assigned', '2026-11-02 11:30:00', NULL),

-- 3. Pending Urgent Water Ticket
(3, 'HC-20261103-0003', 7, 3, 'Water cooler on 3rd floor non-functional', 'The main drinking water cooler is not dispensing water. Entire floor has no drinking water supply.', 'Block A', 'A-310', 'urgent', 'pending', '2026-11-03 08:45:00', NULL),

-- 4. Resolved Room Repair Ticket
(4, 'HC-20261104-0004', 8, 5, 'Study chair leg joint broken', 'The wooden joint on the right rear chair leg has snapped. Dangerous to sit on.', 'Block C', 'C-115', 'low', 'resolved', '2026-11-04 14:00:00', '2026-11-05 16:30:00'),

-- 5. Closed Electrical Ticket
(5, 'HC-20261105-0005', 5, 1, 'Corridor tube light flickering near room A-102', 'Tube light choke is humming loudly and flickering continuously since yesterday evening.', 'Block A', 'A-102', 'normal', 'closed', '2026-11-05 09:20:00', '2026-11-06 11:00:00');

-- ----------------------------------------------------------------------------
-- 5. SEED: complaint_assignments
-- ----------------------------------------------------------------------------
INSERT INTO complaint_assignments (id, complaint_id, staff_id, assigned_by, notes, assigned_at) VALUES
(1, 1, 3, 2, 'Replace modular fan regulator and inspect wire insulation.', '2026-11-01 11:00:00'),
(2, 2, 4, 2, 'Inspect washer and spindle valve. Replace if worn out.', '2026-11-02 12:15:00'),
(3, 4, 3, 2, 'Carpentry inspection: provide replacement chair from inventory.', '2026-11-04 15:00:00'),
(4, 5, 3, 2, 'Replace choke and starter with new LED batten.', '2026-11-05 10:00:00');

-- ----------------------------------------------------------------------------
-- 6. SEED: complaint_status_history
-- Audit log of status transitions
-- ----------------------------------------------------------------------------
INSERT INTO complaint_status_history (id, complaint_id, changed_by, old_status, new_status, remarks, changed_at) VALUES
-- Complaint 1 lifecycle
(1, 1, 5, NULL, 'pending', 'Complaint lodged by resident.', '2026-11-01 10:15:00'),
(2, 1, 2, 'pending', 'assigned', 'Assigned to Rajesh Kumar (Electrician).', '2026-11-01 11:00:00'),
(3, 1, 3, 'assigned', 'in_progress', 'Technician procured replacement regulator from store, inspection underway.', '2026-11-01 14:20:00'),

-- Complaint 2 lifecycle
(4, 2, 6, NULL, 'pending', 'Complaint lodged by resident.', '2026-11-02 11:30:00'),
(5, 2, 2, 'pending', 'assigned', 'Assigned to Ramesh Patel (Plumber).', '2026-11-02 12:15:00'),

-- Complaint 3 lifecycle
(6, 3, 7, NULL, 'pending', 'Complaint lodged by resident.', '2026-11-03 08:45:00'),

-- Complaint 4 lifecycle (Resolved)
(7, 4, 8, NULL, 'pending', 'Complaint lodged by resident.', '2026-11-04 14:00:00'),
(8, 4, 2, 'pending', 'assigned', 'Assigned to Rajesh Kumar.', '2026-11-04 15:00:00'),
(9, 4, 3, 'assigned', 'in_progress', 'Inspecting inventory for spare ergonomic study chair.', '2026-11-05 10:00:00'),
(10, 4, 3, 'in_progress', 'resolved', 'Delivered new wooden study chair. Student verified replacement.', '2026-11-05 16:30:00'),

-- Complaint 5 lifecycle (Closed)
(11, 5, 5, NULL, 'pending', 'Complaint lodged by resident.', '2026-11-05 09:20:00'),
(12, 5, 2, 'pending', 'assigned', 'Assigned to Rajesh Kumar.', '2026-11-05 10:00:00'),
(13, 5, 3, 'assigned', 'in_progress', 'Replacing fitting with 20W LED batten.', '2026-11-05 15:00:00'),
(14, 5, 3, 'in_progress', 'resolved', 'New LED light installed and tested.', '2026-11-06 11:00:00'),
(15, 5, 5, 'resolved', 'closed', 'Student confirmed work quality and closed ticket.', '2026-11-06 18:00:00');

-- ----------------------------------------------------------------------------
-- 7. SEED: complaint_attachments
-- ----------------------------------------------------------------------------
INSERT INTO complaint_attachments (id, complaint_id, storage_key, original_name, mime_type, size_bytes, uploaded_at) VALUES
(1, 1, 'complaints/seed-regulator-spark.jpg', 'regulator_damage.jpg', 'image/jpeg', 1420580, '2026-11-01 10:15:00'),
(2, 2, 'complaints/seed-leaking-tap.png', 'sink_tap_leak.png', 'image/png', 2140220, '2026-11-02 11:30:00');

-- ----------------------------------------------------------------------------
-- 8. SEED: feedback
-- ----------------------------------------------------------------------------
INSERT INTO feedback (id, complaint_id, student_id, rating, comment, created_at) VALUES
(1, 4, 8, 5, 'Quick response! Replacement study chair was delivered within 24 hours in pristine condition.', '2026-11-05 17:00:00'),
(2, 5, 5, 4, 'Corridor light fixed properly. Good illumination now.', '2026-11-06 18:05:00');

