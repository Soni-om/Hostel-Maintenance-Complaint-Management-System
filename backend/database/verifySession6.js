/**
 * HostelCare — Session 6 Automated Verification Suite
 * Validates Login API, Password Verification (bcrypt.compare), Account Status Checks,
 * Time-Limited JWT Generation, Role-Based Redirection, and Frontend Integration.
 */

import http from 'node:http';
import fs from 'node:fs';
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
const { generateToken, verifyToken } = await import('../src/utils/jwt.js');

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

async function runSession6Verification() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 6 LIVE VERIFICATION SUITE           ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const seedPassword = 'Password@123';
  const inactiveEmail = 'inactive.test_s6@hostelcare.edu';

  try {
    // Clean any prior temporary test user
    await pool.query('DELETE FROM users WHERE email = ?', [inactiveEmail]);

    // ------------------------------------------------------------------------
    // Task 1: Implement POST /api/auth/login & /api/v1/auth/login
    // ------------------------------------------------------------------------
    console.log('--- TASK 1: LOGIN API ENDPOINTS (/api/auth/login & /api/v1/auth/login) ---');

    // 1a. Student login via /api/auth/login
    const studentLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul.cs23@hostelcare.edu', password: seedPassword })
    });
    const studentData = await studentLoginRes.json();
    const studentPassed = studentLoginRes.status === 200 &&
                          studentData.success === true &&
                          typeof studentData.token === 'string' &&
                          studentData.user?.role === 'student';

    recordTest(
      1,
      'POST /api/auth/login Student Login',
      studentPassed,
      `HTTP Status: ${studentLoginRes.status}, user: "${studentData.user?.name}", role: "${studentData.user?.role}", token present: ${Boolean(studentData.token)}`
    );

    // 1b. Staff login via /api/v1/auth/login alias
    const staffLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sunita.supervisor@hostelcare.edu', password: seedPassword })
    });
    const staffData = await staffLoginRes.json();
    const staffPassed = staffLoginRes.status === 200 &&
                        staffData.success === true &&
                        staffData.user?.role === 'staff';

    recordTest(
      1,
      'POST /api/v1/auth/login Staff Login (Route Alias)',
      staffPassed,
      `HTTP Status: ${staffLoginRes.status}, user: "${staffData.user?.name}", role: "${staffData.user?.role}"`
    );

    // 1c. Admin login
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hostelcare.edu', password: seedPassword })
    });
    const adminData = await adminLoginRes.json();
    const adminPassed = adminLoginRes.status === 200 && adminData.user?.role === 'admin';

    recordTest(
      1,
      'POST /api/auth/login Admin Login',
      adminPassed,
      `HTTP Status: ${adminLoginRes.status}, user: "${adminData.user?.name}", role: "${adminData.user?.role}"`
    );

    // ------------------------------------------------------------------------
    // Task 2: Verify passwords using bcrypt.compare
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 2: PASSWORD VERIFICATION (bcrypt.compare) ---');

    // 2a. Incorrect password for existing user
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul.cs23@hostelcare.edu', password: 'WrongPassword@999' })
    });
    const wrongPassData = await wrongPassRes.json();
    const wrongPassBlocked = wrongPassRes.status === 401 && wrongPassData.success === false;

    // 2b. Non-existent email
    const nonExistentRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody_exists@hostelcare.edu', password: seedPassword })
    });
    const nonExistentData = await nonExistentRes.json();
    const nonExistentBlocked = nonExistentRes.status === 401 && nonExistentData.success === false;

    // 2c. Anti-enumeration: verify both return identical message
    const messagesIdentical = wrongPassData.message === nonExistentData.message;

    // 2d. Case-insensitive email resolution
    const upperEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'RAHUL.CS23@HOSTELCARE.EDU', password: seedPassword })
    });
    const upperEmailPassed = upperEmailRes.status === 200;

    const task2Passed = wrongPassBlocked && nonExistentBlocked && messagesIdentical && upperEmailPassed;
    recordTest(
      2,
      'Password Verification with bcrypt.compare & 401 on Invalid Credentials',
      task2Passed,
      `Wrong Password (401: ${wrongPassBlocked}), Non-existent Email (401: ${nonExistentBlocked}), Generic Anti-Enumeration Message: "${wrongPassData.message}", Case-Insensitive: ${upperEmailPassed}`
    );

    // ------------------------------------------------------------------------
    // Task 3: Check account status
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 3: ACCOUNT STATUS ENFORCEMENT ---');

    // Insert temporary inactive user in MySQL
    const testHash = await bcrypt.hash(seedPassword, 10);
    const [insertResult] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ('Suspended Student', ?, ?, 'student', 'inactive')`,
      [inactiveEmail, testHash]
    );

    const inactiveLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inactiveEmail, password: seedPassword })
    });
    const inactiveData = await inactiveLoginRes.json();
    const inactiveBlocked = inactiveLoginRes.status === 403 &&
                            inactiveData.success === false &&
                            inactiveData.message.toLowerCase().includes('inactive');

    // Clean up temporary inactive user
    await pool.query('DELETE FROM users WHERE email = ?', [inactiveEmail]);

    recordTest(
      3,
      'Account Status Check (Inactive Account Rejected with HTTP 403)',
      inactiveBlocked,
      `HTTP Status: ${inactiveLoginRes.status}, Error Message: "${inactiveData.message}"`
    );

    // ------------------------------------------------------------------------
    // Task 4: Generate time-limited JWT tokens
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 4: TIME-LIMITED JWT TOKEN GENERATION ---');

    const token = studentData.token;
    let decoded = null;
    let tokenVerified = false;
    try {
      decoded = verifyToken(token);
      tokenVerified = true;
    } catch {
      tokenVerified = false;
    }

    const hasClaims = decoded && decoded.id === 5 &&
                      decoded.email === 'rahul.cs23@hostelcare.edu' &&
                      decoded.role === 'student' &&
                      decoded.name === 'Rahul Sharma';

    const hasExpiration = typeof decoded?.exp === 'number' && typeof decoded?.iat === 'number';
    const durationSeconds = decoded ? decoded.exp - decoded.iat : 0;
    // 7 days = 604800 seconds
    const isSevenDays = durationSeconds === 604800;

    const task4Passed = tokenVerified && hasClaims && hasExpiration && isSevenDays;
    recordTest(
      4,
      'Time-Limited JWT Token Generation (HMAC-SHA256, 7-Day Expiry)',
      task4Passed,
      `Verified: ${tokenVerified}, Claims: { id: ${decoded?.id}, role: "${decoded?.role}" }, Duration: ${durationSeconds}s (7 days)`
    );

    // ------------------------------------------------------------------------
    // Task 5: Store JWT secrets only in backend environment variables
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 5: JWT SECRET SECURITY & SAFE PROFILE RESPONSES ---');

    const envSecretConfigured = Boolean(process.env.JWT_SECRET);
    const responseHasPasswordHash = JSON.stringify(studentData).includes('$2a$') || JSON.stringify(studentData).includes('password_hash');
    const responseHasPassword = JSON.stringify(studentData).includes(seedPassword);
    const responseHasJwtSecret = JSON.stringify(studentData).includes(process.env.JWT_SECRET);

    // Also inspect frontend files to ensure JWT_SECRET is never mentioned in client-side code
    const frontendCode = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'config.js'), 'utf8') +
                         fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'api.js'), 'utf8');
    const clientExposesSecret = frontendCode.includes(process.env.JWT_SECRET);

    const task5Passed = envSecretConfigured && !responseHasPasswordHash && !responseHasPassword && !responseHasJwtSecret && !clientExposesSecret;
    recordTest(
      5,
      'JWT Secret Stored Strictly in Backend Environment (.env)',
      task5Passed,
      `Backend secret loaded: ${envSecretConfigured}, Leaked in API response: ${responseHasJwtSecret}, Leaked in frontend code: ${clientExposesSecret}, password_hash in response: ${responseHasPasswordHash}`
    );

    // ------------------------------------------------------------------------
    // Task 6 & 7: Connect Frontend Login Form & Notifications
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 6 & 7: FRONTEND LOGIN FORM & MESSAGING ---');

    const loginHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'auth', 'login.html'), 'utf8');

    const hasFormFields = loginHtml.includes('id="login-form"') &&
                          loginHtml.includes('id="email"') &&
                          loginHtml.includes('id="password"');

    const callsApiLogin = loginHtml.includes("window.Api.post('/auth/login',");
    const setsToken = loginHtml.includes("window.Api.setToken(result.token)");
    const setsUserStorage = loginHtml.includes("localStorage.setItem");
    const handlesDoubleSubmit = loginHtml.includes("submitBtn.disabled = true") && loginHtml.includes("submitBtn.textContent = 'Signing In...'");
    const showsToastSuccess = loginHtml.includes("Utils.showToast('Login successful!");
    const showsToastError = loginHtml.includes("Utils.showToast(errorMsg, 'danger')");

    const task6Passed = hasFormFields && callsApiLogin && setsToken && setsUserStorage && handlesDoubleSubmit;
    recordTest(
      6,
      'Frontend Login Form Connected to API & Token Storage',
      task6Passed,
      `Form fields: ${hasFormFields}, API call: ${callsApiLogin}, Set token: ${setsToken}, User storage: ${setsUserStorage}, Loading state: ${handlesDoubleSubmit}`
    );

    const task7Passed = showsToastSuccess && showsToastError;
    recordTest(
      7,
      'Frontend Login Success and Error Notifications (Toast)',
      task7Passed,
      `Success toast: ${showsToastSuccess}, Error toast: ${showsToastError}`
    );

    // ------------------------------------------------------------------------
    // Task 8: Redirect users according to their roles
    // ------------------------------------------------------------------------
    console.log('\n--- TASK 8: ROLE-BASED REDIRECTION ---');

    const redirectsStudent = loginHtml.includes("role === 'student'") && loginHtml.includes('/pages/student/dashboard.html');
    const redirectsStaff = loginHtml.includes("role === 'staff'") && loginHtml.includes('/pages/staff/dashboard.html');
    const redirectsAdmin = loginHtml.includes("role === 'admin'") && loginHtml.includes('/pages/admin/dashboard.html');

    const task8Passed = redirectsStudent && redirectsStaff && redirectsAdmin;
    recordTest(
      8,
      'Role-Based Redirection (Student, Staff, and Admin Portals)',
      task8Passed,
      `Student -> /pages/student/dashboard.html (${redirectsStudent}), Staff -> /pages/staff/dashboard.html (${redirectsStaff}), Admin -> /pages/admin/dashboard.html (${redirectsAdmin})`
    );

    // ------------------------------------------------------------------------
    // Additional: Input Validation for Login
    // ------------------------------------------------------------------------
    console.log('\n--- ADDITIONAL: LOGIN INPUT VALIDATION ---');

    const emptyEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: seedPassword })
    });
    const emptyEmailPassed = emptyEmailRes.status === 400;

    const emptyPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul.cs23@hostelcare.edu', password: '' })
    });
    const emptyPassPassed = emptyPassRes.status === 400;

    const badEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'notanemail', password: seedPassword })
    });
    const badEmailPassed = badEmailRes.status === 400;

    const validationPassed = emptyEmailPassed && emptyPassPassed && badEmailPassed;
    recordTest(
      1,
      'Login Input Validation (Empty Fields & Malformed Email Return HTTP 400)',
      validationPassed,
      `Empty Email (400: ${emptyEmailPassed}), Empty Password (400: ${emptyPassPassed}), Bad Email (400: ${badEmailPassed})`
    );

    // Clean up temporary user if any
    await pool.query('DELETE FROM users WHERE email = ?', [inactiveEmail]);

  } finally {
    server.close();
  }

  // ------------------------------------------------------------------------
  // Final Evaluation
  // ------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                 SESSION 6 VERIFICATION SUMMARY                 ');
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
    console.log('\nCHECKPOINT REACHED: Valid users can log in and receive JWT tokens with safe profile information. Invalid credentials return 401.');
  } else {
    console.log('\nCHECKPOINT FAILED: Some requirements were not satisfied.');
  }

  await pool.end();
  process.exit(totalFailed === 0 ? 0 : 1);
}

runSession6Verification();
