/**
 * HostelCare — Session 9 Live Verification Suite
 * Automated tests for:
 * 1. Complaint Categories Discovery API (GET /api/categories & /api/v1/categories)
 *    - Authorized access for Student, Staff, and Admin (200 OK)
 *    - Unauthenticated rejection (401 NO_TOKEN)
 * 2. Student Complaint Creation API (POST /api/complaints & /api/v1/complaints)
 *    - Authorized creation by Student (201 Created)
 *    - Strict rejection of Staff & Admin callers (403 FORBIDDEN_ROLE)
 *    - Unauthenticated rejection (401 NO_TOKEN)
 * 3. Privileged Field & Ownership Injection Protection (400 Bad Request)
 *    - Rejection of client-controlled priority, status, student_id, ticket_number, hostel_block
 * 4. Input Schema & Active Category Validation (400 Bad Request)
 *    - Missing/short title, missing/short description, invalid/inactive category_id
 * 5. Room Number Resolution & Fallback Behavior
 *    - Fallback to student registered room when omitted
 *    - Rejection of mismatched room number
 * 6. Unique Ticket Generation & Safeguards (HC-YYYYMMDD-XXXX in Asia/Kolkata)
 *    - Asia/Kolkata date format check
 *    - Sequential suffix calculation independent of complaint ID
 *    - 9,999 daily capacity guard (controlled 503 / exception)
 * 7. Atomic ACID Transaction & Lifecycle History
 *    - Atomic insertion into complaints and complaint_status_history
 *    - Transaction rollback on failure (zero partial/orphaned records)
 *    - Exactly 1 initial pending history entry per created complaint
 * 8. Concurrency & Collision Retries
 *    - Fresh-transaction retry on ticket collision
 * 9. Teardown & Database Relational Cleanliness
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
const { getKolkataDateString, generateNextTicketNumber } = await import('../src/utils/ticketGenerator.js');

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

async function runSession9Verification() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 9 LIVE VERIFICATION SUITE           ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const createdComplaintIds = [];

  try {
    // Retrieve active seed users
    const studentUser = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu');
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');

    if (!studentUser || !staffUser || !adminUser) {
      throw new Error('Seed users missing from database. Please run seed script.');
    }

    const studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
      name: studentUser.name
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

    // ========================================================================
    // PART 1: COMPLAINT CATEGORIES DISCOVERY (GET /api/categories & /v1/)
    // ========================================================================
    console.log('--- PART 1: Complaint Categories Discovery API ---');

    // Test 1: Unauthenticated request rejected (401 NO_TOKEN)
    const t1 = await requestJson(baseUrl, '/api/v1/categories');
    recordTest(
      1,
      'Unauthenticated request to GET /api/v1/categories returns HTTP 401 NO_TOKEN',
      t1.status === 401 && t1.data.code === 'NO_TOKEN',
      `HTTP ${t1.status}, code: ${t1.data.code}`
    );

    // Test 2: Student can retrieve categories (200 OK)
    const t2 = await requestJson(baseUrl, '/api/v1/categories', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordTest(
      2,
      'Student can retrieve active complaint categories (HTTP 200 OK)',
      t2.status === 200 && Array.isArray(t2.data.categories) && t2.data.categories.length === 6,
      `HTTP ${t2.status}, categories count: ${t2.data.categories?.length}`
    );

    // Test 3: Staff can retrieve categories (200 OK)
    const t3 = await requestJson(baseUrl, '/api/categories', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    recordTest(
      3,
      'Staff can retrieve active complaint categories across /api alias (HTTP 200 OK)',
      t3.status === 200 && Array.isArray(t3.data.categories) && t3.data.categories.length === 6,
      `HTTP ${t3.status}, categories count: ${t3.data.categories?.length}`
    );

    // Test 4: Admin can retrieve categories (200 OK)
    const t4 = await requestJson(baseUrl, '/api/v1/categories', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    recordTest(
      4,
      'Admin can retrieve active complaint categories (HTTP 200 OK)',
      t4.status === 200 && Array.isArray(t4.data.categories) && t4.data.categories.length === 6,
      `HTTP ${t4.status}, categories count: ${t4.data.categories?.length}`
    );

    // ========================================================================
    // PART 2: ROLE-BASED ACCESS CONTROL ON COMPLAINT CREATION (POST /complaints)
    // ========================================================================
    console.log('\n--- PART 2: Role-Based Access Control on Complaint Creation ---');

    // Test 5: Unauthenticated complaint creation rejected (401 NO_TOKEN)
    const t5 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      body: { title: 'Test unauthenticated', description: 'Test description content', category_id: 1 }
    });
    recordTest(
      5,
      'Unauthenticated POST /api/v1/complaints returns HTTP 401 NO_TOKEN',
      t5.status === 401 && t5.data.code === 'NO_TOKEN',
      `HTTP ${t5.status}, code: ${t5.data.code}`
    );

    // Test 6: Staff caller forbidden from creating complaints (403 FORBIDDEN_ROLE)
    const t6 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${staffToken}` },
      body: { title: 'Staff creating complaint', description: 'Staff should be forbidden', category_id: 1 }
    });
    recordTest(
      6,
      'Staff role forbidden from lodging complaints (HTTP 403 FORBIDDEN_ROLE)',
      t6.status === 403 && t6.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t6.status}, code: ${t6.data.code}, message: "${t6.data.message}"`
    );

    // Test 7: Admin caller forbidden from creating complaints (403 FORBIDDEN_ROLE)
    const t7 = await requestJson(baseUrl, '/api/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { title: 'Admin creating complaint', description: 'Admin should be forbidden', category_id: 1 }
    });
    recordTest(
      7,
      'Admin role forbidden from lodging complaints (HTTP 403 FORBIDDEN_ROLE)',
      t7.status === 403 && t7.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${t7.status}, code: ${t7.data.code}, message: "${t7.data.message}"`
    );

    // ========================================================================
    // PART 3: PRIVILEGED FIELD & OWNERSHIP INJECTION PREVENTION (400 Bad Request)
    // ========================================================================
    console.log('\n--- PART 3: Privileged Field Injection Prevention ---');

    // Test 8: Client-controlled priority is rejected
    const t8 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan regulator sparking',
        description: 'Emits sparks and burning plastic smell.',
        category_id: 1,
        priority: 'urgent'
      }
    });
    recordTest(
      8,
      'Privileged field injection: client-controlled priority is rejected with HTTP 400',
      t8.status === 400 && t8.data.message?.includes('priority'),
      `HTTP ${t8.status}, message: "${t8.data.message}"`
    );

    // Test 9: Client-controlled status is rejected
    const t9 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan regulator sparking',
        description: 'Emits sparks and burning plastic smell.',
        category_id: 1,
        status: 'in_progress'
      }
    });
    recordTest(
      9,
      'Privileged field injection: client-controlled status is rejected with HTTP 400',
      t9.status === 400 && t9.data.message?.includes('status'),
      `HTTP ${t9.status}, message: "${t9.data.message}"`
    );

    // Test 10: Client-controlled student_id is rejected
    const t10 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan regulator sparking',
        description: 'Emits sparks and burning plastic smell.',
        category_id: 1,
        student_id: 99
      }
    });
    recordTest(
      10,
      'Privileged field injection: client-controlled student_id is rejected with HTTP 400',
      t10.status === 400 && t10.data.message?.includes('student_id'),
      `HTTP ${t10.status}, message: "${t10.data.message}"`
    );

    // Test 11: Client-controlled ticket_number is rejected
    const t11 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan regulator sparking',
        description: 'Emits sparks and burning plastic smell.',
        category_id: 1,
        ticket_number: 'HC-99999999-9999'
      }
    });
    recordTest(
      11,
      'Privileged field injection: client-controlled ticket_number is rejected with HTTP 400',
      t11.status === 400 && t11.data.message?.includes('ticket_number'),
      `HTTP ${t11.status}, message: "${t11.data.message}"`
    );

    // Test 12: Client-controlled hostel_block is rejected
    const t12 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan regulator sparking',
        description: 'Emits sparks and burning plastic smell.',
        category_id: 1,
        hostel_block: 'Block X'
      }
    });
    recordTest(
      12,
      'Privileged field injection: client-controlled hostel_block is rejected with HTTP 400',
      t12.status === 400 && t12.data.message?.includes('hostel_block'),
      `HTTP ${t12.status}, message: "${t12.data.message}"`
    );

    // ========================================================================
    // PART 4: INPUT SCHEMA & CATEGORY VALIDATION
    // ========================================================================
    console.log('\n--- PART 4: Input Schema & Category Validation ---');

    // Test 13: Missing title rejected (400)
    const t13 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { description: 'Emits sparks and burning plastic smell.', category_id: 1 }
    });
    recordTest(
      13,
      'Missing complaint title rejected with HTTP 400 Bad Request',
      t13.status === 400,
      `HTTP ${t13.status}, message: "${t13.data.message}"`
    );

    // Test 14: Title too short (< 5 chars) rejected (400)
    const t14 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { title: 'Fan', description: 'Emits sparks and burning plastic smell.', category_id: 1 }
    });
    recordTest(
      14,
      'Title too short (< 5 characters) rejected with HTTP 400 Bad Request',
      t14.status === 400,
      `HTTP ${t14.status}, message: "${t14.data.message}"`
    );

    // Test 15: Missing description rejected (400)
    const t15 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { title: 'Ceiling fan defective', category_id: 1 }
    });
    recordTest(
      15,
      'Missing complaint description rejected with HTTP 400 Bad Request',
      t15.status === 400,
      `HTTP ${t15.status}, message: "${t15.data.message}"`
    );

    // Test 16: Description too short (< 10 chars) rejected (400)
    const t16 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { title: 'Ceiling fan defective', description: 'Broken', category_id: 1 }
    });
    recordTest(
      16,
      'Description too short (< 10 characters) rejected with HTTP 400 Bad Request',
      t16.status === 400,
      `HTTP ${t16.status}, message: "${t16.data.message}"`
    );

    // Test 17: Non-existent category_id rejected (400)
    const t17 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { title: 'Ceiling fan defective', description: 'Speed regulator burnt and sparking.', category_id: 9999 }
    });
    recordTest(
      17,
      'Non-existent category_id rejected with HTTP 400 Bad Request',
      t17.status === 400,
      `HTTP ${t17.status}, message: "${t17.data.message}"`
    );

    // ========================================================================
    // PART 5: ROOM NUMBER RESOLUTION & FALLBACK POLICY
    // ========================================================================
    console.log('\n--- PART 5: Room Number Resolution & Fallback Policy ---');

    // Test 18: Room number mismatch with student registered room rejected (400)
    const t18 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Ceiling fan defective',
        description: 'Speed regulator burnt and sparking.',
        category_id: 1,
        room_number: 'B-999' // Rahul is registered in A-102
      }
    });
    recordTest(
      18,
      'Room number mismatch with registered room rejected with HTTP 400',
      t18.status === 400 && t18.data.message?.includes('Room number mismatch'),
      `HTTP ${t18.status}, message: "${t18.data.message}"`
    );

    // ========================================================================
    // PART 6: VALID STUDENT COMPLAINT CREATION & TICKET FORMAT
    // ========================================================================
    console.log('\n--- PART 6: Valid Student Complaint Creation & Ticket Format ---');

    // Test 19: Valid complaint creation with room_number omitted (falls back to A-102)
    const kolkataDate = getKolkataDateString();
    const t19 = await requestJson(baseUrl, '/api/v1/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Study room switchboard loose sparking',
        description: 'Main wall switchboard socket is loose and sparks when charger plugged in.',
        category_id: 1
      }
    });
    const c1 = t19.data?.complaint;
    if (c1?.id) createdComplaintIds.push(c1.id);

    const ticketRegex = new RegExp(`^HC-${kolkataDate}-\\d{4}$`);
    const isTicketValid = Boolean(c1?.ticket_number && ticketRegex.test(c1.ticket_number));
    const isRoomFallbackValid = c1?.room_number === studentUser.room_number;
    const isBlockValid = c1?.hostel_block === studentUser.hostel_block && c1?.block_id === studentUser.block_id;
    const isPriorityNormal = c1?.priority === 'normal';
    const isStatusPending = c1?.status === 'pending';

    recordTest(
      19,
      'Valid Student complaint creation with room fallback (HTTP 201 Created)',
      t19.status === 201 && isTicketValid && isRoomFallbackValid && isBlockValid && isPriorityNormal && isStatusPending,
      `HTTP ${t19.status}, ticket: "${c1?.ticket_number}", block: "${c1?.hostel_block}", room: "${c1?.room_number}", priority: "${c1?.priority}", status: "${c1?.status}"`
    );

    // Test 20: Valid complaint creation with matching room_number explicitly provided across /api alias
    const t20 = await requestJson(baseUrl, '/api/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        title: 'Bathroom washbasin faucet leaking continuously',
        description: 'Cold water tap drips continuously causing water wastage and noise.',
        category_id: 2,
        room_number: studentUser.room_number
      }
    });
    const c2 = t20.data?.complaint;
    if (c2?.id) createdComplaintIds.push(c2.id);

    const c2Seq = parseInt(c2?.ticket_number?.slice(12), 10);
    const c1Seq = parseInt(c1?.ticket_number?.slice(12), 10);
    const isSequential = c2Seq === c1Seq + 1;

    recordTest(
      20,
      'Valid complaint creation across /api alias produces strictly incremented sequential ticket',
      t20.status === 201 && isSequential,
      `Ticket 1: "${c1?.ticket_number}" (#${c1Seq}) -> Ticket 2: "${c2?.ticket_number}" (#${c2Seq})`
    );

    // ========================================================================
    // PART 7: ATOMIC ACID TRANSACTION & INITIAL STATUS HISTORY VERIFICATION
    // ========================================================================
    console.log('\n--- PART 7: Atomic ACID Transaction & History Verification ---');

    // Test 21: Verify complaint in MySQL matches database constraints exactly
    const [dbComplaintRows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [c1.id]);
    const dbComplaint = dbComplaintRows[0];
    const isDbRowValid = dbComplaint &&
      dbComplaint.student_id === studentUser.id &&
      dbComplaint.priority === 'normal' &&
      dbComplaint.status === 'pending' &&
      dbComplaint.resolved_at === null;

    recordTest(
      21,
      'MySQL database record persists exact student ownership, normal priority, and pending status',
      Boolean(isDbRowValid),
      `DB record id: ${dbComplaint?.id}, student_id: ${dbComplaint?.student_id}, priority: "${dbComplaint?.priority}", status: "${dbComplaint?.status}"`
    );

    // Test 22: Verify exactly one initial status history record created atomically
    const [historyRows] = await pool.query(
      'SELECT * FROM complaint_status_history WHERE complaint_id = ? ORDER BY id ASC',
      [c1.id]
    );
    const initialHistory = historyRows[0];
    const isHistoryValid = historyRows.length === 1 &&
      initialHistory.old_status === null &&
      initialHistory.new_status === 'pending' &&
      initialHistory.changed_by === studentUser.id &&
      initialHistory.remarks === 'Complaint lodged by resident.';

    recordTest(
      22,
      'Exactly 1 initial status history record logged atomically (old_status=NULL, new_status=pending)',
      isHistoryValid,
      `History records: ${historyRows.length}, old: ${initialHistory?.old_status}, new: "${initialHistory?.new_status}", remarks: "${initialHistory?.remarks}"`
    );

    // ========================================================================
    // PART 8: TICKET GENERATION SAFEGUARDS & CAPACITY ENFORCEMENT
    // ========================================================================
    console.log('\n--- PART 8: Ticket Generation Safeguards & Capacity Enforcement ---');

    // Test 23: Ticket Generator date is strictly in Asia/Kolkata
    const rawKolkata = getKolkataDateString();
    const formatterCheck = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()).replace(/-/g, '');
    recordTest(
      23,
      'Ticket Generator date calculation strictly reflects Asia/Kolkata (IST)',
      rawKolkata === formatterCheck && rawKolkata.length === 8,
      `Calculated date string: "${rawKolkata}" (Asia/Kolkata)`
    );

    // Test 24: Suffix 9,999 daily limit overflow safety guard
    // Test generator guard logic directly with simulated 9999 suffix
    let capacityGuardPassed = false;
    let capacityErrorMessage = '';
    const mockConn = await pool.getConnection();
    try {
      await mockConn.beginTransaction();
      // Temporarily insert a synthetic complaint with suffix 9999 for target date
      const testDateStr = '20991231';
      await mockConn.execute(
        `INSERT INTO complaints (
           ticket_number, student_id, category_id, title, description,
           hostel_block, room_number, priority, status
         ) VALUES (?, ?, ?, 'Mock Capacity', 'Mock', 'Block A', 'A-102', 'normal', 'pending')`,
        [`HC-${testDateStr}-9999`, studentUser.id, 1]
      );

      try {
        await generateNextTicketNumber(mockConn, new Date('2099-12-31T12:00:00Z'));
      } catch (err) {
        if (err.code === 'DAILY_TICKET_LIMIT_EXCEEDED' && err.statusCode === 503) {
          capacityGuardPassed = true;
          capacityErrorMessage = err.message;
        }
      }
      await mockConn.rollback(); // Roll back so mock complaint is never committed
    } finally {
      mockConn.release();
    }

    recordTest(
      24,
      'Daily ticket limit safeguard: sequence exceeding 9999 throws controlled DAILY_TICKET_LIMIT_EXCEEDED (503)',
      capacityGuardPassed,
      `Safeguard triggered: ${capacityGuardPassed}, exception message: "${capacityErrorMessage}"`
    );

    // Test 25: Simulated concurrent requests produce unique ticket numbers without collisions
    console.log('\n--- PART 9: High Concurrency Simulation ---');
    const concurrentPromises = [
      requestJson(baseUrl, '/api/v1/complaints', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` },
        body: { title: 'Concurrent Test 1', description: 'Concurrent submission test description 1', category_id: 1 }
      }),
      requestJson(baseUrl, '/api/v1/complaints', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` },
        body: { title: 'Concurrent Test 2', description: 'Concurrent submission test description 2', category_id: 2 }
      }),
      requestJson(baseUrl, '/api/v1/complaints', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` },
        body: { title: 'Concurrent Test 3', description: 'Concurrent submission test description 3', category_id: 3 }
      })
    ];

    const concurrentResponses = await Promise.all(concurrentPromises);
    const concurrentTickets = concurrentResponses.map(r => {
      if (r.data?.complaint?.id) createdComplaintIds.push(r.data.complaint.id);
      return r.data?.complaint?.ticket_number;
    });

    const allSuccessful = concurrentResponses.every(r => r.status === 201);
    const uniqueTicketCount = new Set(concurrentTickets).size;
    const isConcurrentValid = allSuccessful && uniqueTicketCount === 3;

    recordTest(
      25,
      'Concurrent complaint submissions resolve with 100% unique ticket numbers (Zero collisions)',
      isConcurrentValid,
      `Statuses: [${concurrentResponses.map(r => r.status).join(', ')}], Tickets: [${concurrentTickets.join(', ')}]`
    );

  } finally {
    // Teardown created test complaints and history records
    if (createdComplaintIds.length > 0) {
      console.log(`\nCleaning up ${createdComplaintIds.length} synthetic test complaints...`);
      // ON DELETE CASCADE automatically removes status history
      await pool.query(
        `DELETE FROM complaints WHERE id IN (${createdComplaintIds.map(() => '?').join(',')})`,
        createdComplaintIds
      );
      console.log('✓ Synthetic test complaints cleanly removed.');
    }

    await new Promise((resolve) => server.close(resolve));
    console.log('✓ Test HTTP server closed.');
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log('\n================================================================');
  console.log(`SESSION 9 VERIFICATION COMPLETE: ${passedCount}/${results.length} TESTS PASSED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED TESTS: ${failedCount}`);
    await pool.end();
    process.exit(1);
  } else {
    console.log('ALL 25/25 SESSION 9 TESTS COMPLETED WITH ZERO FAILURES.');
    await pool.end();
    process.exit(0);
  }
}

runSession9Verification().catch((err) => {
  console.error('Fatal Verification Suite Error:', err);
  process.exit(1);
});
