/**
 * HostelCare — Session 13 Verification & Integration Test Suite
 * Automated tests for Staff Dashboard, Search, Filters, Pagination, and Option D Authorization:
 *
 * 1. Static file structure & Frontend assets:
 *    - frontend/pages/staff/dashboard.html (role guard, stats cards, filters, search, table, pagination)
 *    - backend/src/controllers/staffController.js
 *    - backend/src/routes/staffRoutes.js
 *
 * 2. RBAC & Route Access Control:
 *    - Unauthenticated request returns 401 NO_TOKEN
 *    - Student request returns 403 FORBIDDEN_ROLE
 *    - Staff request returns 200 OK
 *    - Admin request returns 200 OK
 *    - Route path parity (/api/staff/complaints and /api/v1/staff/complaints)
 *
 * 3. Option D Staff Visibility Policy:
 *    - Sunita Sharma (Supervisor, Block A): sees Block A complaints (1, 3, 5 = 3 tickets)
 *    - Rajesh Kumar (Electrician, Block A): sees Block A + assigned (1, 3, 4, 5 = 4 tickets)
 *    - Ramesh Patel (Plumber, Block B): sees Block B (2 = 1 ticket)
 *    - Admin: sees all campus complaints (1, 2, 3, 4, 5 = 5 tickets)
 *
 * 4. Filter by assigned_to_me:
 *    - Rajesh with assigned_to_me=true: returns tickets 1, 4, 5 (3 tickets), excludes unassigned ticket 3
 *    - Sunita with assigned_to_me=true: returns 0 tickets
 *
 * 5. Keyword Search:
 *    - By ticket_number, title, description, resident name, room_number
 *    - SQL injection resistance
 *
 * 6. Multi-Field Filters:
 *    - Status filter (pending, in_progress, etc.)
 *    - Category filter (category_id)
 *    - Priority filter (low, normal, high, urgent)
 *    - Date range filter (start_date, end_date, full day boundary)
 *
 * 7. Input Validation & Error Handling:
 *    - Invalid status, priority, category_id -> 400 Bad Request
 *    - Inverted or malformed date range -> 400 Bad Request
 *    - Page < 1 or limit > 50 -> 400 Bad Request
 *    - Invalid sort_by or sort_order -> 400 Bad Request
 *
 * 8. Sorting & Pagination:
 *    - Pagination boundaries (limit, page, totalPages, total)
 *    - Sorting by created_at, priority, status
 *
 * 9. Real Database Statistics:
 *    - Real database counts for totalPermitted, assignedToMe, pendingReview, inProgress, resolved
 *
 * 10. Option D Attachment Streaming:
 *    - Permitted staff can stream attachments
 *    - Non-permitted cross-block staff receive 404 (anti-enumeration)
 *    - Admin can stream all attachments
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

async function runSession13Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 13 VERIFICATION & TEST SUITE');
  console.log('  Staff Dashboard, Search, Filters, Pagination, & Option D RBAC');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function makeRequest({ method = 'GET', path: reqPath, headers = {} }) {
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

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf-8'));
          } catch {
            // Non-JSON response (e.g. image stream)
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            rawBuffer: raw
          });
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  try {
    // Prepare test user tokens
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');
    const sunitaStaff = await UserModel.findByEmail('sunita.supervisor@hostelcare.edu'); // Block A, 0 assignments
    const rajeshStaff = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu'); // Block A, assignments 1, 4, 5
    const rameshStaff = await UserModel.findByEmail('ramesh.plumber@hostelcare.edu');    // Block B, assignment 2
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');        // Student

    const adminToken = generateToken(adminUser);
    const sunitaToken = generateToken(sunitaStaff);
    const rajeshToken = generateToken(rajeshStaff);
    const rameshToken = generateToken(rameshStaff);
    const studentToken = generateToken(studentUser);

    console.log('--- SECTION 1: STATIC ASSETS & FRONTEND ARCHITECTURE ---\n');

    // Test 1: Staff dashboard HTML file exists and includes role guard & design components
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const exists = fs.existsSync(dashboardPath);
      let content = '';
      if (exists) content = fs.readFileSync(dashboardPath, 'utf8');

      const hasRoleGuard = content.includes("window.Auth.requireAuth(['staff'])") || content.includes("window.Auth.requireAuth(['staff', 'admin'])");
      const hasKpiCards = content.includes('stat-assigned') && content.includes('stat-pending') &&
                          content.includes('stat-inprogress') && content.includes('stat-resolved');
      const hasFilters = content.includes('filter-keyword') && content.includes('filter-status') &&
                         content.includes('filter-category') && content.includes('filter-priority') &&
                         content.includes('filter-start-date') && content.includes('filter-end-date') &&
                         content.includes('filter-assigned-to-me');
      const hasTable = content.includes('complaints-tbody') && content.includes('table-container');
      const hasPagination = content.includes('pagination-bar') && content.includes('btn-prev') && content.includes('btn-next');

      const passed = exists && hasRoleGuard && hasKpiCards && hasFilters && hasTable && hasPagination;
      recordTest(
        1,
        'Staff Dashboard HTML contains required components, role guards, filters, and pagination controls',
        passed,
        `File exists: ${exists}, Role guard: ${hasRoleGuard}, KPI cards: ${hasKpiCards}, Filters: ${hasFilters}, Table: ${hasTable}, Pagination: ${hasPagination}`
      );
    }

    // Test 2: Staff controller and routes exist and are properly wired
    {
      const controllerPath = path.join(rootDir, 'backend', 'src', 'controllers', 'staffController.js');
      const routesPath = path.join(rootDir, 'backend', 'src', 'routes', 'staffRoutes.js');
      const controllerExists = fs.existsSync(controllerPath);
      const routesExists = fs.existsSync(routesPath);

      let routesContent = '';
      if (routesExists) routesContent = fs.readFileSync(routesPath, 'utf8');
      const hasComplaintsRoute = routesContent.includes("router.get(\n  '/complaints'") || routesContent.includes("router.get('/complaints'");
      const hasStaffRole = routesContent.includes("requireRole('staff', 'admin')");

      const passed = controllerExists && routesExists && hasComplaintsRoute && hasStaffRole;
      recordTest(
        2,
        'Staff Controller and Staff Routes are wired with RBAC requireRole(staff, admin)',
        passed,
        `Controller exists: ${controllerExists}, Routes file exists: ${routesExists}, /complaints mounted: ${hasComplaintsRoute}, Staff/Admin role enforced: ${hasStaffRole}`
      );
    }

    console.log('\n--- SECTION 2: RBAC & ROUTE ACCESS CONTROL ---\n');

    // Test 3: Unauthenticated request to /api/staff/complaints rejected with 401
    {
      const res = await makeRequest({ path: '/api/staff/complaints' });
      const passed = res.statusCode === 401 && res.body?.success === false;
      recordTest(
        3,
        'Unauthenticated GET /api/staff/complaints rejected with HTTP 401',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code || 'None'}, Message: ${res.body?.message}`
      );
    }

    // Test 4: Student request to /api/staff/complaints rejected with 403 FORBIDDEN_ROLE
    {
      const res = await makeRequest({
        path: '/api/staff/complaints',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.statusCode === 403 && res.body?.code === 'FORBIDDEN_ROLE';
      recordTest(
        4,
        'Student role request to GET /api/staff/complaints strictly forbidden with HTTP 403',
        passed,
        `Status: ${res.statusCode}, Code: ${res.body?.code}, Message: ${res.body?.message}`
      );
    }

    // Test 5: Staff and Admin requests allowed with HTTP 200
    {
      const staffRes = await makeRequest({
        path: '/api/staff/complaints',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const adminRes = await makeRequest({
        path: '/api/staff/complaints',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = staffRes.statusCode === 200 && staffRes.body?.success === true &&
                     adminRes.statusCode === 200 && adminRes.body?.success === true;
      recordTest(
        5,
        'Staff and Admin roles authorized with HTTP 200 OK',
        passed,
        `Staff status: ${staffRes.statusCode}, Admin status: ${adminRes.statusCode}`
      );
    }

    // Test 6: API route parity: /api/staff/complaints and /api/v1/staff/complaints return identical data
    {
      const resLegacy = await makeRequest({
        path: '/api/staff/complaints',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const resV1 = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = resLegacy.statusCode === 200 && resV1.statusCode === 200 &&
                     resLegacy.body?.pagination?.total === resV1.body?.pagination?.total &&
                     resLegacy.body?.complaints?.length === resV1.body?.complaints?.length;
      recordTest(
        6,
        'Route parity: /api/staff/complaints and /api/v1/staff/complaints return identical data',
        passed,
        `Legacy total: ${resLegacy.body?.pagination?.total}, v1 total: ${resV1.body?.pagination?.total}`
      );
    }

    console.log('\n--- SECTION 3: OPTION D HYBRID DOMAIN & ASSIGNMENT VISIBILITY POLICY ---\n');

    // Test 7: Sunita Sharma (Supervisor, Block A, 0 assignments) sees exactly 3 Block A tickets
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const allBlockA = complaints.every((c) => c.hostel_block === 'Block A');
      const ids = complaints.map((c) => c.id).sort((a, b) => a - b);
      const expectedIds = [1, 3, 5];
      const matches = JSON.stringify(ids) === JSON.stringify(expectedIds);

      const passed = res.statusCode === 200 && total === 3 && allBlockA && matches;
      recordTest(
        7,
        'Option D: Sunita Sharma (Block A) sees only Block A complaints (Tickets #1, #3, #5)',
        passed,
        `Total: ${total}, Ticket IDs: [${ids.join(', ')}], All in Block A: ${allBlockA}`
      );
    }

    // Test 8: Rajesh Kumar (Electrician, Block A, assigned to #1, #4 [Block C], #5) sees 4 tickets
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const ids = complaints.map((c) => c.id).sort((a, b) => a - b);
      const expectedIds = [1, 3, 4, 5];
      const matches = JSON.stringify(ids) === JSON.stringify(expectedIds);

      // Verify that Ticket 4 (in Block C) is visible because Rajesh is actively assigned to it
      const ticket4 = complaints.find((c) => c.id === 4);
      const ticket4Visible = Boolean(ticket4 && ticket4.hostel_block === 'Block C');

      // Verify Ticket 2 (Block B) is NOT visible
      const ticket2Visible = complaints.some((c) => c.id === 2);

      const passed = res.statusCode === 200 && total === 4 && matches && ticket4Visible && !ticket2Visible;
      recordTest(
        8,
        'Option D: Rajesh Kumar sees Block A tickets + cross-block assigned Ticket #4 (Block C)',
        passed,
        `Total: ${total}, Ticket IDs: [${ids.join(', ')}], Ticket #4 (Block C) visible: ${ticket4Visible}, Ticket #2 (Block B) absent: ${!ticket2Visible}`
      );
    }

    // Test 9: Ramesh Patel (Plumber, Block B, assigned to #2) sees only 1 ticket (Ticket #2)
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${rameshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const ids = complaints.map((c) => c.id);

      const passed = res.statusCode === 200 && total === 1 && ids.length === 1 && ids[0] === 2;
      recordTest(
        9,
        'Option D: Ramesh Patel (Block B) sees only Block B complaint (Ticket #2)',
        passed,
        `Total: ${total}, Ticket IDs: [${ids.join(', ')}]`
      );
    }

    // Test 10: Admin sees all 5 complaints across all hostel blocks
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const ids = complaints.map((c) => c.id).sort((a, b) => a - b);

      const passed = res.statusCode === 200 && total === 5 && ids.length === 5;
      recordTest(
        10,
        'Option D: Administrator sees all 5 complaints campus-wide',
        passed,
        `Total: ${total}, Ticket IDs: [${ids.join(', ')}]`
      );
    }

    console.log('\n--- SECTION 4: FILTER BY assigned_to_me ---\n');

    // Test 11: Rajesh with assigned_to_me=true returns only 3 tickets (Tickets 1, 4, 5; excludes unassigned #3)
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?assigned_to_me=true',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const ids = complaints.map((c) => c.id).sort((a, b) => a - b);
      const expectedIds = [1, 4, 5];
      const matches = JSON.stringify(ids) === JSON.stringify(expectedIds);

      const passed = res.statusCode === 200 && total === 3 && matches;
      recordTest(
        11,
        'Filter assigned_to_me=true for Rajesh Kumar returns only active assignments (#1, #4, #5)',
        passed,
        `Total: ${total}, Ticket IDs: [${ids.join(', ')}], Excludes unassigned Ticket #3: ${!ids.includes(3)}`
      );
    }

    // Test 12: Sunita with assigned_to_me=true returns 0 tickets
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?assigned_to_me=true',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 0 && complaints.length === 0;
      recordTest(
        12,
        'Filter assigned_to_me=true for Sunita Sharma returns 0 tickets (no active assignments)',
        passed,
        `Total: ${total}, Complaints length: ${complaints.length}`
      );
    }

    console.log('\n--- SECTION 5: KEYWORD SEARCH ---\n');

    // Test 13: Search by exact ticket number (HC-20261101-0001)
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?keyword=HC-20261101-0001',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 1 && complaints[0]?.ticket_number === 'HC-20261101-0001';
      recordTest(
        13,
        'Keyword search by exact ticket_number returns expected complaint',
        passed,
        `Total: ${total}, Found ticket: ${complaints[0]?.ticket_number}`
      );
    }

    // Test 14: Search by title / description keyword ('regulator')
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?keyword=regulator',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 1 && complaints[0]?.id === 1;
      recordTest(
        14,
        'Keyword search by title/description matches relevant complaint',
        passed,
        `Total: ${total}, Complaint Title: "${complaints[0]?.title}"`
      );
    }

    // Test 15: Search by resident student name ('Rahul')
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?keyword=Rahul',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const allRahul = complaints.every((c) => c.student_name.includes('Rahul'));

      const passed = res.statusCode === 200 && total === 2 && allRahul;
      recordTest(
        15,
        'Keyword search by student resident name matches student tickets',
        passed,
        `Total: ${total}, Residents: [${complaints.map((c) => c.student_name).join(', ')}]`
      );
    }

    // Test 16: Search by room number ('A-102')
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?keyword=A-102',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const allRoom = complaints.every((c) => c.room_number === 'A-102');

      const passed = res.statusCode === 200 && total === 2 && allRoom;
      recordTest(
        16,
        'Keyword search by room_number matches room complaints',
        passed,
        `Total: ${total}, Rooms: [${complaints.map((c) => c.room_number).join(', ')}]`
      );
    }

    // Test 17: SQL Injection resilience in keyword parameter
    {
      const sqliPayload = encodeURIComponent("' OR '1'='1");
      const res = await makeRequest({
        path: `/api/v1/staff/complaints?keyword=${sqliPayload}`,
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });

      // Parameterized queries treat the payload as a literal string -> should return 0 results without SQL error
      const passed = res.statusCode === 200 && res.body?.success === true && res.body?.pagination?.total === 0;
      recordTest(
        17,
        'Keyword parameter safely defuses SQL injection payload with zero leakage',
        passed,
        `Status: ${res.statusCode}, Total returned: ${res.body?.pagination?.total}`
      );
    }

    console.log('\n--- SECTION 6: MULTI-FIELD FILTERS ---\n');

    // Test 18: Filter by status ('pending')
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?status=pending',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 1 && complaints[0]?.id === 3 && complaints[0]?.status === 'pending';
      recordTest(
        18,
        'Filter by status=pending returns only pending tickets in scope',
        passed,
        `Total: ${total}, Ticket ID: ${complaints[0]?.id}, Status: ${complaints[0]?.status}`
      );
    }

    // Test 19: Filter by category_id (1 = Electrical)
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?category_id=1',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const allCat1 = complaints.every((c) => c.category_id === 1);

      const passed = res.statusCode === 200 && total === 2 && allCat1;
      recordTest(
        19,
        'Filter by category_id=1 returns only Electrical complaints',
        passed,
        `Total: ${total}, Categories: [${complaints.map((c) => c.category_name).join(', ')}]`
      );
    }

    // Test 20: Filter by priority ('urgent')
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?priority=urgent',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 1 && complaints[0]?.id === 3 && complaints[0]?.priority === 'urgent';
      recordTest(
        20,
        'Filter by priority=urgent returns only urgent tickets',
        passed,
        `Total: ${total}, Ticket #${complaints[0]?.id}, Priority: ${complaints[0]?.priority}`
      );
    }

    // Test 21: Date range filter (start_date=2026-11-01 & end_date=2026-11-02)
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?start_date=2026-11-01&end_date=2026-11-02',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;
      const ids = complaints.map((c) => c.id).sort((a, b) => a - b);

      const passed = res.statusCode === 200 && total === 2 && JSON.stringify(ids) === JSON.stringify([1, 2]);
      recordTest(
        21,
        'Date range filter includes complaints created within start_date and end_date boundary',
        passed,
        `Total: ${total}, IDs: [${ids.join(', ')}]`
      );
    }

    // Test 22: Full day inclusion on end_date (23:59:59.999 boundary)
    {
      // Complaint 1 was created on 2026-11-01 at 10:15:00
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?start_date=2026-11-01&end_date=2026-11-01',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const complaints = res.body?.complaints || [];
      const total = res.body?.pagination?.total;

      const passed = res.statusCode === 200 && total === 1 && complaints[0]?.id === 1;
      recordTest(
        22,
        'End date filter encompasses entire calendar day up to 23:59:59.999',
        passed,
        `Total: ${total}, Complaint #1 created at ${complaints[0]?.created_at} is included`
      );
    }

    console.log('\n--- SECTION 7: INPUT VALIDATION & SECURITY DEFENSES ---\n');

    // Test 23: Validation rejects invalid status filter with 400 Bad Request
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?status=invalid_status',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        23,
        'Invalid status query parameter rejected with HTTP 400',
        passed,
        `Status: ${res.statusCode}, Message: ${res.body?.message}`
      );
    }

    // Test 24: Validation rejects invalid priority filter with 400 Bad Request
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?priority=catastrophic',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        24,
        'Invalid priority query parameter rejected with HTTP 400',
        passed,
        `Status: ${res.statusCode}, Message: ${res.body?.message}`
      );
    }

    // Test 25: Validation rejects inverted date range (start_date > end_date) with 400 Bad Request
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?start_date=2026-11-05&end_date=2026-11-01',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = res.statusCode === 400 && res.body?.message.includes('Start date cannot be after end date');
      recordTest(
        25,
        'Inverted date range (start_date > end_date) rejected with HTTP 400',
        passed,
        `Status: ${res.statusCode}, Message: ${res.body?.message}`
      );
    }

    // Test 26: Validation rejects malformed date strings with 400 Bad Request
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?start_date=2026-13-99',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = res.statusCode === 400 && res.body?.success === false;
      recordTest(
        26,
        'Malformed date string rejected with HTTP 400',
        passed,
        `Status: ${res.statusCode}, Message: ${res.body?.message}`
      );
    }

    // Test 27: Validation enforces pagination limit boundaries (max 50, min 1)
    {
      const resExceed = await makeRequest({
        path: '/api/v1/staff/complaints?limit=100',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const resZero = await makeRequest({
        path: '/api/v1/staff/complaints?limit=0',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = resExceed.statusCode === 400 && resZero.statusCode === 400;
      recordTest(
        27,
        'Pagination limit boundary (1 <= limit <= 50) strictly enforced with HTTP 400',
        passed,
        `limit=100 status: ${resExceed.statusCode}, limit=0 status: ${resZero.statusCode}`
      );
    }

    // Test 28: Validation enforces sort column allowlist and rejects unapproved columns
    {
      const resInvalidSort = await makeRequest({
        path: '/api/v1/staff/complaints?sort_by=password_hash',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const resInvalidOrder = await makeRequest({
        path: '/api/v1/staff/complaints?sort_order=backwards',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const passed = resInvalidSort.statusCode === 400 && resInvalidOrder.statusCode === 400;
      recordTest(
        28,
        'Sort column and sort order allowlists enforced with HTTP 400 on unapproved fields',
        passed,
        `sort_by=password_hash status: ${resInvalidSort.statusCode}, sort_order=backwards status: ${resInvalidOrder.statusCode}`
      );
    }

    console.log('\n--- SECTION 8: SORTING & PAGINATION ---\n');

    // Test 29: Pagination execution: limit=2 returns exactly 2 records with proper pagination metadata
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints?limit=2&page=1',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const complaints = res.body?.complaints || [];
      const pagination = res.body?.pagination;

      const passed = res.statusCode === 200 && complaints.length === 2 &&
                     pagination?.page === 1 && pagination?.limit === 2 &&
                     pagination?.total === 5 && pagination?.totalPages === 3;
      recordTest(
        29,
        'Pagination limit=2, page=1 returns 2 records with accurate totalPages=3 and total=5',
        passed,
        `Length: ${complaints.length}, Page: ${pagination?.page}, Limit: ${pagination?.limit}, Total: ${pagination?.total}, TotalPages: ${pagination?.totalPages}`
      );
    }

    // Test 30: Sorting by priority ascending and descending
    {
      const resDesc = await makeRequest({
        path: '/api/v1/staff/complaints?sort_by=priority&sort_order=desc',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const resAsc = await makeRequest({
        path: '/api/v1/staff/complaints?sort_by=priority&sort_order=asc',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const descFirst = resDesc.body?.complaints[0]?.priority;
      const ascFirst = resAsc.body?.complaints[0]?.priority;

      const passed = resDesc.statusCode === 200 && resAsc.statusCode === 200 &&
                     Boolean(descFirst) && Boolean(ascFirst);
      recordTest(
        30,
        'Sorting by approved allowlist column priority asc/desc executes cleanly',
        passed,
        `Desc first priority: ${descFirst}, Asc first priority: ${ascFirst}`
      );
    }

    console.log('\n--- SECTION 9: REAL DATABASE METRICS & STATISTICS ---\n');

    // Test 31: Rajesh Kumar real DB statistics
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${rajeshToken}` }
      });
      const stats = res.body?.stats;
      // Rajesh: totalPermitted: 4, assignedToMe: 3, pendingReview: 1, inProgress: 1, resolved: 1
      const passed = res.statusCode === 200 &&
                     stats?.totalPermitted === 4 &&
                     stats?.assignedToMe === 3 &&
                     stats?.pendingReview === 1 &&
                     stats?.inProgress === 1 &&
                     stats?.resolved === 1;
      recordTest(
        31,
        'Real DB statistics for Rajesh Kumar match Option D scope exactly',
        passed,
        `totalPermitted: ${stats?.totalPermitted} (expected 4), assignedToMe: ${stats?.assignedToMe} (expected 3), pending: ${stats?.pendingReview} (expected 1), inProgress: ${stats?.inProgress} (expected 1), resolved: ${stats?.resolved} (expected 1)`
      );
    }

    // Test 32: Sunita Sharma real DB statistics
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${sunitaToken}` }
      });
      const stats = res.body?.stats;
      // Sunita: totalPermitted: 3, assignedToMe: 0, pendingReview: 1, inProgress: 1, resolved: 0
      const passed = res.statusCode === 200 &&
                     stats?.totalPermitted === 3 &&
                     stats?.assignedToMe === 0 &&
                     stats?.pendingReview === 1 &&
                     stats?.inProgress === 1 &&
                     stats?.resolved === 0;
      recordTest(
        32,
        'Real DB statistics for Sunita Sharma reflect Block A unassigned scope',
        passed,
        `totalPermitted: ${stats?.totalPermitted} (expected 3), assignedToMe: ${stats?.assignedToMe} (expected 0), pending: ${stats?.pendingReview} (expected 1), inProgress: ${stats?.inProgress} (expected 1), resolved: ${stats?.resolved} (expected 0)`
      );
    }

    // Test 33: Ramesh Patel real DB statistics
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${rameshToken}` }
      });
      const stats = res.body?.stats;
      // Ramesh: totalPermitted: 1, assignedToMe: 1, pendingReview: 0, inProgress: 0, resolved: 0
      const passed = res.statusCode === 200 &&
                     stats?.totalPermitted === 1 &&
                     stats?.assignedToMe === 1 &&
                     stats?.pendingReview === 0 &&
                     stats?.inProgress === 0 &&
                     stats?.resolved === 0;
      recordTest(
        33,
        'Real DB statistics for Ramesh Patel reflect Block B scope',
        passed,
        `totalPermitted: ${stats?.totalPermitted} (expected 1), assignedToMe: ${stats?.assignedToMe} (expected 1), pending: ${stats?.pendingReview} (expected 0), inProgress: ${stats?.inProgress} (expected 0), resolved: ${stats?.resolved} (expected 0)`
      );
    }

    // Test 34: Admin real DB statistics reflect global campus-wide scope
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const stats = res.body?.stats;
      // Admin: totalPermitted: 5, assignedToMe: 0, pendingReview: 1, inProgress: 1, resolved: 1
      const passed = res.statusCode === 200 &&
                     stats?.totalPermitted === 5 &&
                     stats?.pendingReview === 1 &&
                     stats?.inProgress === 1 &&
                     stats?.resolved === 1;
      recordTest(
        34,
        'Real DB statistics for Administrator reflect global campus-wide scope',
        passed,
        `totalPermitted: ${stats?.totalPermitted} (expected 5), pending: ${stats?.pendingReview} (expected 1), inProgress: ${stats?.inProgress} (expected 1), resolved: ${stats?.resolved} (expected 1)`
      );
    }

    console.log('\n--- SECTION 10: OPTION D ATTACHMENT STREAMING & ANTI-ENUMERATION ---\n');

    // Create a temporary complaint in Block A with a real JPEG photo attachment
    let tempComplaintId = null;
    let tempAttachmentId = null;

    try {
      const { default: sharp } = await import('sharp');
      const testJpeg = await sharp({
        create: { width: 60, height: 60, channels: 3, background: { r: 34, g: 197, b: 94 } }
      }).jpeg().toBuffer();

      const created = await ComplaintModel.createComplaint({
        studentId: studentUser.id, // Rahul Sharma (Block A)
        categoryId: 1,
        title: 'Option D Attachment Verification Ticket',
        description: 'Test ticket created strictly for Option D attachment authorization verification.',
        hostelBlock: 'Block A',
        roomNumber: 'A-102',
        photoFile: {
          buffer: testJpeg,
          originalname: 'option_d_test.jpg'
        }
      });

      tempComplaintId = created.id;
      tempAttachmentId = created.attachment.id;

      // Test 35: Permitted staff in same block (Rajesh Kumar, Block A) streams photo with HTTP 200
      {
        const res = await makeRequest({
          path: `/api/v1/complaints/${tempComplaintId}/attachments/${tempAttachmentId}`,
          headers: { Authorization: `Bearer ${rajeshToken}` }
        });
        const isImage = res.headers['content-type']?.startsWith('image/');
        const passed = res.statusCode === 200 && isImage && res.rawBuffer.length > 0;
        recordTest(
          35,
          'Option D: Rajesh Kumar (Block A staff) successfully streams Attachment from Block A complaint',
          passed,
          `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}, Streamed bytes: ${res.rawBuffer.length}`
        );
      }

      // Test 36: Permitted supervisor in same block (Sunita Sharma, Block A) streams photo with HTTP 200
      {
        const res = await makeRequest({
          path: `/api/v1/complaints/${tempComplaintId}/attachments/${tempAttachmentId}`,
          headers: { Authorization: `Bearer ${sunitaToken}` }
        });
        const isImage = res.headers['content-type']?.startsWith('image/');
        const passed = res.statusCode === 200 && isImage && res.rawBuffer.length > 0;
        recordTest(
          36,
          'Option D: Sunita Sharma (Block A supervisor) successfully streams Attachment from Block A complaint',
          passed,
          `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}, Streamed bytes: ${res.rawBuffer.length}`
        );
      }

      // Test 37: Cross-hostel staff (Ramesh Patel, Block B, unassigned) denied with HTTP 404 anti-enumeration
      {
        const res = await makeRequest({
          path: `/api/v1/complaints/${tempComplaintId}/attachments/${tempAttachmentId}`,
          headers: { Authorization: `Bearer ${rameshToken}` }
        });
        const passed = res.statusCode === 404 && res.body?.message === 'Attachment not found.';
        recordTest(
          37,
          'Option D anti-enumeration: Ramesh Patel receives HTTP 404 for Attachment on Block A complaint',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 38: Unassigned cross-hostel staff receives HTTP 404 for seed Attachment #1 (Block A)
      {
        const res = await makeRequest({
          path: '/api/v1/complaints/1/attachments/1',
          headers: { Authorization: `Bearer ${rameshToken}` }
        });
        const passed = res.statusCode === 404 && res.body?.message === 'Attachment not found.';
        recordTest(
          38,
          'Option D anti-enumeration: Ramesh Patel receives HTTP 404 for seed Attachment #1 (cross-hostel Block A)',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 39: Unassigned cross-hostel staff receives HTTP 404 for seed Attachment #2 (Block B)
      {
        const res = await makeRequest({
          path: '/api/v1/complaints/2/attachments/2',
          headers: { Authorization: `Bearer ${sunitaToken}` }
        });
        const passed = res.statusCode === 404 && res.body?.message === 'Attachment not found.';
        recordTest(
          39,
          'Option D anti-enumeration: Sunita Sharma receives HTTP 404 for seed Attachment #2 (cross-hostel Block B)',
          passed,
          `Status: ${res.statusCode}, Message: "${res.body?.message}"`
        );
      }

      // Test 40: Administrator successfully streams Attachment campus-wide (HTTP 200)
      {
        const res = await makeRequest({
          path: `/api/v1/complaints/${tempComplaintId}/attachments/${tempAttachmentId}`,
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        const isImage = res.headers['content-type']?.startsWith('image/');
        const passed = res.statusCode === 200 && isImage && res.rawBuffer.length > 0;
        recordTest(
          40,
          'Administrator successfully streams Attachment with HTTP 200 OK',
          passed,
          `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}, Bytes: ${res.rawBuffer.length}`
        );
      }
    } finally {
      // Purge temporary test complaint and file
      if (tempComplaintId) {
        const [attRows] = await pool.query(
          'SELECT storage_key FROM complaint_attachments WHERE complaint_id = ?',
          [tempComplaintId]
        );
        for (const row of attRows) {
          const p = path.join(rootDir, 'backend', 'uploads', row.storage_key);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        await pool.query('DELETE FROM complaint_attachments WHERE complaint_id = ?', [tempComplaintId]);
        await pool.query('DELETE FROM complaint_status_history WHERE complaint_id = ?', [tempComplaintId]);
        await pool.query('DELETE FROM complaints WHERE id = ?', [tempComplaintId]);
      }
    }

    console.log('\n--- SECTION 11: DATABASE BASELINE INTEGRITY ---\n');

    // Test 41: Database baseline verification
    {
      const [compRows] = await pool.query('SELECT COUNT(*) AS count FROM complaints');
      const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
      const [assignRows] = await pool.query('SELECT COUNT(*) AS count FROM complaint_assignments');

      const complaintsCount = compRows[0]?.count || 0;
      const usersCount = userRows[0]?.count || 0;
      const assignmentsCount = assignRows[0]?.count || 0;

      const passed = complaintsCount === 5 && usersCount === 8 && assignmentsCount === 4;
      recordTest(
        41,
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
  console.log('  SESSION 13 VERIFICATION EXECUTION SUMMARY');
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
    console.log('\n🎉 ALL SESSION 13 TESTS PASSED PERFECTLY!');
  }
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSession13Verification().catch((err) => {
  console.error('Fatal Session 13 verification error:', err);
  process.exit(1);
});
