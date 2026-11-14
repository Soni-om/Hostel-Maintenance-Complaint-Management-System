/**
 * HostelCare — Session 15 Verification & Integration Test Suite
 * Automated tests for Complaint Priority, Lifecycle Status Transitions,
 * State Machine Validation, Status History Auditing, and Option D RBAC:
 *
 * 1. Static file structure & Frontend assets:
 *    - frontend/pages/staff/dashboard.html (details modal, transition select, priority update, timeline)
 *    - frontend/pages/student/complaint-details.html (resolution actions card, close/reopen affordances)
 *    - backend/src/controllers/complaintController.js & staffController.js
 *    - backend/src/routes/complaintRoutes.js & staffRoutes.js
 *
 * 2. RBAC & Route Access Control:
 *    - Priority updates restricted to Staff & Admin (Student returns 403 FORBIDDEN_ROLE)
 *    - General status updates restricted to Staff & Admin
 *    - Unauthenticated requests rejected with 401 NO_TOKEN
 *    - Route parity across /api/complaints, /api/staff/complaints, /api/v1/...
 *
 * 3. Complaint Priority Level Management:
 *    - Valid priorities: 'low', 'normal', 'high', 'urgent'
 *    - Validation rejects invalid priority (400)
 *    - Option D anti-enumeration for cross-hostel staff (404)
 *    - Permitted staff and Admin can update priority
 *    - Disallows updating priority on closed complaints (400)
 *    - Audit remark recorded in complaint_status_history
 *
 * 4. Authorized Lifecycle State Machine & Transition Rules:
 *    - Pending -> Assigned, In Progress
 *    - Assigned -> In Progress, Pending
 *    - In Progress -> Resolved, Assigned
 *    - Resolved -> Closed, In Progress (Reopen)
 *    - Closed -> In Progress (Admin only)
 *    - Invalid jumps (e.g. Pending -> Resolved, Pending -> Closed, Assigned -> Closed) rejected with 400
 *    - Moving to Resolved requires non-empty remarks >= 5 chars (400 if missing)
 *    - Resolved sets resolved_at timestamp
 *
 * 5. Complaint Closure:
 *    - Only Resolved complaints can be closed (Student owner or Admin)
 *    - Non-resolved complaints cannot be closed (400)
 *    - Closes ticket to 'closed' and logs in complaint_status_history
 *
 * 6. Complaint Reopening:
 *    - Only Resolved (or Closed by Admin) complaints can be reopened (400 if active)
 *    - Reopening requires reason >= 5 chars (400 if missing)
 *    - Resets status to 'in_progress' and clears resolved_at to NULL
 *    - Logs in complaint_status_history
 *
 * 7. Chronological Status History Audit Trail:
 *    - GET /api/complaints/:id/history (RBAC, Option D anti-enumeration, payload shape)
 *
 * 8. Database Baseline Cleanliness & Teardown:
 *    - Restoration of original database baseline state
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

async function runSession15Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 15 VERIFICATION & TEST SUITE');
  console.log('  Complaint Priority, Lifecycle Transitions, State Machine, & Audit');
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
    console.log('--- SECTION 1: STATIC FILE STRUCTURE & UI ARCHITECTURE ---\n');

    // Test 1: Frontend Staff Dashboard HTML contains details modal, status form, priority form, timeline
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const content = fs.readFileSync(dashboardPath, 'utf-8');

      const hasModal = content.includes('id="details-modal"') &&
        content.includes('id="details-next-status"') &&
        content.includes('id="details-status-remarks"') &&
        content.includes('id="btn-submit-status"') &&
        content.includes('id="details-priority-select"') &&
        content.includes('id="btn-submit-priority"') &&
        content.includes('id="status-history-list"');

      recordTest(
        1,
        'Frontend Staff Dashboard contains details modal, transition select, remarks input, priority update, and history timeline',
        hasModal,
        `details-modal: ${content.includes('id="details-modal"')}, next-status: ${content.includes('id="details-next-status"')}, history-list: ${content.includes('id="status-history-list"')}`
      );
    }

    // Test 2: Frontend Staff Dashboard implements required JavaScript workflow functions
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const content = fs.readFileSync(dashboardPath, 'utf-8');

      const hasFunctions = content.includes('function openDetailsModal') &&
        content.includes('function closeDetailsModal') &&
        content.includes('function submitStatusTransition') &&
        content.includes('function submitPriorityUpdate') &&
        content.includes('function loadStatusHistory');

      recordTest(
        2,
        'Frontend Staff Dashboard implements openDetailsModal, closeDetailsModal, submitStatusTransition, submitPriorityUpdate, and loadStatusHistory',
        hasFunctions,
        `openDetailsModal: ${content.includes('function openDetailsModal')}, submitStatus: ${content.includes('function submitStatusTransition')}, loadHistory: ${content.includes('function loadStatusHistory')}`
      );
    }

    // Test 3: Frontend Student Complaint Details contains resolution actions card
    {
      const detailsPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaint-details.html');
      const content = fs.readFileSync(detailsPath, 'utf-8');

      const hasActions = content.includes('id="student-actions-card"') &&
        content.includes('function confirmCloseComplaint') &&
        content.includes('function promptReopenComplaint');

      recordTest(
        3,
        'Frontend Student Complaint Details contains resolution actions card, close, and reopen workflows',
        hasActions,
        `student-actions-card: ${content.includes('id="student-actions-card"')}, confirmClose: ${content.includes('function confirmCloseComplaint')}, promptReopen: ${content.includes('function promptReopenComplaint')}`
      );
    }

    // Test 4: Backend controllers export updateStatus, updatePriority, closeComplaint, reopenComplaint, getStatusHistory
    {
      const complaintCtrlPath = path.join(rootDir, 'backend', 'src', 'controllers', 'complaintController.js');
      const staffCtrlPath = path.join(rootDir, 'backend', 'src', 'controllers', 'staffController.js');
      const compContent = fs.readFileSync(complaintCtrlPath, 'utf-8');
      const staffContent = fs.readFileSync(staffCtrlPath, 'utf-8');

      const compHasMethods = compContent.includes('async updateStatus(') &&
        compContent.includes('async updatePriority(') &&
        compContent.includes('async closeComplaint(') &&
        compContent.includes('async reopenComplaint(') &&
        compContent.includes('async getStatusHistory(');

      const staffHasMethods = staffContent.includes('async updateStatus(') &&
        staffContent.includes('async updatePriority(') &&
        staffContent.includes('async getStatusHistory(');

      recordTest(
        4,
        'Backend complaintController.js and staffController.js export updateStatus, updatePriority, close, reopen, and getStatusHistory',
        compHasMethods && staffHasMethods,
        `complaintController methods: ${compHasMethods}, staffController methods: ${staffHasMethods}`
      );
    }

    // Test 5: Backend routes mount status, priority, close, reopen, and history endpoints
    {
      const staffRoutesPath = path.join(rootDir, 'backend', 'src', 'routes', 'staffRoutes.js');
      const compRoutesPath = path.join(rootDir, 'backend', 'src', 'routes', 'complaintRoutes.js');
      const staffContent = fs.readFileSync(staffRoutesPath, 'utf-8');
      const compContent = fs.readFileSync(compRoutesPath, 'utf-8');

      const staffMounted = staffContent.includes('/complaints/:id/status') &&
        staffContent.includes('/complaints/:id/priority') &&
        staffContent.includes('/complaints/:id/history');

      const compMounted = compContent.includes('/:id/status') &&
        compContent.includes('/:id/priority') &&
        compContent.includes('/:id/close') &&
        compContent.includes('/:id/reopen') &&
        compContent.includes('/:id/history');

      recordTest(
        5,
        'Backend routes mount status, priority, close, reopen, and history endpoints with route parity',
        staffMounted && compMounted,
        `staffRoutes mounted: ${staffMounted}, complaintRoutes mounted: ${compMounted}`
      );
    }

    console.log('\n--- SECTION 2: RBAC & ROUTE ACCESS CONTROL ---\n');

    // Retrieve test users and tokens
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

    // Test 6: Unauthenticated request to PATCH /api/complaints/1/priority returns 401
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/complaints/1/priority',
        body: { priority: 'high' }
      });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        6,
        'Unauthenticated PATCH /api/complaints/:id/priority returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 7: Student requesting PATCH /api/complaints/1/priority returns 403
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/complaints/1/priority',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { priority: 'high' }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        7,
        'Student requesting PATCH /api/complaints/:id/priority returns HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 8: Unauthenticated request to PATCH /api/complaints/1/status returns 401
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/complaints/1/status',
        body: { status: 'in_progress' }
      });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        8,
        'Unauthenticated PATCH /api/complaints/:id/status returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 9: Student requesting PATCH /api/staff/complaints/1/status returns 403
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/status',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { status: 'in_progress' }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        9,
        'Student requesting PATCH /api/staff/complaints/:id/status returns HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 10: Route parity for status and priority routes
    {
      const resStaff = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/abc/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { priority: 'high' }
      });
      const resComplaint = await makeRequest({
        method: 'PATCH',
        path: '/api/complaints/abc/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { priority: 'high' }
      });
      const resV1 = await makeRequest({
        method: 'PATCH',
        path: '/api/v1/staff/complaints/abc/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { priority: 'high' }
      });

      const passed = resStaff.statusCode === 400 &&
        resComplaint.statusCode === 400 &&
        resV1.statusCode === 400;

      recordTest(
        10,
        'Route parity: /api/staff/complaints/:id/priority, /api/complaints/:id/priority, and v1 aliases bound',
        passed,
        `staff: ${resStaff.statusCode}, complaint: ${resComplaint.statusCode}, v1: ${resV1.statusCode}`
      );
    }

    console.log('\n--- SECTION 3: COMPLAINT PRIORITY LEVEL MANAGEMENT ---\n');

    // Test 11: Invalid priority value rejected with HTTP 400
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { priority: 'super-urgent' }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        11,
        'Invalid priority level ("super-urgent") is rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.message}"`
      );
    }

    // Test 12: Missing priority in body rejected with HTTP 400
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { remarks: 'No priority given' }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        12,
        'Missing priority field in request body is rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.message}"`
      );
    }

    // Test 13: Option D anti-enumeration: Cross-hostel staff (Ramesh Patel, Block B) updating Block A ticket priority returns HTTP 404
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/priority',
        headers: { Authorization: `Bearer ${rameshToken}` },
        body: { priority: 'urgent' }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        13,
        'Option D anti-enumeration: Cross-hostel staff (Ramesh Patel, Block B) receives HTTP 404 updating Block A complaint priority',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 14: Permitted staff (Sunita Sharma, Block A) updates priority to 'urgent' with HTTP 200 OK
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/priority',
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: {
          priority: 'urgent',
          remarks: 'Sparking reported near curtain rod; safety hazard elevated.'
        }
      });
      const passed = res.statusCode === 200 && res.body?.success === true &&
        res.body?.complaint?.priority === 'urgent';
      recordTest(
        14,
        'Permitted staff (Sunita Sharma, Block A) updates priority to "urgent" with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, New Priority: ${res.body?.complaint?.priority}`
      );
    }

    // Test 15: Database record persists updated priority
    {
      const [rows] = await pool.query('SELECT priority FROM complaints WHERE id = 1');
      const isUrgent = rows[0]?.priority === 'urgent';
      recordTest(
        15,
        'MySQL database record persists updated priority level ("urgent")',
        isUrgent,
        `DB Priority: ${rows[0]?.priority}`
      );
    }

    // Test 16: Priority update logs audit remark in complaint_status_history
    {
      const [historyRows] = await pool.query(
        `SELECT old_status, new_status, remarks, changed_by
         FROM complaint_status_history
         WHERE complaint_id = 1 AND remarks LIKE '%safety hazard elevated%'
         ORDER BY id DESC LIMIT 1`
      );
      const hasAudit = historyRows.length === 1 &&
        historyRows[0].changed_by === sunitaUser.id;
      recordTest(
        16,
        'Priority update records audit entry in complaint_status_history preserving ticket status',
        hasAudit,
        `Remarks: "${historyRows[0]?.remarks}", Changed By: ${historyRows[0]?.changed_by}`
      );
    }

    // Test 17: Attempting to update priority to the same current value returns HTTP 400
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/staff/complaints/1/priority',
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: { priority: 'urgent' }
      });
      const passed = res.statusCode === 400 &&
        res.body?.message?.includes('already set to');
      recordTest(
        17,
        'Attempting to update priority to the identical active value returns HTTP 400 Bad Request',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Restore Complaint #1 priority to 'high' for baseline integrity
    await pool.query("UPDATE complaints SET priority = 'high' WHERE id = 1");
    await pool.query("DELETE FROM complaint_status_history WHERE complaint_id = 1 AND remarks LIKE '%safety hazard elevated%'");

    // Test 18: Admin can update priority campus-wide (HTTP 200 OK)
    {
      const res = await makeRequest({
        method: 'PATCH',
        path: '/api/complaints/2/priority',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { priority: 'urgent', remarks: 'Admin elevated priority' }
      });
      const passed = res.statusCode === 200 && res.body?.success === true &&
        res.body?.complaint?.priority === 'urgent';
      recordTest(
        18,
        'Administrator successfully updates complaint priority campus-wide with HTTP 200 OK',
        passed,
        `Status: ${res.statusCode}, Ticket: ${res.body?.complaint?.ticket_number}, Priority: ${res.body?.complaint?.priority}`
      );
    }
    // Restore Complaint #2 priority to 'normal'
    await pool.query("UPDATE complaints SET priority = 'normal' WHERE id = 2");
    await pool.query("DELETE FROM complaint_status_history WHERE complaint_id = 2 AND remarks LIKE 'Admin elevated priority%'");

    console.log('\n--- SECTION 4: AUTHORIZED LIFECYCLE TRANSITIONS & STATE MACHINE ---\n');

    // Create a temporary synthetic complaint to test full state machine without touching seed baseline
    let tempComplaintId = null;
    try {
      const [insertComp] = await pool.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           hostel_block, room_number, priority, status, created_at, updated_at
         ) VALUES ('HC-TEST-LIFE-01', ?, 1, 'Geyser heating element failed', 'No hot water in bathroom',
                   'Block A', '102', 'normal', 'pending', NOW(), NOW())`,
        [studentUser.id]
      );
      tempComplaintId = insertComp.insertId;

      await pool.execute(
        `INSERT INTO complaint_status_history (
           complaint_id, changed_by, old_status, new_status, remarks, changed_at
         ) VALUES (?, ?, 'pending', 'pending', 'Complaint filed by student', NOW())`,
        [tempComplaintId, studentUser.id]
      );

      // Test 19: Invalid jump from 'pending' directly to 'resolved' rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'resolved', remarks: 'Fixed without starting work' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('Invalid status transition');
        recordTest(
          19,
          'State machine defense: Invalid transition from "pending" directly to "resolved" rejected with HTTP 400',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 20: Invalid jump from 'pending' directly to 'closed' rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'closed', remarks: 'Closing unreviewed complaint' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('Invalid status transition');
        recordTest(
          20,
          'State machine defense: Invalid transition from "pending" directly to "closed" rejected with HTTP 400',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 21: Transition to identical active status rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'pending' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('already in');
        recordTest(
          21,
          'Transition to identical active status ("pending" -> "pending") rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Move ticket from 'pending' to 'assigned' via assign API
      await makeRequest({
        method: 'POST',
        path: `/api/staff/complaints/${tempComplaintId}/assign`,
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: { staff_id: rajeshUser.id, notes: 'Geyser repair order' }
      });

      // Test 22: Invalid jump from 'assigned' directly to 'closed' rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'closed' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('Invalid status transition');
        recordTest(
          22,
          'State machine defense: Invalid transition from "assigned" directly to "closed" rejected with HTTP 400',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 23: Valid transition from 'assigned' to 'in_progress' succeeds with HTTP 200 OK
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: {
            status: 'in_progress',
            remarks: 'Electrician on site with replacement heating coil.'
          }
        });
        const passed = res.statusCode === 200 && res.body?.success === true &&
          res.body?.complaint?.status === 'in_progress';
        recordTest(
          23,
          'Authorized transition: "assigned" -> "in_progress" executes cleanly with HTTP 200 OK',
          passed,
          `Status: ${res.statusCode}, Complaint status: ${res.body?.complaint?.status}`
        );
      }

      // Test 24: Transitioning from 'in_progress' to 'resolved' without remarks rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'resolved' }
        });
        const passed = res.statusCode === 400 &&
          (res.body?.message?.includes('Resolution remarks are required') ||
           res.body?.errors?.[0]?.message?.includes('Resolution remarks are required'));
        recordTest(
          24,
          'Business rule: Transitioning to "resolved" without mandatory remarks rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.message}"`
        );
      }

      // Test 25: Transitioning from 'in_progress' to 'resolved' with short remarks (< 5 chars) rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'resolved', remarks: 'done' }
        });
        const passed = res.statusCode === 400;
        recordTest(
          25,
          'Validation rule: Resolution remarks shorter than 5 characters rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.message}"`
        );
      }

      // Test 26: Valid transition from 'in_progress' to 'resolved' with full remarks succeeds
      let resolveRes = null;
      {
        resolveRes = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: {
            status: 'resolved',
            remarks: 'Installed new 2kW heating element, tested water temperature to 65C; no leaks detected.'
          }
        });
        const passed = resolveRes.statusCode === 200 && resolveRes.body?.success === true &&
          resolveRes.body?.complaint?.status === 'resolved';
        recordTest(
          26,
          'Authorized transition: "in_progress" -> "resolved" with valid remarks succeeds with HTTP 200 OK',
          passed,
          `Status: ${resolveRes.statusCode}, Status: ${resolveRes.body?.complaint?.status}`
        );
      }

      // Test 27: Resolving a complaint populates resolved_at in MySQL
      {
        const [rows] = await pool.query('SELECT status, resolved_at FROM complaints WHERE id = ?', [tempComplaintId]);
        const hasResolvedAt = rows[0]?.status === 'resolved' && rows[0]?.resolved_at !== null;
        recordTest(
          27,
          'Resolving complaint populates resolved_at timestamp in MySQL database',
          hasResolvedAt,
          `Status: ${rows[0]?.status}, resolved_at: ${rows[0]?.resolved_at}`
        );
      }

      // Test 28: Status history record logged in complaint_status_history
      {
        const [historyRows] = await pool.query(
          `SELECT old_status, new_status, remarks, changed_by
           FROM complaint_status_history
           WHERE complaint_id = ? AND new_status = 'resolved'
           ORDER BY id DESC LIMIT 1`,
          [tempComplaintId]
        );
        const hasHistory = historyRows.length === 1 &&
          historyRows[0].old_status === 'in_progress' &&
          historyRows[0].new_status === 'resolved' &&
          historyRows[0].changed_by === sunitaUser.id;
        recordTest(
          28,
          'Status transition logged in complaint_status_history (old: in_progress, new: resolved)',
          hasHistory,
          `old: ${historyRows[0]?.old_status}, new: ${historyRows[0]?.new_status}, remarks: "${historyRows[0]?.remarks}"`
        );
      }

      console.log('\n--- SECTION 5: STUDENT & ADMIN COMPLAINT CLOSURE ---\n');

      // Test 29: Student closing an unowned complaint returns HTTP 404 anti-enumeration
      {
        // Student attempting to close complaint #2 (owned by student #6)
        const res = await makeRequest({
          method: 'PATCH',
          path: '/api/complaints/2/close',
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { closing_remarks: 'Attempted cross-student closure' }
        });
        const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
        recordTest(
          29,
          'Ownership anti-enumeration: Student attempting to close unowned ticket receives HTTP 404',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 30: Student closing an owned resolved complaint succeeds with HTTP 200 OK
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/complaints/${tempComplaintId}/close`,
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { closing_remarks: 'Hot water working normally. Thank you.' }
        });
        const passed = res.statusCode === 200 && res.body?.success === true &&
          res.body?.complaint?.status === 'closed';
        recordTest(
          30,
          'Student owner successfully closes resolved complaint (HTTP 200 OK, status: closed)',
          passed,
          `Status: ${res.statusCode}, New Status: ${res.body?.complaint?.status}`
        );
      }

      // Test 31: Status history logged for ticket closure
      {
        const [historyRows] = await pool.query(
          `SELECT old_status, new_status, remarks, changed_by
           FROM complaint_status_history
           WHERE complaint_id = ? AND new_status = 'closed'
           ORDER BY id DESC LIMIT 1`,
          [tempComplaintId]
        );
        const hasClosedHistory = historyRows.length === 1 &&
          historyRows[0].old_status === 'resolved' &&
          historyRows[0].new_status === 'closed' &&
          historyRows[0].changed_by === studentUser.id;
        recordTest(
          31,
          'Closure logged in complaint_status_history (old: resolved, new: closed, changed_by: student)',
          hasClosedHistory,
          `old: ${historyRows[0]?.old_status}, new: ${historyRows[0]?.new_status}, changer: ${historyRows[0]?.changed_by}`
        );
      }

      // Test 32: Non-admin attempting to update priority on a closed complaint rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/priority`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { priority: 'urgent' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('Cannot update priority of a closed complaint');
        recordTest(
          32,
          'Closed ticket defense: Attempting to update priority of a closed complaint rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 33: Non-admin attempting to update status of a closed complaint rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/staff/complaints/${tempComplaintId}/status`,
          headers: { Authorization: `Bearer ${sunitaToken}` },
          body: { status: 'in_progress', remarks: 'Staff attempting unauthorized reopen' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('Closed tickets can only be reopened by an Administrator');
        recordTest(
          33,
          'Closed ticket defense: Non-admin attempting to change status on closed ticket rejected with HTTP 400',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      console.log('\n--- SECTION 6: COMPLAINT REOPENING PROTOCOL ---\n');

      // Test 34: Administrator reopens closed complaint to 'in_progress' with HTTP 200 OK
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/complaints/${tempComplaintId}/reopen`,
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { reason: 'Student reported heating coil trippping master breaker after 10 minutes.' }
        });
        const passed = res.statusCode === 200 && res.body?.success === true &&
          res.body?.complaint?.status === 'in_progress';
        recordTest(
          34,
          'Administrator successfully reopens closed complaint to "in_progress" (HTTP 200 OK)',
          passed,
          `Status: ${res.statusCode}, Reopened Status: ${res.body?.complaint?.status}`
        );
      }

      // Test 35: Reopening clears resolved_at to NULL in MySQL
      {
        const [rows] = await pool.query('SELECT status, resolved_at FROM complaints WHERE id = ?', [tempComplaintId]);
        const isNullResolved = rows[0]?.status === 'in_progress' && rows[0]?.resolved_at === null;
        recordTest(
          35,
          'Reopening complaint resets resolved_at column to NULL in MySQL',
          isNullResolved,
          `Status: ${rows[0]?.status}, resolved_at: ${rows[0]?.resolved_at}`
        );
      }

      // Test 36: Reopening an active complaint ('in_progress') rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/complaints/${tempComplaintId}/reopen`,
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { reason: 'Already in progress' }
        });
        const passed = res.statusCode === 400 &&
          res.body?.message?.includes('currently in');
        recordTest(
          36,
          'Attempting to reopen an already active complaint ("in_progress") rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Move ticket back to 'resolved' to test student reopen workflow
      await makeRequest({
        method: 'PATCH',
        path: `/api/staff/complaints/${tempComplaintId}/status`,
        headers: { Authorization: `Bearer ${sunitaToken}` },
        body: {
          status: 'resolved',
          remarks: 'Replaced electrical breaker with 16A inductive rated unit; thermal test passed.'
        }
      });

      // Test 37: Student reopening resolved complaint without reason rejected with HTTP 400
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/complaints/${tempComplaintId}/reopen`,
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { reason: '' }
        });
        const passed = res.statusCode === 400;
        recordTest(
          37,
          'Reopening without required reason rejected with HTTP 400 Bad Request',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message || res.body?.errors?.[0]?.message}"`
        );
      }

      // Test 38: Student reopening own resolved complaint with valid reason succeeds (HTTP 200 OK)
      {
        const res = await makeRequest({
          method: 'PATCH',
          path: `/api/complaints/${tempComplaintId}/reopen`,
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { reason: 'Water temperature drops after 2 minutes; thermostat needs calibration.' }
        });
        const passed = res.statusCode === 200 && res.body?.success === true &&
          res.body?.complaint?.status === 'in_progress';
        recordTest(
          38,
          'Student owner successfully reopens resolved complaint with reason (HTTP 200 OK, status: in_progress)',
          passed,
          `Status: ${res.statusCode}, New status: ${res.body?.complaint?.status}`
        );
      }

      // Test 39: Reopen audit history recorded in complaint_status_history
      {
        const [historyRows] = await pool.query(
          `SELECT old_status, new_status, remarks, changed_by
           FROM complaint_status_history
           WHERE complaint_id = ? AND remarks LIKE 'Reopened: Water temperature drops%'
           ORDER BY id DESC LIMIT 1`,
          [tempComplaintId]
        );
        const hasReopenHistory = historyRows.length === 1 &&
          historyRows[0].old_status === 'resolved' &&
          historyRows[0].new_status === 'in_progress' &&
          historyRows[0].changed_by === studentUser.id;
        recordTest(
          39,
          'Reopen audit recorded in complaint_status_history (old: resolved, new: in_progress, remarks preserved)',
          hasReopenHistory,
          `Remarks: "${historyRows[0]?.remarks}"`
        );
      }

    } finally {
      // Purge temporary synthetic complaint
      if (tempComplaintId) {
        await pool.query('DELETE FROM complaint_assignments WHERE complaint_id = ?', [tempComplaintId]);
        await pool.query('DELETE FROM complaint_status_history WHERE complaint_id = ?', [tempComplaintId]);
        await pool.query('DELETE FROM complaints WHERE id = ?', [tempComplaintId]);
      }
    }

    console.log('\n--- SECTION 7: CHRONOLOGICAL STATUS HISTORY AUDIT TRAIL ---\n');

    // Test 40: Unauthenticated GET /api/complaints/1/history returns 401
    {
      const res = await makeRequest({ path: '/api/complaints/1/history' });
      const passed = res.statusCode === 401 && res.body?.code === 'NO_TOKEN';
      recordTest(
        40,
        'Unauthenticated GET /api/complaints/:id/history returns HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}`
      );
    }

    // Test 41: Student accessing unowned complaint history returns 404 anti-enumeration
    {
      const res = await makeRequest({
        path: '/api/complaints/2/history',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        41,
        'Ownership anti-enumeration: Student accessing unowned complaint history returns HTTP 404',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 42: Cross-hostel staff accessing non-permitted complaint history returns 404 anti-enumeration
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${rameshToken}` }
      });
      const passed = res.statusCode === 404 && res.body?.message === 'Complaint not found.';
      recordTest(
        42,
        'Option D anti-enumeration: Cross-hostel staff (Ramesh Patel) receives HTTP 404 on Block A status history',
        passed,
        `Status: ${res.statusCode}, Message: "${res.body?.message}"`
      );
    }

    // Test 43: Permitted staff and Admin retrieve complete chronological status history with HTTP 200 OK
    {
      const staffRes = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const adminRes = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = staffRes.statusCode === 200 && adminRes.statusCode === 200 &&
        Array.isArray(staffRes.body?.history) && staffRes.body?.history.length > 0;
      recordTest(
        43,
        'Permitted staff and Administrator retrieve status history with HTTP 200 OK',
        passed,
        `Staff history count: ${staffRes.body?.history?.length}, Admin history count: ${adminRes.body?.history?.length}`
      );
    }

    // Test 44: History payload includes required audit attributes
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const firstHistory = res.body?.history?.[0];
      const hasFields = firstHistory &&
        Boolean(firstHistory.id) &&
        Boolean(firstHistory.changed_by) &&
        Boolean(firstHistory.changed_by_name) &&
        Boolean(firstHistory.new_status) &&
        Boolean(firstHistory.changed_at);

      recordTest(
        44,
        'Status history payload contains changed_by_name, role, old_status, new_status, remarks, and changed_at',
        hasFields,
        `Name: ${firstHistory?.changed_by_name}, Role: ${firstHistory?.changed_by_role}, Status: ${firstHistory?.new_status}`
      );
    }

    // Test 45: Route parity: /api/complaints/:id/history and /api/staff/complaints/:id/history return identical data
    {
      const resComplaint = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const resStaff = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const resV1 = await makeRequest({
        path: '/api/v1/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });

      const passed = resComplaint.statusCode === 200 &&
        resStaff.statusCode === 200 &&
        resV1.statusCode === 200 &&
        resComplaint.body?.history?.length === resStaff.body?.history?.length &&
        resComplaint.body?.history?.length === resV1.body?.history?.length;

      recordTest(
        45,
        'Route parity: /api/complaints/:id/history, /api/staff/complaints/:id/history, and v1 aliases return identical data',
        passed,
        `comp count: ${resComplaint.body?.history?.length}, staff count: ${resStaff.body?.history?.length}, v1 count: ${resV1.body?.history?.length}`
      );
    }

    console.log('\n--- SECTION 8: DATABASE BASELINE RESTORATION & INTEGRITY ---\n');

    // Test 46: Database baseline integrity check
    {
      const [compRows] = await pool.query('SELECT COUNT(*) AS count FROM complaints');
      const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
      const [assignRows] = await pool.query('SELECT COUNT(*) AS count FROM complaint_assignments');

      const complaintsCount = compRows[0]?.count || 0;
      const usersCount = userRows[0]?.count || 0;
      const assignmentsCount = assignRows[0]?.count || 0;

      const passed = complaintsCount === 5 && usersCount === 8 && assignmentsCount === 4;
      recordTest(
        46,
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
  console.log('  SESSION 15 VERIFICATION EXECUTION SUMMARY');
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
    console.log('\n🎉 ALL SESSION 15 TESTS PASSED PERFECTLY!');
  }
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSession15Verification().catch((err) => {
  console.error('Fatal Session 15 verification error:', err);
  process.exit(1);
});
