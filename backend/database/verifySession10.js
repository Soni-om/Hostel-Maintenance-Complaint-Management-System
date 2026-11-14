/**
 * HostelCare — Session 10 Live Verification Suite
 * Automated tests for:
 * 1. Student Complaint Listing API (GET /api/complaints/mine & /api/v1/complaints/mine & /api/complaints)
 *    - Strict student ownership enforcement (WHERE c.student_id = req.user.id)
 *    - Newest-first ordering (created_at DESC, id DESC)
 *    - Offset pagination (page, limit, total, totalPages, max limit 50)
 *    - Status & Category filtering
 *    - Category JOIN (category_name)
 * 2. Student Single Complaint Details API (GET /api/complaints/:id & /api/v1/complaints/:id)
 *    - Complete complaint fields + latest remarks from complaint_status_history
 *    - Strict student ownership enforcement (WHERE c.id = ? AND c.student_id = ?)
 *    - Anti-Enumeration Protection (Uniform 404 for non-existent and inaccessible IDs)
 * 3. Role-Based Access Control
 *    - Unauthenticated rejected (401 NO_TOKEN)
 *    - Staff rejected (403 FORBIDDEN_ROLE)
 *    - Admin rejected (403 FORBIDDEN_ROLE)
 * 4. Input & Parameter Validation
 *    - Invalid page/limit/status/category_id rejected (400 Bad Request)
 *    - Invalid ID param rejected (400 Bad Request)
 * 5. SQL Injection & Filter Tampering Defenses
 */

import http from 'node:http';
import path from 'node:path';
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

