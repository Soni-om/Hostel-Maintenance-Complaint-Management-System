/**
 * HostelCare — Session 5 Automated Verification Suite
 * Verifies Student Registration API, Password Hashing with bcryptjs, Email Normalization,
 * Duplicate Prevention, RBAC Role Protection, and Response Sanitization.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables before importing app and db
dotenv.config({ path: path.join(rootDir, '.env') });

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/db.js');
const { default: UserModel } = await import('../src/models/userModel.js');

const results = [];

function recordTest(taskNum, taskName, passed, evidence, failureDetails = null) {
  results.push({ taskNum, taskName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] Task ${taskNum}: ${taskName}`);
  if (evidence) {
    console.log(`       Evidence: ${evidence}`);
  }
  if (!passed && failureDetails) {
    console.log(`       Failure Details: ${failureDetails}`);
  }
}

async function runSession5Verification() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 5 LIVE VERIFICATION SUITE           ');
  console.log('================================================================\n');

  // Spin up an ephemeral HTTP server for live REST API probing
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testEmailMixed = 'ANANYA.TEST_S5@HOSTELCARE.EDU';
  const testEmailLower = 'ananya.test_s5@hostelcare.edu';
  const testPassword = 'StudentSecret@2026';

  try {
    // Clean any leftover test user before starting
    await pool.query('DELETE FROM users WHERE email = ?', [testEmailLower]);

    // ------------------------------------------------------------------------
    // Task 1: Implement POST /api/auth/register & /api/v1/auth/register
    // ------------------------------------------------------------------------
    console.log('--- TASK 1 & 5: STUDENT REGISTRATION API & MYSQL INSERT ---');

    const regPayload = {
      name: 'Ananya Deshmukh',
      email: testEmailMixed,
      password: testPassword,
      phone: '+91 9876543210',
      hostel_block: 'Block A',
      room_number: 'A-201'
    };

    const regResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(regPayload)
    });

    const regStatus = regResponse.status;
    const regData = await regResponse.json();

    const task1Passed = regStatus === 201 && regData.success === true && regData.user?.id > 0;
    recordTest(
      1,
      'POST /api/auth/register Student Registration',
      task1Passed,
      `HTTP Status: ${regStatus}, success: ${regData.success}, user ID: ${regData.user?.id}`
    );

    // Also verify /api/v1/auth/register endpoint alias
    const v1Response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...regPayload, email: 'v1_alias_test@hostelcare.edu' })
    });
    const v1Status = v1Response.status;
    const v1Data = await v1Response.json();
    const v1Passed = v1Status === 201 && v1Data.success === true;
    await pool.query('DELETE FROM users WHERE email = ?', ['v1_alias_test@hostelcare.edu']);

    recordTest(
      1,
      'POST /api/v1/auth/register Route Compatibility',
      v1Passed,
      `HTTP Status: ${v1Status}, user ID: ${v1Data.user?.id}`
    );

    // ------------------------------------------------------------------------
    // Task 2: Validate name, email and password
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 2: INPUT VALIDATION (NAME, EMAIL, PASSWORD) ---');

    // 2a. Missing name
    const resNoName = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noname@hostel.edu', password: 'ValidPassword123' })
    });
    const dataNoName = await resNoName.json();
    const passedNoName = resNoName.status === 400 && dataNoName.success === false;

    // 2b. Invalid email
    const resBadEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Name', email: 'not-an-email', password: 'ValidPassword123' })
    });
    const dataBadEmail = await resBadEmail.json();
    const passedBadEmail = resBadEmail.status === 400 && dataBadEmail.success === false;

    // 2c. Short password (< 6 chars)
    const resShortPass = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Name', email: 'valid@hostel.edu', password: '123' })
    });
    const dataShortPass = await resShortPass.json();
    const passedShortPass = resShortPass.status === 400 && dataShortPass.success === false;

    const task2Passed = passedNoName && passedBadEmail && passedShortPass;
    recordTest(
      2,
      'Input Validation (Name, Email, Password < 6 chars)',
      task2Passed,
      `Missing Name (400: ${passedNoName}), Invalid Email (400: ${passedBadEmail}), Short Password (400: ${passedShortPass})`
    );

    // ------------------------------------------------------------------------
    // Task 3: Normalize email
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 3: EMAIL NORMALIZATION ---');

    // Check how email was saved in MySQL and returned in response
    const [dbUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [regData.user?.id]);
    const savedUser = dbUserRows[0];

    const emailSavedLower = savedUser?.email === testEmailLower;
    const emailReturnedLower = regData.user?.email === testEmailLower;
    const task3Passed = emailSavedLower && emailReturnedLower;

    recordTest(
      3,
      'Email Normalization (Case-Insensitive Lowercase)',
      task3Passed,
      `Input: "${testEmailMixed}" -> Stored in MySQL: "${savedUser?.email}" -> Returned: "${regData.user?.email}"`
    );

    // ------------------------------------------------------------------------
    // Task 4: Hash passwords using bcryptjs
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 4: PASSWORD HASHING WITH BCRYPTJS ---');

    const rawHash = savedUser?.password_hash;
    const isBcryptFormat = typeof rawHash === 'string' && (rawHash.startsWith('$2a$') || rawHash.startsWith('$2b$')) && rawHash.length === 60;
    const plainMatchesHash = await bcrypt.compare(testPassword, rawHash || '');
    const wrongPasswordFails = !(await bcrypt.compare('WrongPassword@999', rawHash || ''));

    const task4Passed = isBcryptFormat && plainMatchesHash && wrongPasswordFails;
    recordTest(
      4,
      'Password Hashing with bcryptjs (Salt Rounds 10)',
      task4Passed,
      `Bcrypt format: ${isBcryptFormat} (${rawHash?.substring(0, 15)}...), Correct pass match: ${plainMatchesHash}, Wrong pass rejected: ${wrongPasswordFails}`
    );

    // ------------------------------------------------------------------------
    // Task 5: Save users in MySQL
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 5: PERSISTENCE & BLOCK RELATIONSHIP ---');

    const task5Passed = savedUser !== undefined &&
                        savedUser.name === 'Ananya Deshmukh' &&
                        savedUser.role === 'student' &&
                        savedUser.account_status === 'active' &&
                        savedUser.room_number === 'A-201' &&
                        savedUser.hostel_block === 'Block A' &&
                        savedUser.block_id === 1;

    recordTest(
      5,
      'MySQL User Record Persistence & Block ID Linkage',
      task5Passed,
      `Name: "${savedUser?.name}", Role: "${savedUser?.role}", Block: "${savedUser?.hostel_block}" (block_id: ${savedUser?.block_id}), Room: "${savedUser?.room_number}"`
    );

    // ------------------------------------------------------------------------
    // Task 6: Prevent duplicate email registration
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 6: DUPLICATE EMAIL REJECTION ---');

    // Attempt to register again with same email in lowercase
    const dupResLower = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another User',
        email: testEmailLower,
        password: 'Password123'
      })
    });
    const dupDataLower = await dupResLower.json();
    const dupLowerRejected = dupResLower.status === 409 && dupDataLower.success === false;

    // Attempt to register again with same email in uppercase
    const dupResUpper = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another User Two',
        email: testEmailMixed,
        password: 'Password123'
      })
    });
    const dupDataUpper = await dupResUpper.json();
    const dupUpperRejected = dupResUpper.status === 409 && dupDataUpper.success === false;

    // Verify row count in DB hasn't increased
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE email = ?', [testEmailLower]);
    const singleRecordInDb = countRows[0].total === 1;

    const task6Passed = dupLowerRejected && dupUpperRejected && singleRecordInDb;
    recordTest(
      6,
      'Prevent Duplicate Email Registration (HTTP 409 Conflict)',
      task6Passed,
      `Exact duplicate HTTP: ${dupResLower.status}, Case-variant duplicate HTTP: ${dupResUpper.status}, Records in MySQL: ${countRows[0].total}`
    );

    // ------------------------------------------------------------------------
    // Task 7: Prevent public Staff/Admin registration
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 7: PREVENT PUBLIC STAFF/ADMIN REGISTRATION ---');

    // Attempt to register as admin
    const adminAttemptRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Malicious Admin Wannabe',
        email: 'attacker@hostelcare.edu',
        password: 'Password123',
        role: 'admin'
      })
    });
    const adminData = await adminAttemptRes.json();
    const adminRejected = adminAttemptRes.status === 403 && adminData.success === false;

    // Attempt to register as staff
    const staffAttemptRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Malicious Staff Wannabe',
        email: 'staff_attacker@hostelcare.edu',
        password: 'Password123',
        role: 'staff'
      })
    });
    const staffData = await staffAttemptRes.json();
    const staffRejected = staffAttemptRes.status === 403 && staffData.success === false;

    // Verify neither user was created in DB
    const [hackerRows] = await pool.query(
      "SELECT id FROM users WHERE email IN ('attacker@hostelcare.edu', 'staff_attacker@hostelcare.edu')"
    );
    const zeroHackersCreated = hackerRows.length === 0;

    const task7Passed = adminRejected && staffRejected && zeroHackersCreated;
    recordTest(
      7,
      'Prevent Public Staff/Admin Registration (HTTP 403 Forbidden)',
      task7Passed,
      `Admin attempt: HTTP ${adminAttemptRes.status} ("${adminData.message?.substring(0, 45)}..."), Staff attempt: HTTP ${staffAttemptRes.status}, Users created: ${hackerRows.length}`
    );

    // ------------------------------------------------------------------------
    // Task 8: Return safe user data without password_hash
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 8: SAFE USER DATA (NO PASSWORD LEAKAGE) ---');

    const userObj = regData.user;
    const hasPasswordHash = 'password_hash' in userObj;
    const hasPassword = 'password' in userObj;
    const jsonStringHasHash = JSON.stringify(regData).includes('$2a$') || JSON.stringify(regData).includes('$2b$');
    const jsonStringHasPlain = JSON.stringify(regData).includes(testPassword);
    const hasRequiredFields = userObj?.id > 0 &&
                              typeof userObj.name === 'string' &&
                              userObj.role === 'student' &&
                              userObj.account_status === 'active';

    const task8Passed = !hasPasswordHash && !hasPassword && !jsonStringHasHash && !jsonStringHasPlain && hasRequiredFields;
    recordTest(
      8,
      'Return Safe User Data Without password_hash',
      task8Passed,
      `password_hash in object: ${hasPasswordHash}, plain password in object: ${hasPassword}, hash in JSON payload: ${jsonStringHasHash}, role: "${userObj?.role}"`
    );

    // ------------------------------------------------------------------------
    // Clean up synthetic test user
    // ------------------------------------------------------------------------
    await pool.query('DELETE FROM users WHERE email = ?', [testEmailLower]);
    console.log('\nSynthetic test student cleaned up successfully.');

  } finally {
    server.close();
  }

  // ------------------------------------------------------------------------
  // Final Evaluation
  // ------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                 SESSION 5 VERIFICATION SUMMARY                 ');
  console.log('================================================================');

  console.table(
    results.map((r) => ({
      Task: `Task ${r.taskNum}`,
      Name: r.taskName,
      Status: r.passed ? 'PASS' : 'FAIL',
      Evidence: r.evidence
    }))
  );

  const totalFailed = results.filter((r) => !r.passed).length;
  console.log(`\nTotal Checks: ${results.length} | Passed: ${results.length - totalFailed} | Failed: ${totalFailed}`);

  if (totalFailed === 0) {
    console.log('\nCHECKPOINT REACHED: Student registration works, passwords are hashed and invalid or duplicate registrations are rejected.');
  } else {
    console.log('\nCHECKPOINT FAILED: Some requirements were not satisfied.');
  }

  await pool.end();
  process.exit(totalFailed === 0 ? 0 : 1);
}

runSession5Verification();
