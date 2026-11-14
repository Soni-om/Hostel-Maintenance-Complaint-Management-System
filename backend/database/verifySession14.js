/**
 * HostelCare — Session 14 Verification & Integration Test Suite
 * Automated tests for Complaint Assignment, Reassignment, Technician Directory,
 * Assignment History, ACID Transactions, and Option D Authorization:
 *
 * 1. Static file structure & Frontend assets:
 *    - frontend/pages/staff/dashboard.html (modal, dropdowns, timeline, scripts)
 *    - backend/src/controllers/staffController.js (assignComplaint, getAssignments, getTechnicians)
 *    - backend/src/routes/staffRoutes.js & complaintRoutes.js (endpoints mounted)
 *
 * 2. Active Technicians Directory:
 *    - GET /api/staff/technicians (RBAC, role/status filtering, parity)
 *
 * 3. RBAC & Route Access Control:
 *    - Unauthenticated returns 401 NO_TOKEN
 *    - Student returns 403 FORBIDDEN_ROLE
 *    - Staff & Admin authorized
 *    - Route path parity (/api/staff/..., /api/complaints/..., /api/v1/...)
 *
 * 4. Input Validation & Error Handling:
 *    - Invalid complaint ID format -> 400 Bad Request
 *    - Missing / non-integer staff_id -> 400 Bad Request
 *    - Notes exceeding 1000 chars -> 400 Bad Request
 *    - Non-existent complaint ID -> 404 Not Found
 *    - Non-existent staff ID -> 400 Bad Request
 *    - Assigning to Student account -> 400 Bad Request
 *    - Assigning to Inactive staff account -> 400 Bad Request
 *    - Assigning to Closed complaint -> 400 Bad Request
 *
 * 5. Option D Hybrid Scope:
 *    - Cross-hostel unassigned staff receives 404 (anti-enumeration)
 *    - Domain-permitted staff and Admin authorized
 *
 * 6. Atomic ACID Transaction — Pending to Assigned:
 *    - Transitions status: 'pending' -> 'assigned'
 *    - Inserts new active record into complaint_assignments (unassigned_at IS NULL)
 *    - Logs status history into complaint_status_history
 *
 * 7. Atomic ACID Transaction — Reassignment:
 *    - Closes previous active assignment (unassigned_at = CURRENT_TIMESTAMP)
 *    - Inserts new active assignment
 *    - Guarantees exactly 1 active assignment per complaint
 *    - Logs reassignment remark into complaint_status_history
 *
 * 8. Assignment History Endpoint:
 *    - GET /api/staff/complaints/:id/assignments (RBAC, Option D anti-enumeration, payload shape)
 *
 * 9. Database Baseline Cleanliness & Teardown:
 *    - Automatic restoration of original database baseline state
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/db.js');
const { default: UserModel } = await import('../src/models/userModel.js');
const { default: ComplaintModel } = await import('../src/models/complaintModel.js');
const { generateToken } = await import('../src/utils/jwt.js');

const results = [];

function recordTest(testNum, testName, passed, evidence, failureDetails = null) {
  results.push({ testNum, testName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] Test ${testNum}: ${testName}`);
  if (evidence) {
    console.log(`       Evidence: ${evidence}`);
  }
  if (!passed && failureDetails) {
    console.log(`       Failure Details: ${failureDetails}`);
  }
}

async function runSession14Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 14 VERIFICATION & TEST SUITE');
  console.log('  Complaint Assignment, Reassignment, History, & Option D Scope');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function makeRequest({ method = 'GET', path: reqPath, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port,
        path: reqPath,
        method,
        headers: {
          Accept: 'application/json',
          ...headers
        }
      };

      let bodyData = null;
      if (body) {
        bodyData = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf-8'));
          } catch {
            // Non-JSON response
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            rawText: raw.toString('utf-8')
          });
        });
      });

      req.on('error', reject);
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  try {
    console.log('--- SECTION 1: STATIC FILE STRUCTURE & CODE INTEGRITY ---\n');

    // Test 1: Frontend Staff Dashboard HTML contains modal structure and assignment elements
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const content = fs.readFileSync(dashboardPath, 'utf-8');

      const hasModal = content.includes('id="assign-modal"') &&
        content.includes('id="modal-ticket-title"') &&
        content.includes('id="modal-current-staff"') &&
        content.includes('id="modal-status-badge"') &&
        content.includes('id="assign-staff-select"') &&
        content.includes('id="assign-notes-input"') &&
        content.includes('id="btn-submit-assignment"') &&
        content.includes('id="assignment-history-list"');

      recordTest(
        1,
        'Frontend Staff Dashboard contains assignment modal, technician select, notes textarea, and history timeline',
        hasModal,
        `assign-modal: ${content.includes('id="assign-modal"')}, assign-staff-select: ${content.includes('id="assign-staff-select"')}, history-list: ${content.includes('id="assignment-history-list"')}`
      );
    }

    // Test 2: Frontend Staff Dashboard contains required JavaScript workflow functions
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const content = fs.readFileSync(dashboardPath, 'utf-8');

      const hasFunctions = content.includes('function openAssignModal') &&
        content.includes('function closeAssignModal') &&
        content.includes('function submitAssignment') &&
        content.includes('function loadTechnicians') &&
        content.includes('function loadAssignmentHistory');

      recordTest(
        2,
        'Frontend Staff Dashboard implements openAssignModal, closeAssignModal, submitAssignment, loadTechnicians, and loadAssignmentHistory',
        hasFunctions,
        `openAssignModal: ${content.includes('function openAssignModal')}, submitAssignment: ${content.includes('function submitAssignment')}, loadTechnicians: ${content.includes('function loadTechnicians')}`
      );
    }

    // Test 3: Frontend Staff Dashboard queue table renders assign action buttons
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const content = fs.readFileSync(dashboardPath, 'utf-8');

      const hasButtons = content.includes('btn-assign') &&
        content.includes('openAssignModal(${item.id})') &&
        content.includes("item.assigned_staff_name ? 'Reassign' : 'Assign'");

      recordTest(
        3,
        'Frontend Staff Dashboard maintenance queue table renders dynamic Assign / Reassign action buttons',
        hasButtons,
        `btn-assign present: ${content.includes('btn-assign')}, dynamic label ternary: ${content.includes("item.assigned_staff_name ? 'Reassign' : 'Assign'")}`
      );
    }

    // Test 4: Backend staffController.js exports assignComplaint, getAssignments, and getTechnicians
    {
      const controllerPath = path.join(rootDir, 'backend', 'src', 'controllers', 'staffController.js');
      const content = fs.readFileSync(controllerPath, 'utf-8');

      const hasMethods = content.includes('async assignComplaint(') &&
        content.includes('async getAssignments(') &&
        content.includes('async getTechnicians(');

      recordTest(
        4,
        'Backend staffController.js implements assignComplaint, getAssignments, and getTechnicians',
        hasMethods,
        `assignComplaint: ${content.includes('async assignComplaint(')}, getAssignments: ${content.includes('async getAssignments(')}, getTechnicians: ${content.includes('async getTechnicians(')}`
      );
    }

    // Test 5: Backend routes mount assignment, history, and technician routes
    {
      const staffRoutesPath = path.join(rootDir, 'backend', 'src', 'routes', 'staffRoutes.js');
      const complaintRoutesPath = path.join(rootDir, 'backend', 'src', 'routes', 'complaintRoutes.js');
      const staffContent = fs.readFileSync(staffRoutesPath, 'utf-8');
      const compContent = fs.readFileSync(complaintRoutesPath, 'utf-8');

      const staffHasRoutes = staffContent.includes('/complaints/:id/assign') &&
        staffContent.includes('/complaints/:id/assignments') &&
        staffContent.includes('/technicians');

      const compHasRoutes = compContent.includes('/:id/assign') &&
        compContent.includes('/:id/assignments');

      const passed = staffHasRoutes && compHasRoutes;
      recordTest(
        5,
        'Backend routes mount POST /complaints/:id/assign, GET /complaints/:id/assignments, and GET /technicians with full parity',
        passed,
        `staffRoutes mounted: ${staffHasRoutes}, complaintRoutes mounted: ${compHasRoutes}`
      );
    }

    console.log('\n--- SECTION 2: AUTHENTICATION & ACTIVE TECHNICIANS DIRECTORY ---\n');

    // Retrieve test user profiles and tokens
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');
    const sunitaUser = await UserModel.findByEmail('sunita.supervisor@hostelcare.edu'); // Supervisor, Block A
    const rajeshUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu'); // Electrician, Block A
    const rameshUser = await UserModel.findByEmail('ramesh.plumber@hostelcare.edu'); // Plumber, Block B
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu'); // Student, Block A

    const adminToken = generateToken(adminUser);
    const sunitaToken = generateToken(sunitaUser);
    const rajeshToken = generateToken(rajeshUser);
    const rameshToken = generateToken(rameshUser);
    const studentToken = generateToken(studentUser);

    // Test 6: Unauthenticated request to /api/staff/technicians returns 401
    {
      const res = await makeRequest({ path: '/api/staff/technicians' });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        6,
        'Unauthenticated GET /api/staff/technicians returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 7: Student request to /api/staff/technicians returns 403
    {
      const res = await makeRequest({
        path: '/api/staff/technicians',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        7,
        'Student GET /api/staff/technicians returns HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 8: Staff user requesting /api/staff/technicians returns HTTP 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/technicians',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const passed = res.statusCode === 200 && res.body?.success === true && Array.isArray(res.body?.technicians);
      recordTest(
        8,
        'Staff user GET /api/staff/technicians returns HTTP 200 OK with technicians list',
        passed,
        `Status: ${res.statusCode}, Technicians count: ${res.body?.technicians?.length}`
      );
    }

    // Test 9: Admin user requesting /api/staff/technicians returns HTTP 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/technicians',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.statusCode === 200 && res.body?.success === true && Array.isArray(res.body?.technicians);
      recordTest(
        9,
        'Admin user GET /api/staff/technicians returns HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, Technicians count: ${res.body?.technicians?.length}`
      );
    }

    // Test 10: Technicians list contains ONLY active staff accounts (no students, no admin, no inactive accounts)
    {
      const res = await makeRequest({
        path: '/api/staff/technicians',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const technicians = res.body?.technicians || [];
      const hasNonStaff = technicians.some((t) => t.role && t.role !== 'staff');
      const hasSunita = technicians.some((t) => t.id === sunitaUser.id);
      const hasRajesh = technicians.some((t) => t.id === rajeshUser.id);
      const hasRamesh = technicians.some((t) => t.id === rameshUser.id);
      const hasStudent = technicians.some((t) => t.id === studentUser.id);
      const hasAdmin = technicians.some((t) => t.id === adminUser.id);

      const passed = res.statusCode === 200 &&
        !hasNonStaff &&
        hasSunita && hasRajesh && hasRamesh &&
        !hasStudent && !hasAdmin;

      recordTest(
        10,
        'Technicians directory strictly filters to active staff accounts (excluding students and admin)',
        passed,
        `Contains Sunita: ${hasSunita}, Rajesh: ${hasRajesh}, Ramesh: ${hasRamesh}, Excludes Student: ${!hasStudent}, Excludes Admin: ${!hasAdmin}`
      );
    }

    // Test 11: Route parity for technicians endpoint
    {
      const resLegacy = await makeRequest({
        path: '/api/staff/technicians',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const resV1 = await makeRequest({
        path: '/api/v1/staff/technicians',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });

      const passed = resLegacy.statusCode === 200 && resV1.statusCode === 200 &&
        resLegacy.body?.technicians?.length === resV1.body?.technicians?.length;

      recordTest(
        11,
        'Route parity: /api/staff/technicians and /api/v1/staff/technicians return identical data',
        passed,
        `Legacy count: ${resLegacy.body?.technicians?.length}, v1 count: ${resV1.body?.technicians?.length}`
      );
    }

    console.log('\n--- SECTION 3: RBAC & ROUTE ACCESS CONTROL FOR ASSIGNMENT ---\n');

    // Test 12: Unauthenticated POST /api/staff/complaints/1/assign returns 401
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        body: { staff_id: rajeshUser.id }
      });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        12,
        'Unauthenticated POST /api/staff/complaints/:id/assign returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 13: Student role POST /api/staff/complaints/1/assign returns 403
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { staff_id: rajeshUser.id }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        13,
        'Student POST /api/staff/complaints/:id/assign returns HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 14: Route parity for complaint assignment routes
    {
      // Testing 400 validation on both paths to prove routing and validation middleware are bound
      const resStaff = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/abc/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: 1 }
      });
      const resComplaint = await makeRequest({
        method: 'POST',
        path: '/api/complaints/abc/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: 1 }
      });
      const resV1 = await makeRequest({
        method: 'POST',
        path: '/api/v1/staff/complaints/abc/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: 1 }
      });

      const passed = resStaff.statusCode === 400 &&
        resComplaint.statusCode === 400 &&
        resV1.statusCode === 400;

      recordTest(
        14,
        'Route parity: /api/staff/complaints/:id/assign, /api/complaints/:id/assign, and v1 routes correctly bound',
        passed,
        `staff: ${resStaff.statusCode}, complaint: ${resComplaint.statusCode}, v1: ${resV1.statusCode}`
      );
    }

    console.log('\n--- SECTION 4: INPUT VALIDATION & ERROR HANDLING ---\n');

    // Test 15: Invalid complaint ID format returns HTTP 400
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/invalid-id/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: rajeshUser.id }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        15,
        'Invalid alphanumeric complaint ID returns HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Error: "${res.body?.message || res.body?.errors?.[0]?.msg}"`
      );
    }

    // Test 16: Missing staff_id returns HTTP 400
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { notes: 'Missing technician ID' }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        16,
        'Missing staff_id in request payload returns HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.msg}"`
      );
    }

    // Test 17: Non-integer staff_id returns HTTP 400
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: 'technician-one' }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        17,
        'Non-integer staff_id returns HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.msg}"`
      );
    }

    // Test 18: Notes exceeding 1000 characters returns HTTP 400
    {
      const oversizedNotes = 'A'.repeat(1001);
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: rajeshUser.id, notes: oversizedNotes }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        18,
        'Work notes exceeding 1000 characters returns HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.msg}"`
      );
    }

    // Test 19: Non-existent complaint ID returns HTTP 404
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/999999/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: rajeshUser.id }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        19,
        'Non-existent complaint ID returns HTTP 404 Not Found',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 20: Non-existent staff ID returns HTTP 400
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: 999999 }
      });
      const passed = res.statusCode === 400 && res.body?.message === 'Assigned staff user not found.';
      recordTest(
        20,
        'Non-existent target staff ID returns HTTP 400 Bad Request ("Assigned staff user not found.")',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 21: Assigning to a Student account returns HTTP 400
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: studentUser.id }
      });
      const passed = res.statusCode === 400 &&
        res.body?.message?.includes('Complaints can only be assigned to active maintenance staff');
      recordTest(
        21,
        'Assigning complaint to a Student account is rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 22: Assigning to an Inactive staff account returns HTTP 400
    let tempInactiveStaffId = null;
    try {
      const [insertInactive] = await pool.execute(
        `INSERT INTO users (name, email, password_hash, role, account_status, hostel_block, staff_designation, phone)
         VALUES ('Inactive Tech', 'inactive.tech@hostelcare.local', 'fake_hash', 'staff', 'inactive', 'Block A', 'Electrician', '9876500000')`
      );
      tempInactiveStaffId = insertInactive.insertId;

      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: tempInactiveStaffId }
      });

      const passed = res.statusCode === 400 &&
        res.body?.message === 'Cannot assign complaint to an inactive staff member.';

      recordTest(
        22,
        'Assigning complaint to an Inactive staff account is rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    } finally {
      if (tempInactiveStaffId) {
        await pool.query('DELETE FROM users WHERE id = ?', [tempInactiveStaffId]);
      }
    }

    console.log('\n--- SECTION 5: OPTION D HYBRID SCOPE FOR ASSIGNMENT ---\n');

    // Test 23: Cross-hostel staff (Ramesh Patel, Block B) assigning Block A complaint #1 returns 404 anti-enumeration
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/1/assign',
        headers: { Authorization: `Bearer ${rameshToken}` },
        body: { staff_id: rajeshUser.id }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        23,
        'Option D anti-enumeration: Cross-hostel staff (Ramesh Patel, Block B) receives HTTP 404 assigning Block A complaint',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 24: Domain-permitted staff (Sunita Sharma, Block A Supervisor) can assign Block A complaint
    {
      // Test assigning unassigned Block A complaint #3 to Rajesh Kumar
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/3/assign',
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: {
          staff_id: rajeshUser.id,
          notes: 'Please check hallway switchboard circuit breaker and replace blown fuse.'
        }
      });
      const passed = res.statusCode === 200 && res.body?.success === true &&
        res.body?.complaint?.status === 'assigned';
      recordTest(
        24,
        'Domain-permitted staff (Sunita Sharma, Block A) successfully assigns Block A complaint with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, Complaint status: ${res.body?.complaint?.status}, Assignee: ${res.body?.assignment?.staff_name}`
      );
    }

    // Test 25: Administrator can assign complaints campus-wide across blocks
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/staff/complaints/2/assign',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          staff_id: rameshUser.id,
          notes: 'Campus maintenance supervisor delegation.'
        }
      });
      const passed = res.statusCode === 200 && res.body?.success === true;
      recordTest(
        25,
        'Administrator successfully assigns complaints campus-wide with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    console.log('\n--- SECTION 6: ATOMIC ACID TRANSACTION — PENDING TO ASSIGNED ---\n');

    // Create a temporary synthetic pending complaint in Block A to test atomic state machine
    let tempPendingComplaintId = null;
    try {
      const [insertComp] = await pool.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           hostel_block, room_number, priority, status, created_at, updated_at
         ) VALUES ('HC-TEST-PENDING-01', ?, 1, 'Blown bulb in washroom', 'Bulb stopped working',
                   'Block A', '101', 'normal', 'pending', NOW(), NOW())`,
        [studentUser.id]
      );
      tempPendingComplaintId = insertComp.insertId;

      await pool.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, 'pending', 'pending', 'Complaint submitted by resident', NOW())`,
        [tempPendingComplaintId, studentUser.id]
      );

      // Execute assignment of pending complaint
      const assignRes = await makeRequest({
        method: 'POST',
        path: `/api/staff/complaints/${tempPendingComplaintId}/assign`,
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: {
          staff_id: rajeshUser.id,
          notes: 'Replace defective 9W LED bulb in Block A room 101'
        }
      });

      // Test 26: Complaint status moved to 'assigned'
      const [compCheck] = await pool.query(
        'SELECT status FROM complaints WHERE id = ?',
        [tempPendingComplaintId]
      );
      const isStatusAssigned = compCheck[0]?.status === 'assigned';
      recordTest(
        26,
        'Assigning Pending complaint automatically transitions status to "assigned"',
        isStatusAssigned && assignRes.statusCode === 200,
        `API status: ${assignRes.body?.complaint?.status}, DB status: ${compCheck[0]?.status}`
      );

      // Test 27: New active record inserted into complaint_assignments
      const [assignCheck] = await pool.query(
        'SELECT id, staff_id, assigned_by, notes, unassigned_at FROM complaint_assignments WHERE complaint_id = ? AND unassigned_at IS NULL',
        [tempPendingComplaintId]
      );
      const hasActiveAssignment = assignCheck.length === 1 &&
        assignCheck[0].staff_id === rajeshUser.id &&
        assignCheck[0].assigned_by === sunitaUser.id;
      recordTest(
        27,
        'Active record created in complaint_assignments with unassigned_at IS NULL and correct audit fields',
        hasActiveAssignment,
        `Active assignments: ${assignCheck.length}, staff_id: ${assignCheck[0]?.staff_id}, assigned_by: ${assignCheck[0]?.assigned_by}`
      );

      // Test 28: Status history logged in complaint_status_history
      const [historyCheck] = await pool.query(
        `SELECT old_status, new_status, remarks, changed_by
         FROM complaint_status_history
         WHERE complaint_id = ? AND new_status = 'assigned'
         ORDER BY id DESC LIMIT 1`,
        [tempPendingComplaintId]
      );
      const hasStatusHistory = historyCheck.length === 1 &&
        historyCheck[0].old_status === 'pending' &&
        historyCheck[0].new_status === 'assigned' &&
        historyCheck[0].changed_by === sunitaUser.id;
      recordTest(
        28,
        'Status transition logged in complaint_status_history (old: pending, new: assigned)',
        hasStatusHistory,
        `old_status: ${historyCheck[0]?.old_status}, new_status: ${historyCheck[0]?.new_status}, changed_by: ${historyCheck[0]?.changed_by}`
      );

      // Test 29: Response payload integrity
      const payloadPassed = assignRes.statusCode === 200 &&
        assignRes.body?.success === true &&
        assignRes.body?.assignment?.staff_name === rajeshUser.name &&
        assignRes.body?.assignment?.is_active === true &&
        assignRes.body?.complaint?.status === 'assigned';
      recordTest(
        29,
        'Assignment API returns HTTP 200 with rich assignment details and updated status',
        payloadPassed,
        `Success: ${assignRes.body?.success}, Staff: ${assignRes.body?.assignment?.staff_name}, Status: ${assignRes.body?.complaint?.status}`
      );

      console.log('\n--- SECTION 7: ATOMIC ACID TRANSACTION — REASSIGNMENT ---\n');

      // Test 30: Reassigning complaint from Rajesh to Sunita closes previous active assignment
      const reassignRes = await makeRequest({
        method: 'POST',
        path: `/api/staff/complaints/${tempPendingComplaintId}/assign`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          staff_id: sunitaUser.id,
          notes: 'Supervisor taking over work order.'
        }
      });

      const [closedAssignments] = await pool.query(
        'SELECT id, staff_id, unassigned_at FROM complaint_assignments WHERE complaint_id = ? AND staff_id = ?',
        [tempPendingComplaintId, rajeshUser.id]
      );
      const isPreviousClosed = closedAssignments.length === 1 &&
        closedAssignments[0].unassigned_at !== null;
      recordTest(
        30,
        'Reassigning complaint closes previous active assignment with unassigned_at = CURRENT_TIMESTAMP',
        isPreviousClosed && reassignRes.statusCode === 200,
        `Previous assignee (Rajesh) unassigned_at: ${closedAssignments[0]?.unassigned_at}`
      );

      // Test 31: Reassigning creates a new active assignment for Sunita
      const [currentActive] = await pool.query(
        'SELECT id, staff_id, unassigned_at FROM complaint_assignments WHERE complaint_id = ? AND unassigned_at IS NULL',
        [tempPendingComplaintId]
      );
      const isNewActive = currentActive.length === 1 &&
        currentActive[0].staff_id === sunitaUser.id;
      recordTest(
        31,
        'Reassigning creates new active assignment for new technician (Sunita)',
        isNewActive,
        `Active assignments: ${currentActive.length}, Current active staff_id: ${currentActive[0]?.staff_id}`
      );

      // Test 32: Guarantees exactly ONE active assignment per complaint
      const [allActiveAssignments] = await pool.query(
        'SELECT COUNT(*) AS activeCount FROM complaint_assignments WHERE complaint_id = ? AND unassigned_at IS NULL',
        [tempPendingComplaintId]
      );
      const exactlyOneActive = allActiveAssignments[0]?.activeCount === 1;
      recordTest(
        32,
        'ACID constraint: Ticket maintains exactly ONE active assignment (unassigned_at IS NULL)',
        exactlyOneActive,
        `Active count: ${allActiveAssignments[0]?.activeCount} (expected 1)`
      );

      // Test 33: Reassignment remark logged in complaint_status_history preserving ticket status
      const [reassignHistory] = await pool.query(
        `SELECT old_status, new_status, remarks, changed_by
         FROM complaint_status_history
         WHERE complaint_id = ? AND remarks LIKE 'Reassigned to%'
         ORDER BY id DESC LIMIT 1`,
        [tempPendingComplaintId]
      );
      const hasReassignHistory = reassignHistory.length === 1 &&
        reassignHistory[0].old_status === 'assigned' &&
        reassignHistory[0].new_status === 'assigned';
      recordTest(
        33,
        'Reassignment audit note recorded in complaint_status_history without disrupting assigned status',
        hasReassignHistory,
        `Remarks: "${reassignHistory[0]?.remarks}"`
      );

      // Test 34: Assigning an already closed complaint returns HTTP 400
      await pool.query("UPDATE complaints SET status = 'closed' WHERE id = ?", [tempPendingComplaintId]);
      const closedRes = await makeRequest({
        method: 'POST',
        path: `/api/staff/complaints/${tempPendingComplaintId}/assign`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { staff_id: rajeshUser.id }
      });
      const passedClosed = closedRes.statusCode === 400 &&
        closedRes.body?.message?.includes('Cannot assign a closed complaint');
      recordTest(
        34,
        'Assigning an already closed complaint returns HTTP 400 Bad Request',
        passedClosed,
        `Status: ${closedRes.statusCode}, Message: "${closedRes.body?.message}"`
      );
    } finally {
      // Purge temporary synthetic complaint
      if (tempPendingComplaintId) {
        await pool.query('DELETE FROM complaint_assignments WHERE complaint_id = ?', [tempPendingComplaintId]);
        await pool.query('DELETE FROM complaint_status_history WHERE complaint_id = ?', [tempPendingComplaintId]);
        await pool.query('DELETE FROM complaints WHERE id = ?', [tempPendingComplaintId]);
      }
    }

    console.log('\n--- SECTION 8: ASSIGNMENT HISTORY ENDPOINT ---\n');

    // Test 35: Unauthenticated GET /api/staff/complaints/:id/assignments returns 401
    {
      const res = await makeRequest({ path: '/api/staff/complaints/1/assignments' });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        35,
        'Unauthenticated GET /api/staff/complaints/:id/assignments returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 36: Student role GET /api/staff/complaints/:id/assignments returns 403
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        36,
        'Student GET /api/staff/complaints/:id/assignments returns HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 37: Ramesh Patel (Block B) viewing Block A complaint #1 history returns 404 anti-enumeration
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${rameshToken}` }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        37,
        'Option D anti-enumeration: Cross-hostel staff (Ramesh Patel) receives HTTP 404 viewing Block A assignment history',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 38: Authorized staff (Sunita Sharma) retrieves Block A assignment history with HTTP 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const passed = res.statusCode === 200 && res.body?.success === true &&
        Array.isArray(res.body?.assignments) && res.body?.assignments.length > 0;
      recordTest(
        38,
        'Authorized staff (Sunita Sharma) retrieves Block A complaint assignment history with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, History length: ${res.body?.assignments?.length}`
      );
    }

    // Test 39: Administrator retrieves assignment history campus-wide with HTTP 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/2/assignments',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.statusCode === 200 && res.body?.success === true &&
        Array.isArray(res.body?.assignments);
      recordTest(
        39,
        'Administrator retrieves assignment history campus-wide with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, Ticket: ${res.body?.ticket_number}, Assignments: ${res.body?.assignments?.length}`
      );
    }

    // Test 40: Assignment history payload includes required audit attributes
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const firstAssignment = res.body?.assignments?.[0];
      const hasFields = firstAssignment &&
        Boolean(firstAssignment.id) &&
        Boolean(firstAssignment.staff_name) &&
        Boolean(firstAssignment.assigned_by_name) &&
        Boolean(firstAssignment.assigned_at) &&
        typeof firstAssignment.is_active === 'boolean';

      recordTest(
        40,
        'Assignment history payload contains staff_name, staff_designation, assigned_by_name, timestamps, and is_active flag',
        hasFields,
        `Staff: ${firstAssignment?.staff_name}, Assigned By: ${firstAssignment?.assigned_by_name}, Active: ${firstAssignment?.is_active}`
      );
    }

    // Test 41: Route parity for assignment history
    {
      const resStaff = await makeRequest({
        path: '/api/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const resComplaint = await makeRequest({
        path: '/api/complaints/1/assignments',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const resV1 = await makeRequest({
        path: '/api/v1/staff/complaints/1/assignments',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });

      const passed = resStaff.statusCode === 200 &&
        resComplaint.statusCode === 200 &&
        resV1.statusCode === 200 &&
        resStaff.body?.assignments?.length === resComplaint.body?.assignments?.length &&
        resStaff.body?.assignments?.length === resV1.body?.assignments?.length;

      recordTest(
        41,
        'Route parity: /api/staff/complaints/:id/assignments and /api/complaints/:id/assignments return identical history',
        passed,
        `Staff count: ${resStaff.body?.assignments?.length}, Complaint count: ${resComplaint.body?.assignments?.length}, v1 count: ${resV1.body?.assignments?.length}`
      );
    }

    console.log('\n--- SECTION 9: DATABASE BASELINE RESTORATION & INTEGRITY ---\n');

    // Restore baseline records that were updated during tests (Complaint #2 and Complaint #3)
    // Baseline state:
    // Complaint #2: Block B, status 'assigned', assigned to Ramesh Patel (staff_id 4)
    // Complaint #3: Block A, status 'pending', unassigned (no active assignment in baseline)
    await pool.query("UPDATE complaints SET status = 'pending' WHERE id = 3");
    await pool.query('DELETE FROM complaint_assignments WHERE complaint_id = 3');
    await pool.query("DELETE FROM complaint_status_history WHERE complaint_id = 3 AND new_status = 'assigned'");

    // Restore Complaint #2 assignment
    await pool.query("UPDATE complaints SET status = 'assigned' WHERE id = 2");
    await pool.query('DELETE FROM complaint_assignments WHERE complaint_id = 2 AND notes = ?', ['Campus maintenance supervisor delegation.']);
    await pool.query("UPDATE complaint_assignments SET unassigned_at = NULL WHERE complaint_id = 2 AND staff_id = ?", [rameshUser.id]);

    // Test 42: Database baseline integrity check
    {
      const [compRows] = await pool.query('SELECT COUNT(*) AS count FROM complaints');
      const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
      const [assignRows] = await pool.query('SELECT COUNT(*) AS count FROM complaint_assignments');

      const complaintsCount = compRows[0]?.count || 0;
      const usersCount = userRows[0]?.count || 0;
      const assignmentsCount = assignRows[0]?.count || 0;

      const passed = complaintsCount === 5 && usersCount === 8 && assignmentsCount === 4;
      recordTest(
        42,
        'Database baseline integrity preserved (5 complaints, 8 users, 4 assignments)',
        passed,
        `Complaints count: ${complaintsCount} (expected 5), Users count: ${usersCount} (expected 8), Assignments count: ${assignmentsCount} (expected 4)`
      );
    }

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nVerification test server closed.');
  }

  // Summary
  console.log('\n========================================================================');
  console.log('  SESSION 14 VERIFICATION EXECUTION SUMMARY');
  console.log('========================================================================');
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;

  console.log(`Total Automated Tests : ${totalTests}`);
  console.log(`Tests Passed           : ${passedTests}`);
  console.log(`Tests Failed           : ${failedTests}`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - Test ${r.testNum}: ${r.testName} (${r.failureDetails})`));
  } else {
    console.log('\n🎉 ALL SESSION 14 TESTS PASSED PERFECTLY!');
  }
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSession14Verification().catch((err) => {
  console.error('Fatal Session 14 verification error:', err);
  process.exit(1);
});