async function requestJson(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const method = options.method || 'GET';
  const headers = {
    'Accept': 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers
  };

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSession10Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 10 LIVE VERIFICATION & SECURITY AUDIT SUITE');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // Retrieve active seed users
    const student1 = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');     // id: 5 (owns complaints 1, 5)
    const student2 = await UserModel.findByEmail('priya.ee24@hostelcare.edu');      // id: 6 (owns complaint 2)
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu'); // id: 3
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');              // id: 1

    if (!student1 || !student2 || !staffUser || !adminUser) {
      throw new Error('Seed users missing from database. Please verify seeds.sql.');
    }

    const student1Token = generateToken({
      id: student1.id,
      email: student1.email,
      role: student1.role,
      name: student1.name
    });

    const student2Token = generateToken({
      id: student2.id,
      email: student2.email,
      role: student2.role,
      name: student2.name
    });

    const staffToken = generateToken({
      id: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      name: staffUser.name
    });

    const adminToken = generateToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name
    });

    const authHeadersStudent1 = { Authorization: `Bearer ${student1Token}` };
    const authHeadersStudent2 = { Authorization: `Bearer ${student2Token}` };
    const authHeadersStaff = { Authorization: `Bearer ${staffToken}` };
    const authHeadersAdmin = { Authorization: `Bearer ${adminToken}` };

    // ========================================================================
    // PART 1: STUDENT COMPLAINT LISTING (GET /api/complaints/mine & /v1/)
    // ========================================================================
    console.log('--- PART 1: Student Complaint Listing API ---');

    // Test 1: Student 1 retrieves personal complaints via GET /api/v1/complaints/mine
    const t1 = await requestJson(baseUrl, '/api/v1/complaints/mine', { headers: authHeadersStudent1 });
    const t1Pass = t1.status === 200 &&
                   t1.data?.success === true &&
                   Array.isArray(t1.data?.complaints) &&
                   t1.data.complaints.length === 2 &&
                   t1.data.complaints.every((c) => c.student_id === student1.id && c.category_name) &&
                   t1.data?.pagination?.total === 2 &&
                   t1.data?.pagination?.page === 1;
    recordTest(1, 'Student can retrieve own complaint list via GET /api/v1/complaints/mine', t1Pass,
      `HTTP ${t1.status}, count: ${t1.data?.complaints?.length}, total: ${t1.data?.pagination?.total}`,
      JSON.stringify(t1.data));

    // Test 2: Route alias support — GET /api/complaints/mine works identically
    const t2 = await requestJson(baseUrl, '/api/complaints/mine', { headers: authHeadersStudent1 });
    const t2Pass = t2.status === 200 && t2.data?.success === true && t2.data?.complaints?.length === 2;
    recordTest(2, 'Route prefix compatibility: GET /api/complaints/mine returns 200 OK', t2Pass,
      `HTTP ${t2.status}, complaints count: ${t2.data?.complaints?.length}`);

    // Test 3: Route alias support — GET /api/v1/complaints (without /mine) works for student
    const t3 = await requestJson(baseUrl, '/api/v1/complaints', { headers: authHeadersStudent1 });
    const t3Pass = t3.status === 200 && t3.data?.success === true && t3.data?.complaints?.length === 2;
    recordTest(3, 'Route alias: GET /api/v1/complaints returns student personal complaints', t3Pass,
      `HTTP ${t3.status}, count: ${t3.data?.complaints?.length}`);

    // Test 4: Newest-first ordering check (created_at DESC, id DESC)
    const complaintsT4 = t1.data?.complaints || [];
    let t4Pass = false;
    if (complaintsT4.length >= 2) {
      const date0 = new Date(complaintsT4[0].created_at).getTime();
      const date1 = new Date(complaintsT4[1].created_at).getTime();
      t4Pass = date0 > date1 || (date0 === date1 && complaintsT4[0].id > complaintsT4[1].id);
    }
    recordTest(4, 'Complaints listing respects newest-first ordering (created_at DESC, id DESC)', t4Pass,
      `Item 0: id=${complaintsT4[0]?.id} (${complaintsT4[0]?.created_at}), Item 1: id=${complaintsT4[1]?.id} (${complaintsT4[1]?.created_at})`);

    // ========================================================================
    // PART 2: COMPLAINT DETAILS & OWNERSHIP PROTECTION
    // ========================================================================
    console.log('\n--- PART 2: Single Complaint Details & Anti-Enumeration Ownership ---');

    // Test 5: Student 1 can retrieve details of their owned complaint (ID 1)
    const t5 = await requestJson(baseUrl, '/api/v1/complaints/1', { headers: authHeadersStudent1 });
    const c1 = t5.data?.complaint;
    const t5Pass = t5.status === 200 &&
                   t5.data?.success === true &&
                   c1?.id === 1 &&
                   c1?.ticket_number === 'HC-20261101-0001' &&
                   c1?.category_name === 'Electrical' &&
                   c1?.title && c1?.description &&
                   c1?.hostel_block === 'Block A' &&
                   c1?.room_number === 'A-102' &&
                   c1?.status === 'in_progress' &&
                   c1?.priority === 'high' &&
                   c1?.created_at &&
                   typeof c1?.remarks === 'string';
    recordTest(5, 'Student 1 retrieves owned complaint details (ID 1) with category and remarks', t5Pass,
      `HTTP ${t5.status}, ticket: ${c1?.ticket_number}, category: ${c1?.category_name}, remarks: "${c1?.remarks}"`);

    // Test 6: Student 2 can retrieve details of their owned complaint (ID 2)
    const t6 = await requestJson(baseUrl, '/api/v1/complaints/2', { headers: authHeadersStudent2 });
    const c2 = t6.data?.complaint;
    const t6Pass = t6.status === 200 &&
                   t6.data?.success === true &&
                   c2?.id === 2 &&
                   c2?.ticket_number === 'HC-20261102-0002' &&
                   c2?.student_id === student2.id;
    recordTest(6, 'Student 2 retrieves owned complaint details (ID 2)', t6Pass,
      `HTTP ${t6.status}, ticket: ${c2?.ticket_number}, student_id: ${c2?.student_id}`);

    // Test 7: Anti-Enumeration IDOR Protection — Student 2 accesses Student 1's complaint (ID 1) -> 404 Not Found
    const t7 = await requestJson(baseUrl, '/api/v1/complaints/1', { headers: authHeadersStudent2 });
    const t7Pass = t7.status === 404 &&
                   t7.data?.success === false &&
                   t7.data?.message === 'Complaint not found.';
    recordTest(7, 'IDOR Protection: Student 2 cannot access Student 1 complaint (returns 404 Not Found)', t7Pass,
      `HTTP ${t7.status}, message: "${t7.data?.message}"`);

    // Test 8: Anti-Enumeration IDOR Protection — Student 1 accesses Student 2's complaint (ID 2) -> 404 Not Found
    const t8 = await requestJson(baseUrl, '/api/v1/complaints/2', { headers: authHeadersStudent1 });
    const t8Pass = t8.status === 404 &&
                   t8.data?.success === false &&
                   t8.data?.message === 'Complaint not found.';
    recordTest(8, 'IDOR Protection: Student 1 cannot access Student 2 complaint (returns 404 Not Found)', t8Pass,
      `HTTP ${t8.status}, message: "${t8.data?.message}"`);

    // Test 9: Non-existent complaint ID (e.g. 99999) returns identical 404 Not Found
    const t9 = await requestJson(baseUrl, '/api/v1/complaints/99999', { headers: authHeadersStudent1 });
    const t9Pass = t9.status === 404 &&
                   t9.data?.success === false &&
                   t9.data?.message === 'Complaint not found.';
    recordTest(9, 'Non-existent ID (99999) returns identical 404 Not Found', t9Pass,
      `HTTP ${t9.status}, message: "${t9.data?.message}"`);

    // Test 10: Compare responses between non-existent ID and unauthorized existing ID (Zero Oracle Leakage)
    const t10Pass = t7.status === t9.status &&
                    JSON.stringify(t7.data) === JSON.stringify(t9.data);
    recordTest(10, 'Anti-Enumeration Equivalence: Unauthorized ID vs Non-existent ID return identical payload', t10Pass,
      `Both return HTTP 404 with exact payload: ${JSON.stringify(t7.data)}`);

    // ========================================================================
    // PART 3: AUTHENTICATION & ROLE-BASED ACCESS CONTROL
    // ========================================================================
    console.log('\n--- PART 3: Authentication & Role-Based Access Control ---');

    // Test 11: Unauthenticated request to GET /api/v1/complaints/mine returns 401
    const t11 = await requestJson(baseUrl, '/api/v1/complaints/mine');
    const t11Pass = t11.status === 401 && t11.data?.code === 'NO_TOKEN';
    recordTest(11, 'Unauthenticated request to /mine rejected with 401 NO_TOKEN', t11Pass,
      `HTTP ${t11.status}, code: ${t11.data?.code}`);

    // Test 12: Unauthenticated request to GET /api/v1/complaints/1 returns 401
    const t12 = await requestJson(baseUrl, '/api/v1/complaints/1');
    const t12Pass = t12.status === 401 && t12.data?.code === 'NO_TOKEN';
    recordTest(12, 'Unauthenticated request to /:id rejected with 401 NO_TOKEN', t12Pass,
      `HTTP ${t12.status}, code: ${t12.data?.code}`);

    // Test 13: Staff token receives 403 on GET /api/v1/complaints/mine
    const t13 = await requestJson(baseUrl, '/api/v1/complaints/mine', { headers: authHeadersStaff });
    const t13Pass = t13.status === 403 && t13.data?.code === 'FORBIDDEN_ROLE';
    recordTest(13, 'Staff token rejected from student personal queue with 403 FORBIDDEN_ROLE', t13Pass,
      `HTTP ${t13.status}, code: ${t13.data?.code}`);

    // Test 14: Staff token receives 403 on GET /api/v1/complaints/1
    const t14 = await requestJson(baseUrl, '/api/v1/complaints/1', { headers: authHeadersStaff });
    const t14Pass = t14.status === 403 && t14.data?.code === 'FORBIDDEN_ROLE';
    recordTest(14, 'Staff token rejected from student detail route with 403 FORBIDDEN_ROLE', t14Pass,
      `HTTP ${t14.status}, code: ${t14.data?.code}`);

    // Test 15: Admin token receives 403 on GET /api/v1/complaints/mine
    const t15 = await requestJson(baseUrl, '/api/v1/complaints/mine', { headers: authHeadersAdmin });
    const t15Pass = t15.status === 403 && t15.data?.code === 'FORBIDDEN_ROLE';
    recordTest(15, 'Admin token rejected from student personal queue with 403 FORBIDDEN_ROLE', t15Pass,
      `HTTP ${t15.status}, code: ${t15.data?.code}`);

    // Test 16: Admin token receives 403 on GET /api/v1/complaints/1
    const t16 = await requestJson(baseUrl, '/api/v1/complaints/1', { headers: authHeadersAdmin });
    const t16Pass = t16.status === 403 && t16.data?.code === 'FORBIDDEN_ROLE';
    recordTest(16, 'Admin token rejected from student detail route with 403 FORBIDDEN_ROLE', t16Pass,
      `HTTP ${t16.status}, code: ${t16.data?.code}`);

    // ========================================================================
    // PART 4: PAGINATION & ORDERING
    // ========================================================================
    console.log('\n--- PART 4: Pagination & Page Size Validation ---');

    // Test 17: Pagination limit works (?limit=1 returns 1 item, total 2, totalPages 2)
    const t17 = await requestJson(baseUrl, '/api/v1/complaints/mine?limit=1', { headers: authHeadersStudent1 });
    const t17Pass = t17.status === 200 &&
                    t17.data?.complaints?.length === 1 &&
                    t17.data?.pagination?.limit === 1 &&
                    t17.data?.pagination?.total === 2 &&
                    t17.data?.pagination?.totalPages === 2 &&
                    t17.data?.pagination?.page === 1;
    recordTest(17, 'Pagination limit parameter works (?limit=1 returns exactly 1 item)', t17Pass,
      `HTTP ${t17.status}, returned: ${t17.data?.complaints?.length}, total: ${t17.data?.pagination?.total}, totalPages: ${t17.data?.pagination?.totalPages}`);

    // Test 18: Pagination page navigation works (?page=2&limit=1 returns second item)
    const t18 = await requestJson(baseUrl, '/api/v1/complaints/mine?page=2&limit=1', { headers: authHeadersStudent1 });
    const t18Pass = t18.status === 200 &&
                    t18.data?.complaints?.length === 1 &&
                    t18.data?.pagination?.page === 2 &&
                    t18.data.complaints[0]?.id !== t17.data?.complaints[0]?.id;
    recordTest(18, 'Pagination page navigation works (?page=2&limit=1 returns distinct next record)', t18Pass,
      `Page 1 ID: ${t17.data?.complaints[0]?.id}, Page 2 ID: ${t18.data?.complaints[0]?.id}`);

    // Test 19: Maximum page limit enforcement (> 50 rejected with 400 Bad Request)
    const t19 = await requestJson(baseUrl, '/api/v1/complaints/mine?limit=51', { headers: authHeadersStudent1 });
    const t19Pass = t19.status === 400 && t19.data?.success === false;
    recordTest(19, 'Maximum page limit enforcement (?limit=51 rejected with 400 Bad Request)', t19Pass,
      `HTTP ${t19.status}, message: "${t19.data?.message}"`);

    // Test 20: Invalid page values (?page=0, ?page=-1, ?page=abc rejected with 400 Bad Request)
    const t20a = await requestJson(baseUrl, '/api/v1/complaints/mine?page=0', { headers: authHeadersStudent1 });
    const t20b = await requestJson(baseUrl, '/api/v1/complaints/mine?page=-5', { headers: authHeadersStudent1 });
    const t20c = await requestJson(baseUrl, '/api/v1/complaints/mine?page=abc', { headers: authHeadersStudent1 });
    const t20Pass = t20a.status === 400 && t20b.status === 400 && t20c.status === 400;
    recordTest(20, 'Invalid page parameter (?page=0, ?page=-5, ?page=abc rejected with 400)', t20Pass,
      `page=0 -> HTTP ${t20a.status}, page=-5 -> HTTP ${t20b.status}, page=abc -> HTTP ${t20c.status}`);

    // Test 21: Invalid limit values (?limit=0, ?limit=xyz rejected with 400 Bad Request)
    const t21a = await requestJson(baseUrl, '/api/v1/complaints/mine?limit=0', { headers: authHeadersStudent1 });
    const t21b = await requestJson(baseUrl, '/api/v1/complaints/mine?limit=xyz', { headers: authHeadersStudent1 });
    const t21Pass = t21a.status === 400 && t21b.status === 400;
    recordTest(21, 'Invalid limit parameter (?limit=0, ?limit=xyz rejected with 400)', t21Pass,
      `limit=0 -> HTTP ${t21a.status}, limit=xyz -> HTTP ${t21b.status}`);

    // ========================================================================
    // PART 5: FILTERING & OWNERSHIP TOTAL CONSISTENCY
    // ========================================================================
    console.log('\n--- PART 5: Status, Category Filtering & Count Query Consistency ---');

    // Test 22: Status filter works (?status=in_progress returns only in_progress complaints)
    const t22 = await requestJson(baseUrl, '/api/v1/complaints/mine?status=in_progress', { headers: authHeadersStudent1 });
    const t22Pass = t22.status === 200 &&
                    t22.data?.complaints?.length === 1 &&
                    t22.data?.pagination?.total === 1 &&
                    t22.data?.complaints[0]?.status === 'in_progress' &&
                    t22.data?.complaints[0]?.id === 1;
    recordTest(22, 'Status filter (?status=in_progress returns only matching complaints)', t22Pass,
      `HTTP ${t22.status}, count: ${t22.data?.complaints?.length}, complaint status: "${t22.data?.complaints[0]?.status}"`);

    // Test 23: Category filter works (?category_id=1 returns only Electrical complaints)
    const t23 = await requestJson(baseUrl, '/api/v1/complaints/mine?category_id=1', { headers: authHeadersStudent1 });
    const t23Pass = t23.status === 200 &&
                    t23.data?.complaints?.length === 2 &&
                    t23.data?.pagination?.total === 2 &&
                    t23.data?.complaints?.every((c) => c.category_id === 1);
    recordTest(23, 'Category filter (?category_id=1 returns only Electrical complaints)', t23Pass,
      `HTTP ${t23.status}, count: ${t23.data?.complaints?.length}, categories: ${t23.data?.complaints?.map((c) => c.category_name).join(', ')}`);

    // Test 24: Combined filters work (?status=in_progress&category_id=1)
    const t24 = await requestJson(baseUrl, '/api/v1/complaints/mine?status=in_progress&category_id=1', { headers: authHeadersStudent1 });
    const t24Pass = t24.status === 200 &&
                    t24.data?.complaints?.length === 1 &&
                    t24.data?.complaints[0]?.id === 1 &&
                    t24.data?.complaints[0]?.status === 'in_progress' &&
                    t24.data?.complaints[0]?.category_id === 1;
    recordTest(24, 'Combined filters (?status=in_progress&category_id=1 returns exact intersection)', t24Pass,
      `HTTP ${t24.status}, count: ${t24.data?.complaints?.length}, matched id: ${t24.data?.complaints[0]?.id}`);

    // Test 25: Filter with zero matches returns empty list and total: 0
    const t25 = await requestJson(baseUrl, '/api/v1/complaints/mine?status=resolved', { headers: authHeadersStudent1 });
    const t25Pass = t25.status === 200 &&
                    t25.data?.complaints?.length === 0 &&
                    t25.data?.pagination?.total === 0 &&
                    t25.data?.pagination?.totalPages === 1;
    recordTest(25, 'Filter with zero matches (?status=resolved for Student 1) returns empty list and total: 0', t25Pass,
      `HTTP ${t25.status}, complaints count: ${t25.data?.complaints?.length}, total: ${t25.data?.pagination?.total}`);

    // Test 26: Count query respects student ownership and filters
    const t26_s1 = await requestJson(baseUrl, '/api/v1/complaints/mine', { headers: authHeadersStudent1 });
    const t26_s2 = await requestJson(baseUrl, '/api/v1/complaints/mine', { headers: authHeadersStudent2 });
    const t26Pass = t26_s1.data?.pagination?.total === 2 && t26_s2.data?.pagination?.total === 1;
    recordTest(26, 'Count query strictly respects ownership boundary (Student 1 total: 2, Student 2 total: 1)', t26Pass,
      `Student 1 total: ${t26_s1.data?.pagination?.total}, Student 2 total: ${t26_s2.data?.pagination?.total}`);

    // Test 27: Invalid status filter rejected with 400 Bad Request
    const t27 = await requestJson(baseUrl, '/api/v1/complaints/mine?status=invalid_enum_state', { headers: authHeadersStudent1 });
    const t27Pass = t27.status === 400 && t27.data?.success === false;
    recordTest(27, 'Invalid status filter (?status=invalid_enum_state rejected with 400 Bad Request)', t27Pass,
      `HTTP ${t27.status}, message: "${t27.data?.message}"`);

    // Test 28: Invalid category filter rejected with 400 Bad Request
    const t28a = await requestJson(baseUrl, '/api/v1/complaints/mine?category_id=-1', { headers: authHeadersStudent1 });
    const t28b = await requestJson(baseUrl, '/api/v1/complaints/mine?category_id=abc', { headers: authHeadersStudent1 });
    const t28Pass = t28a.status === 400 && t28b.status === 400;
    recordTest(28, 'Invalid category filter (?category_id=-1, ?category_id=abc rejected with 400)', t28Pass,
      `category_id=-1 -> HTTP ${t28a.status}, category_id=abc -> HTTP ${t28b.status}`);

    // ========================================================================
    // PART 6: ID PARAMETER VALIDATION & SQL INJECTION DEFENSES
    // ========================================================================
    console.log('\n--- PART 6: ID Validation & SQL Injection Defenses ---');

    // Test 29: Invalid complaint ID parameter (GET /api/v1/complaints/abc or 0 rejected with 400)
    const t29a = await requestJson(baseUrl, '/api/v1/complaints/abc', { headers: authHeadersStudent1 });
    const t29b = await requestJson(baseUrl, '/api/v1/complaints/0', { headers: authHeadersStudent1 });
    const t29c = await requestJson(baseUrl, '/api/v1/complaints/-5', { headers: authHeadersStudent1 });
    const t29Pass = t29a.status === 400 && t29b.status === 400 && t29c.status === 400;
    recordTest(29, 'Invalid ID path parameter (/abc, /0, /-5 rejected with 400 Bad Request)', t29Pass,
      `id=abc -> HTTP ${t29a.status}, id=0 -> HTTP ${t29b.status}, id=-5 -> HTTP ${t29c.status}`);

    // Test 30: SQL injection payload in status filter rejected cleanly
    const t30 = await requestJson(baseUrl, `/api/v1/complaints/mine?status=${encodeURIComponent("' OR 1=1 --")}`, { headers: authHeadersStudent1 });
    const t30Pass = t30.status === 400 && t30.data?.success === false;
    recordTest(30, "SQL injection defense: ?status=' OR 1=1 -- safely rejected with 400 Bad Request", t30Pass,
      `HTTP ${t30.status}, message: "${t30.data?.message}"`);

    // Test 31: SQL injection payload in category_id rejected cleanly
    const t31 = await requestJson(baseUrl, `/api/v1/complaints/mine?category_id=${encodeURIComponent("1 OR 1=1")}`, { headers: authHeadersStudent1 });
    const t31Pass = t31.status === 400 && t31.data?.success === false;
    recordTest(31, "SQL injection defense: ?category_id=1 OR 1=1 safely rejected with 400 Bad Request", t31Pass,
      `HTTP ${t31.status}, message: "${t31.data?.message}"`);

    // Test 32: Remarks source inspection: latest remark from complaint_status_history correctly exposed
    const t32 = await requestJson(baseUrl, '/api/v1/complaints/5', { headers: authHeadersStudent1 });
    const c5 = t32.data?.complaint;
    // Complaint 5 was closed with remark: "Student confirmed work quality and closed ticket."
    const t32Pass = t32.status === 200 &&
                    c5?.id === 5 &&
                    c5?.remarks === 'Student confirmed work quality and closed ticket.' &&
                    c5?.latest_remarks === 'Student confirmed work quality and closed ticket.';
    recordTest(32, 'Latest remark correctly sourced from complaint_status_history without exposing full timeline', t32Pass,
      `Complaint 5 remark: "${c5?.remarks}"`);

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nTest server shut down cleanly.');
  }

  // ========================================================================
  // FINAL REPORT & SCOREBOARD
  // ========================================================================
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n========================================================================');
  console.log(`  SESSION 10 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    console.error(`❌ VERIFICATION FAILED: ${failedTests} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('🎉 ALL SESSION 10 TESTS PASSED PERFECTLY with ZERO FAILURES!\n');
    process.exit(0);
  }
}

runSession10Verification().catch((error) => {
  console.error('Fatal Verification Error:', error);
  process.exit(1);
});
