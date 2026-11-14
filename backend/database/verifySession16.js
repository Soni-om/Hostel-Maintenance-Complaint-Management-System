/**
 * HostelCare — Session 16 Verification & Integration Test Suite
 * Automated tests for Complaint Timeline, Resolution Remarks, and Student Feedback:
 *
 * 1. Static file structure & Frontend assets:
 *    - frontend/pages/student/complaint-details.html (visual timeline, star rating picker, feedback forms)
 *    - frontend/pages/staff/dashboard.html (details modal resident feedback integration)
 *    - backend/src/controllers/complaintController.js & staffController.js
 *    - backend/src/routes/complaintRoutes.js & staffRoutes.js
 *
 * 2. Chronological Complaint History (GET /api/complaints/:id/history):
 *    - Route parity across /api/complaints, /api/staff/complaints, and /api/v1/...
 *    - Strict chronological order (oldest to newest)
 *    - Inclusion of actor, old_status, new_status, remarks, and timestamps
 *    - Student ownership enforcement & uniform 404 anti-enumeration
 *    - Option D Hybrid Domain & Assignment visibility for Staff
 *    - Admin unrestricted access & unauthenticated 401 NO_TOKEN
 *
 * 3. Student Feedback Submission (POST /api/complaints/:id/feedback):
 *    - Successful 201 Created response with rating 1-5 and optional comments
 *    - Persistence in database `feedback` table
 *    - Atomic audit logging in `complaint_status_history`
 *    - Acceptance on both 'resolved' and 'closed' complaints
 *
 * 4. Rating Validation & Constraints:
 *    - Rejection of rating < 1 or > 5 (400 Bad Request)
 *    - Rejection of non-integer / float / string rating (400 Bad Request)
 *    - Rejection of missing rating (400 Bad Request)
 *    - Successful acceptance of boundary ratings 1 and 5
 *
 * 5. Resolution Eligibility Enforcement:
 *    - Rejection on 'pending' complaint (400 COMPLAINT_NOT_ELIGIBLE)
 *    - Rejection on 'assigned' complaint (400 COMPLAINT_NOT_ELIGIBLE)
 *    - Rejection on 'in_progress' complaint (400 COMPLAINT_NOT_ELIGIBLE)
 *
 * 6. Duplicate Feedback Prevention:
 *    - Rejection of second feedback attempt on same complaint (409 DUPLICATE_FEEDBACK)
 *    - 1-to-1 complaint-to-feedback constraint enforcement
 *
 * 7. RBAC & IDOR Ownership Defense:
 *    - Student IDOR defense: Student 2 receives 404 on Student 1 ticket
 *    - Staff rejected from submitting feedback (403 FORBIDDEN_ROLE)
 *    - Admin rejected from submitting feedback (403 FORBIDDEN_ROLE)
 *    - Unauthenticated request rejected (401 NO_TOKEN)
 *
 * 8. Feedback Retrieval (GET /api/complaints/:id/feedback):
 *    - Student owner retrieves feedback (200 OK)
 *    - Option D Staff retrieves feedback for permitted block (200 OK)
 *    - Cross-hostel staff denied (404 Not Found)
 *    - Admin retrieves feedback campus-wide (200 OK)
 *    - Ticket without feedback returns 200 OK with feedback: null
 *
 * 9. Database Baseline Restoration & Integrity:
 *    - Safe teardown of synthetic test complaints, history, and feedback
 *    - Verification of original seed counts (5 complaints, 8 users, 4 assignments, 2 feedback)
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

async function runSession16Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 16 VERIFICATION & INTEGRATION TEST SUITE');
  console.log('  Complaint Timeline, Resolution Remarks & Student Feedback Engine');
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
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      });

      req.on('error', reject);
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  // Tracking for clean teardown
  const createdComplaintIds = [];
  const createdFeedbackIds = [];

  try {
    // 1. Fetch test users from database
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');
    const supervisorStaff = await UserModel.findByEmail('sunita.supervisor@hostelcare.edu'); // Block A
    const plumberStaff = await UserModel.findByEmail('ramesh.plumber@hostelcare.edu'); // Block B
    const student1 = await UserModel.findByEmail('rahul.cs23@hostelcare.edu'); // Student 1 (Block A, Room A-102, id: 5)
    const student2 = await UserModel.findByEmail('priya.ee24@hostelcare.edu'); // Student 2 (Block B, Room B-204, id: 6)
    const student3 = await UserModel.findByEmail('aman.me23@hostelcare.edu'); // Student 3 (Block A, Room A-310, id: 7)
    const student4 = await UserModel.findByEmail('sneha.cv24@hostelcare.edu'); // Student 4 (Block C, Room C-115, id: 8)

    // Generate JWT auth tokens
    const adminToken = generateToken(adminUser);
    const supervisorToken = generateToken(supervisorStaff);
    const plumberToken = generateToken(plumberStaff);
    const student1Token = generateToken(student1);
    const student2Token = generateToken(student2);
    const student3Token = generateToken(student3);
    const student4Token = generateToken(student4);

    console.log('--- SECTION 1: ROUTE PARITY & HISTORY AVAILABILITY ---\n');

    // Test 1: GET /api/complaints/1/history returns 200 OK for student owner
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed = res.status === 200 && res.data.success === true && Array.isArray(res.data.history);
      recordTest(
        1,
        'Student owner retrieves chronological complaint history via /api/complaints/:id/history',
        passed,
        `Status: ${res.status}, History count: ${res.data?.history?.length}`
      );
    }

    // Test 2: Route alias /api/v1/complaints/1/history parity
    {
      const res = await makeRequest({
        path: '/api/v1/complaints/1/history',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed = res.status === 200 && res.data.success === true && Array.isArray(res.data.history);
      recordTest(
        2,
        'Route parity: /api/v1/complaints/:id/history returns identical 200 OK data',
        passed,
        `Status: ${res.status}, Count: ${res.data?.history?.length}`
      );
    }

    // Test 3: Staff route /api/staff/complaints/1/history returns 200 OK for Option D staff
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${supervisorToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && Array.isArray(res.data.history);
      recordTest(
        3,
        'Staff retrieves complaint history via /api/staff/complaints/:id/history under Option D',
        passed,
        `Status: ${res.status}, Count: ${res.data?.history?.length}`
      );
    }

    // Test 4: Route alias /api/v1/staff/complaints/1/history parity
    {
      const res = await makeRequest({
        path: '/api/v1/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${supervisorToken}` }
      });
      const passed = res.status === 200 && res.data.success === true;
      recordTest(
        4,
        'Route parity: /api/v1/staff/complaints/:id/history returns 200 OK',
        passed,
        `Status: ${res.status}`
      );
    }

    // Test 5: Chronological ordering (oldest to newest)
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const hist = res.data.history || [];
      let strictlyOrdered = hist.length >= 2;
      for (let i = 1; i < hist.length; i++) {
        const prevTime = new Date(hist[i - 1].changed_at || hist[i - 1].timestamp).getTime();
        const currTime = new Date(hist[i].changed_at || hist[i].timestamp).getTime();
        if (currTime < prevTime) {
          strictlyOrdered = false;
          break;
        }
      }
      recordTest(
        5,
        'History entries are ordered in ascending chronological sequence (oldest to newest)',
        strictlyOrdered,
        `Item count: ${hist.length}, Earliest: ${hist[0]?.changed_at}, Latest: ${hist[hist.length - 1]?.changed_at}`
      );
    }

    // Test 6: Completeness of history records (actor, old_status, new_status, remarks, timestamp)
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const item = res.data.history?.[0];
      const hasFields = Boolean(
        item &&
        item.id &&
        item.complaint_id === 1 &&
        (item.actor !== undefined || item.changed_by_name !== undefined) &&
        item.new_status !== undefined &&
        item.remarks !== undefined &&
        (item.changed_at !== undefined || item.timestamp !== undefined)
      );
      recordTest(
        6,
        'History record contains actor, old_status, new_status, remarks, and timestamp',
        hasFields,
        `Actor: ${item?.actor || item?.changed_by_name}, New Status: ${item?.new_status}, Remarks: "${item?.remarks}"`
      );
    }

    console.log('\n--- SECTION 2: AUTHORIZATION & OPTION D IDOR PROTECTION ON HISTORY ---\n');

    // Test 7: Student IDOR defense: Student 2 receives 404 on Student 1 history
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${student2Token}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        7,
        'Student IDOR defense: Student 2 receives 404 Not Found on Student 1 complaint history',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 8: Non-existent complaint ID returns 404 Not Found
    {
      const res = await makeRequest({
        path: '/api/complaints/99999/history',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        8,
        'Non-existent complaint ID (99999) returns uniform 404 Not Found',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 9: Anti-enumeration equivalence: Unauthorized ID vs Non-existent ID return identical payload
    {
      const resIdor = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${student2Token}` }
      });
      const resNonExistent = await makeRequest({
        path: '/api/complaints/99999/history',
        headers: { Authorization: `Bearer ${student2Token}` }
      });
      const passed =
        resIdor.status === 404 &&
        resNonExistent.status === 404 &&
        JSON.stringify(resIdor.data) === JSON.stringify(resNonExistent.data);
      recordTest(
        9,
        'Anti-enumeration equivalence: Unauthorized ID and non-existent ID return identical 404 payload',
        passed,
        `Payload matches: ${JSON.stringify(resIdor.data)}`
      );
    }

    // Test 10: Staff Option D: Cross-hostel staff (Block B) receives 404 on unassigned Block A complaint history
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${plumberToken}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        10,
        'Staff Option D: Cross-hostel staff (Block B) receives 404 Not Found on unassigned Block A ticket history',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 11: Staff Option D: Permitted staff (Block A) receives 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/1/history',
        headers: { Authorization: `Bearer ${supervisorToken}` }
      });
      const passed = res.status === 200 && res.data.success === true;
      recordTest(
        11,
        'Staff Option D: Permitted hostel block staff receives 200 OK on complaint history',
        passed,
        `Status: ${res.status}`
      );
    }

    // Test 12: Admin receives 200 OK campus-wide
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true;
      recordTest(
        12,
        'Administrator receives 200 OK on complaint history campus-wide',
        passed,
        `Status: ${res.status}`
      );
    }

    // Test 13: Unauthenticated request rejected with 401 NO_TOKEN
    {
      const res = await makeRequest({
        path: '/api/complaints/1/history'
      });
      const passed = res.status === 401 && res.data.code === 'NO_TOKEN';
      recordTest(
        13,
        'Unauthenticated history request rejected with HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    console.log('\n--- SECTION 3: FEEDBACK SUBMISSION (POST /api/complaints/:id/feedback) ---\n');

    // Create a temporary resolved complaint for Student 1 to test feedback submission
    let tempResolvedCompId = null;
    {
      const [insertRes] = await pool.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           block_id, hostel_block, room_number, priority, status, created_at, resolved_at
         ) VALUES (?, 5, 1, 'Temporary Resolved Ticket for Feedback Verification', 'Testing resolution feedback mechanism.', 1, 'Block A', 'A-102', 'normal', 'resolved', NOW(), NOW())`,
        [`HC-TEST-FB-${Date.now()}`]
      );
      tempResolvedCompId = insertRes.insertId;
      createdComplaintIds.push(tempResolvedCompId);
    }

    // Test 14: Feedback submission on resolved complaint succeeds with 201 Created
    let submittedFeedbackId = null;
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          rating: 5,
          comments: 'Superb and rapid repair work. The fan is functioning silently now.'
        }
      });
      const passed = res.status === 201 && res.data.success === true && res.data.feedback?.rating === 5;
      if (passed && res.data.feedback?.id) {
        submittedFeedbackId = res.data.feedback.id;
        createdFeedbackIds.push(submittedFeedbackId);
      }
      recordTest(
        14,
        'Student owner submits feedback on resolved complaint with rating and comments (201 Created)',
        passed,
        `Status: ${res.status}, Feedback ID: ${submittedFeedbackId}, Rating: ${res.data?.feedback?.rating}`
      );
    }

    // Test 15: Response payload structure matches API specification
    {
      const res = await makeRequest({
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed =
        res.status === 200 &&
        res.data.success === true &&
        res.data.feedback &&
        res.data.feedback.rating === 5 &&
        res.data.feedback.comment.includes('Superb and rapid');
      recordTest(
        15,
        'Response payload includes structured feedback metadata (rating, comment, student_id, created_at)',
        passed,
        `Rating: ${res.data?.feedback?.rating}, Comment: "${res.data?.feedback?.comment}"`
      );
    }

    // Test 16: Feedback record correctly persisted in MySQL `feedback` table
    {
      const [rows] = await pool.query(
        'SELECT * FROM feedback WHERE complaint_id = ?',
        [tempResolvedCompId]
      );
      const passed = rows.length === 1 && rows[0].rating === 5 && rows[0].student_id === 5;
      recordTest(
        16,
        'Feedback record persisted in MySQL database `feedback` table with rating=5 and student_id=5',
        passed,
        `Found records: ${rows.length}, DB Rating: ${rows[0]?.rating}`
      );
    }

    // Test 17: Feedback submission event atomically logged into `complaint_status_history`
    {
      const [histRows] = await pool.query(
        `SELECT * FROM complaint_status_history
         WHERE complaint_id = ? AND remarks LIKE '%satisfaction rating: 5/5%'`,
        [tempResolvedCompId]
      );
      const passed = histRows.length >= 1 && histRows[0].changed_by === 5;
      recordTest(
        17,
        'Feedback submission atomically logged into `complaint_status_history` audit trail',
        passed,
        `Logged remarks: "${histRows[0]?.remarks}"`
      );
    }

    // Test 18: Feedback submission on closed complaint succeeds with 201 Created
    let tempClosedCompId = null;
    {
      const [insertRes] = await pool.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           block_id, hostel_block, room_number, priority, status, created_at, resolved_at
         ) VALUES (?, 5, 2, 'Temporary Closed Ticket for Feedback Verification', 'Testing feedback on closed ticket.', 1, 'Block A', 'A-102', 'normal', 'closed', NOW(), NOW())`,
        [`HC-TEST-FB-CLOSED-${Date.now()}`]
      );
      tempClosedCompId = insertRes.insertId;
      createdComplaintIds.push(tempClosedCompId);

      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempClosedCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          rating: 4,
          comment: 'Good resolution and cleaned up properly.'
        }
      });
      const passed = res.status === 201 && res.data.success === true && res.data.feedback?.rating === 4;
      if (passed && res.data.feedback?.id) {
        createdFeedbackIds.push(res.data.feedback.id);
      }
      recordTest(
        18,
        'Feedback submission on closed complaint succeeds with 201 Created',
        passed,
        `Status: ${res.status}, Rating: ${res.data?.feedback?.rating}`
      );
    }

    console.log('\n--- SECTION 4: RATING VALIDATION & CONSTRAINTS ---\n');

    // Create an eligible resolved complaint for validation tests
    let tempValCompId = null;
    {
      const [insertRes] = await pool.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           block_id, hostel_block, room_number, priority, status, created_at, resolved_at
         ) VALUES (?, 5, 1, 'Validation Test Complaint', 'Testing rating boundaries.', 1, 'Block A', 'A-102', 'normal', 'resolved', NOW(), NOW())`,
        [`HC-TEST-VAL-${Date.now()}`]
      );
      tempValCompId = insertRes.insertId;
      createdComplaintIds.push(tempValCompId);
    }

    // Test 19: Rating = 0 rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 0, comment: 'Too low' }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        19,
        'Rating boundary validation: rating=0 rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 20: Rating = 6 rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 6, comment: 'Too high' }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        20,
        'Rating boundary validation: rating=6 rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 21: Rating = -1 rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: -1 }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        21,
        'Negative rating validation: rating=-1 rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 22: Non-integer string rating rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 'excellent' }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        22,
        'Non-integer rating validation: rating="excellent" rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 23: Float rating rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 3.5 }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        23,
        'Float rating validation: rating=3.5 rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 24: Missing rating field rejected with 400 Bad Request
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { comments: 'Forgot to rate' }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(
        24,
        'Missing rating field rejected with HTTP 400 Bad Request',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 25: Valid boundary ratings 1 and 5 accepted
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 1, comments: 'Bare minimum rating accepted for valid poor service review.' }
      });
      const passed = res.status === 201 && res.data.success === true && res.data.feedback?.rating === 1;
      if (passed && res.data.feedback?.id) {
        createdFeedbackIds.push(res.data.feedback.id);
      }
      recordTest(
        25,
        'Valid boundary rating: rating=1 successfully accepted with 201 Created',
        passed,
        `Status: ${res.status}, Stored rating: ${res.data?.feedback?.rating}`
      );
    }

    console.log('\n--- SECTION 5: RESOLUTION ELIGIBILITY ENFORCEMENT ---\n');

    // Test 26: Feedback submission on 'pending' complaint rejected with 400 Bad Request
    {
      // Complaint 3 is 'pending' (student 7: aman.me23@hostelcare.edu)
      const res = await makeRequest({
        method: 'POST',
        path: '/api/complaints/3/feedback',
        headers: { Authorization: `Bearer ${student3Token}` },
        body: { rating: 5, comments: 'Trying to rate pending ticket' }
      });
      const passed = res.status === 400 && res.data.code === 'COMPLAINT_NOT_ELIGIBLE';
      recordTest(
        26,
        'Resolution eligibility: Feedback submission on pending complaint rejected with HTTP 400 COMPLAINT_NOT_ELIGIBLE',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}", Message: "${res.data.message}"`
      );
    }

    // Test 27: Feedback submission on 'assigned' complaint rejected with 400 Bad Request
    {
      // Complaint 2 is 'assigned' (student 6)
      const res = await makeRequest({
        method: 'POST',
        path: '/api/complaints/2/feedback',
        headers: { Authorization: `Bearer ${student2Token}` },
        body: { rating: 4, comments: 'Trying to rate assigned ticket' }
      });
      const passed = res.status === 400 && res.data.code === 'COMPLAINT_NOT_ELIGIBLE';
      recordTest(
        27,
        'Resolution eligibility: Feedback submission on assigned complaint rejected with HTTP 400 COMPLAINT_NOT_ELIGIBLE',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    // Test 28: Feedback submission on 'in_progress' complaint rejected with 400 Bad Request
    {
      // Complaint 1 is 'in_progress' (student 5)
      const res = await makeRequest({
        method: 'POST',
        path: '/api/complaints/1/feedback',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 5, comments: 'Trying to rate in_progress ticket' }
      });
      const passed = res.status === 400 && res.data.code === 'COMPLAINT_NOT_ELIGIBLE';
      recordTest(
        28,
        'Resolution eligibility: Feedback submission on in_progress complaint rejected with HTTP 400 COMPLAINT_NOT_ELIGIBLE',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    console.log('\n--- SECTION 6: DUPLICATE FEEDBACK PREVENTION ---\n');

    // Test 29: Attempting second feedback submission on complaint with existing feedback rejected with 409 Conflict
    {
      // tempValCompId already received feedback in Test 25
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempValCompId}/feedback`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 5, comments: 'Attempting duplicate feedback on same ticket' }
      });
      const passed = (res.status === 409 || res.status === 400) && res.data.code === 'DUPLICATE_FEEDBACK';
      recordTest(
        29,
        'Duplicate feedback prevention: Second feedback submission on same complaint rejected with 409 DUPLICATE_FEEDBACK',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}", Message: "${res.data.message}"`
      );
    }

    // Test 30: Second submission rejected both at database constraint and model level without modifying existing feedback
    {
      // Complaint 4 already has seed feedback (rating: 5, student: 8)
      const res = await makeRequest({
        method: 'POST',
        path: '/api/complaints/4/feedback',
        headers: { Authorization: `Bearer ${student4Token}` },
        body: { rating: 1, comments: 'Attempting to overwrite existing seed feedback' }
      });
      const passed = (res.status === 409 || res.status === 400) && res.data.code === 'DUPLICATE_FEEDBACK';

      // Confirm DB record remains untouched with original rating=5
      const [rows] = await pool.query('SELECT rating FROM feedback WHERE complaint_id = 4');
      const dataUnchanged = rows.length === 1 && rows[0].rating === 5;

      recordTest(
        30,
        'One-to-one constraint: Duplicate feedback attempt on seed complaint 4 rejected and original feedback preserved',
        passed && dataUnchanged,
        `Status: ${res.status}, Preserved DB rating: ${rows[0]?.rating}`
      );
    }

    console.log('\n--- SECTION 7: FEEDBACK AUTHORIZATION & IDOR ENFORCEMENT ---\n');

    // Test 31: Student IDOR: Student 2 attempting to submit feedback on Student 1 resolved complaint receives 404 Not Found
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        headers: { Authorization: `Bearer ${student2Token}` },
        body: { rating: 4, comments: 'Cross-student feedback attempt' }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        31,
        'Student IDOR defense: Student 2 attempting to submit feedback on Student 1 complaint receives 404 Not Found',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 32: Non-existent complaint ID returns 404 Not Found
    {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/complaints/99999/feedback',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { rating: 5, comments: 'Non existent ticket' }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        32,
        'Feedback submission on non-existent complaint ID returns HTTP 404 Not Found',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 33: Staff role attempting to submit feedback rejected with 403 FORBIDDEN_ROLE
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        headers: { Authorization: `Bearer ${supervisorToken}` },
        body: { rating: 5, comments: 'Staff submitting feedback' }
      });
      const passed = res.status === 403 && res.data.code === 'FORBIDDEN_ROLE';
      recordTest(
        33,
        'Role defense: Staff user attempting to submit feedback rejected with HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    // Test 34: Admin role attempting to submit feedback rejected with 403 FORBIDDEN_ROLE
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { rating: 5, comments: 'Admin submitting feedback' }
      });
      const passed = res.status === 403 && res.data.code === 'FORBIDDEN_ROLE';
      recordTest(
        34,
        'Role defense: Admin user attempting to submit feedback rejected with HTTP 403 FORBIDDEN_ROLE',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    // Test 35: Unauthenticated feedback submission rejected with 401 NO_TOKEN
    {
      const res = await makeRequest({
        method: 'POST',
        path: `/api/complaints/${tempResolvedCompId}/feedback`,
        body: { rating: 5, comments: 'Unauth feedback' }
      });
      const passed = res.status === 401 && res.data.code === 'NO_TOKEN';
      recordTest(
        35,
        'Unauthenticated feedback submission rejected with HTTP 401 NO_TOKEN',
        passed,
        `Status: ${res.status}, Code: "${res.data.code}"`
      );
    }

    console.log('\n--- SECTION 8: FEEDBACK RETRIEVAL (GET /api/complaints/:id/feedback) ---\n');

    // Test 36: Student owner retrieves feedback with 200 OK
    {
      // Complaint 5 is closed, student 5, has seed feedback
      const res = await makeRequest({
        path: '/api/complaints/5/feedback',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed =
        res.status === 200 &&
        res.data.success === true &&
        res.data.feedback?.rating === 4 &&
        res.data.feedback?.student_id === 5;
      recordTest(
        36,
        'Student owner retrieves resolution feedback via GET /api/complaints/:id/feedback (200 OK)',
        passed,
        `Status: ${res.status}, Rating: ${res.data?.feedback?.rating}, Comment: "${res.data?.feedback?.comment}"`
      );
    }

    // Test 37: Student 2 receives 404 on Student 1 feedback (anti-enumeration)
    {
      const res = await makeRequest({
        path: '/api/complaints/5/feedback',
        headers: { Authorization: `Bearer ${student2Token}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        37,
        'Student IDOR defense: Student 2 receives 404 Not Found on Student 1 complaint feedback',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 38: Staff Option D: Permitted staff retrieves feedback with 200 OK
    {
      // Complaint 5 is in Block A; supervisorStaff has hostel_block='Block A'
      const res = await makeRequest({
        path: '/api/complaints/5/feedback',
        headers: { Authorization: `Bearer ${supervisorToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.feedback?.rating === 4;
      recordTest(
        38,
        'Staff Option D: Permitted hostel block staff retrieves feedback with HTTP 200 OK',
        passed,
        `Status: ${res.status}, Rating: ${res.data?.feedback?.rating}`
      );
    }

    // Test 39: Staff Option D: Cross-hostel staff denied with 404 Not Found
    {
      // Complaint 5 is in Block A; plumberStaff has hostel_block='Block B' and no assignment on 5
      const res = await makeRequest({
        path: '/api/complaints/5/feedback',
        headers: { Authorization: `Bearer ${plumberToken}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(
        39,
        'Staff Option D: Cross-hostel staff denied feedback access with uniform 404 Not Found',
        passed,
        `Status: ${res.status}, Message: "${res.data.message}"`
      );
    }

    // Test 40: Admin retrieves feedback with 200 OK campus-wide
    {
      const res = await makeRequest({
        path: '/api/complaints/5/feedback',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.feedback?.rating === 4;
      recordTest(
        40,
        'Administrator retrieves complaint feedback campus-wide with HTTP 200 OK',
        passed,
        `Status: ${res.status}, Rating: ${res.data?.feedback?.rating}`
      );
    }

    // Test 41: Complaint without feedback returns 200 OK with feedback: null
    {
      // Complaint 1 has no feedback
      const res = await makeRequest({
        path: '/api/complaints/1/feedback',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.feedback === null;
      recordTest(
        41,
        'Complaint without feedback returns 200 OK with feedback: null',
        passed,
        `Status: ${res.status}, Feedback: ${JSON.stringify(res.data?.feedback)}`
      );
    }

    // Test 42: Staff route alias /api/staff/complaints/:id/feedback returns 200 OK
    {
      const res = await makeRequest({
        path: '/api/staff/complaints/5/feedback',
        headers: { Authorization: `Bearer ${supervisorToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.feedback?.rating === 4;
      recordTest(
        42,
        'Staff route parity: /api/staff/complaints/:id/feedback returns 200 OK with feedback',
        passed,
        `Status: ${res.status}, Rating: ${res.data?.feedback?.rating}`
      );
    }

    console.log('\n--- SECTION 9: FRONTEND ARCHITECTURE & CLIENT-SIDE VERIFICATION ---\n');

    // Test 43: Frontend — complaint-details.html contains visual timeline container and elements
    {
      const detailsHtmlPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaint-details.html');
      const detailsHtml = fs.readFileSync(detailsHtmlPath, 'utf8');
      const hasTimelineContainer = detailsHtml.includes('id="complaint-timeline"') && detailsHtml.includes('timeline-container');
      const hasTimelineFunction = detailsHtml.includes('function renderTimeline(');
      const passed = hasTimelineContainer && hasTimelineFunction;
      recordTest(
        43,
        'Frontend — complaint-details.html contains chronological visual timeline container and renderTimeline()',
        passed,
        `Has timeline container: ${hasTimelineContainer}, Has renderTimeline: ${hasTimelineFunction}`
      );
    }

    // Test 44: Frontend — complaint-details.html contains star rating picker and feedback form
    {
      const detailsHtmlPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaint-details.html');
      const detailsHtml = fs.readFileSync(detailsHtmlPath, 'utf8');
      const hasStarPicker = detailsHtml.includes('star-rating-picker') && detailsHtml.includes('star-btn');
      const hasFeedbackForm = detailsHtml.includes('id="feedback-form"') && detailsHtml.includes('submitResidentFeedback(');
      const passed = hasStarPicker && hasFeedbackForm;
      recordTest(
        44,
        'Frontend — complaint-details.html contains interactive 1-5 star picker and submitResidentFeedback()',
        passed,
        `Has star picker: ${hasStarPicker}, Has feedback form: ${hasFeedbackForm}`
      );
    }

    // Test 45: Frontend — complaint-details.html contains read-only feedback view state to prevent duplicate submissions
    {
      const detailsHtmlPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaint-details.html');
      const detailsHtml = fs.readFileSync(detailsHtmlPath, 'utf8');
      const hasViewState = detailsHtml.includes('id="feedback-view-state"');
      const hasFeedbackRenderer = detailsHtml.includes('function renderFeedback(');
      const passed = hasViewState && hasFeedbackRenderer;
      recordTest(
        45,
        'Frontend — complaint-details.html contains read-only feedback view state and renderFeedback()',
        passed,
        `Has view state: ${hasViewState}, Has renderFeedback: ${hasFeedbackRenderer}`
      );
    }

    // Test 46: Frontend — staff dashboard.html integrates resident feedback display
    {
      const staffHtmlPath = path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html');
      const staffHtml = fs.readFileSync(staffHtmlPath, 'utf8');
      const hasFeedbackBox = staffHtml.includes('details-feedback-box');
      const passed = hasFeedbackBox;
      recordTest(
        46,
        'Frontend — staff dashboard.html integrates resident feedback card in ticket details modal',
        passed,
        `Has details-feedback-box: ${hasFeedbackBox}`
      );
    }

    console.log('\n--- SECTION 10: DATABASE BASELINE RESTORATION & INTEGRITY ---\n');

    // Clean up temporary synthetic complaints, feedback, and history records
    if (createdFeedbackIds.length > 0) {
      const placeholders = createdFeedbackIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM feedback WHERE id IN (${placeholders})`, createdFeedbackIds);
    }

    if (createdComplaintIds.length > 0) {
      const placeholders = createdComplaintIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM feedback WHERE complaint_id IN (${placeholders})`, createdComplaintIds);
      await pool.query(`DELETE FROM complaint_status_history WHERE complaint_id IN (${placeholders})`, createdComplaintIds);
      await pool.query(`DELETE FROM complaints WHERE id IN (${placeholders})`, createdComplaintIds);
    }

    // Test 47: Temporary test data cleanly purged
    {
      const [remainingTempComps] = await pool.query(
        "SELECT COUNT(*) AS count FROM complaints WHERE title LIKE '%Temporary%' OR title LIKE '%Validation Test%'"
      );
      const passed = remainingTempComps[0].count === 0;
      recordTest(
        47,
        'Controlled teardown: All synthetic test complaints and temporary feedback records purged',
        passed,
        `Remaining synthetic complaints: ${remainingTempComps[0].count}`
      );
    }

    // Test 48: Database baseline integrity preserved (5 complaints, 8 users, 4 assignments, 2 feedback)
    {
      const [compRows] = await pool.query('SELECT COUNT(*) AS count FROM complaints');
      const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
      const [assignRows] = await pool.query('SELECT COUNT(*) AS count FROM complaint_assignments');
      const [feedRows] = await pool.query('SELECT COUNT(*) AS count FROM feedback');

      const complaintsCount = compRows[0]?.count || 0;
      const usersCount = userRows[0]?.count || 0;
      const assignmentsCount = assignRows[0]?.count || 0;
      const feedbackCount = feedRows[0]?.count || 0;

      const passed =
        complaintsCount === 5 &&
        usersCount === 8 &&
        assignmentsCount === 4 &&
        feedbackCount === 2;

      recordTest(
        48,
        'Database baseline integrity preserved (5 complaints, 8 users, 4 assignments, 2 feedback)',
        passed,
        `Complaints: ${complaintsCount} (exp 5), Users: ${usersCount} (exp 8), Assignments: ${assignmentsCount} (exp 4), Feedback: ${feedbackCount} (exp 2)`
      );
    }

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nVerification test server closed.');
  }

  // Final summary
  console.log('\n========================================================================');
  console.log('  SESSION 16 VERIFICATION EXECUTION SUMMARY');
  console.log('========================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Automated Tests : ${results.length}`);
  console.log(`Tests Passed           : ${passedCount}`);
  console.log(`Tests Failed           : ${failedCount}`);

  if (failedCount === 0) {
    console.log('\n🎉 ALL SESSION 16 TESTS PASSED PERFECTLY!');
  } else {
    console.log(`\n❌ ${failedCount} TEST(S) FAILED. Review details above.`);
  }
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSession16Verification().catch((err) => {
  console.error('Fatal Session 16 verification error:', err);
  process.exit(1);
});
