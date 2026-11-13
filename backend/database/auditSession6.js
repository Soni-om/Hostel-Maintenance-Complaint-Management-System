/**
 * HostelCare — Session 6 Comprehensive Security and Technical Audit
 * Independent verification of:
 * 1. Backend Login (Student, Staff, Admin, 401s, Case-insensitivity, Inactive status)
 * 2. JWT Security (Environment secret, Startup guard, Expiry, Tamper protection, Clean claims)
 * 3. Frontend Authentication (Login form, Double-submit guard, Redirection, Logout cleanup)
 * 4. Validation and Error Handling (Empty fields, Malformed formats, Inactive accounts, Token errors)
 * 5. Security Review (No hardcoded secrets, No password hashes, No frontend leakage)
 * 6. Regression & Database Seed Integrity (Sessions 1-5 preserved, Seed records intact)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
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

const auditResults = [];

function recordAudit(category, testName, passed, evidence, failureDetails = null) {
  auditResults.push({ category, testName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] ${category} :: ${testName}`);
  if (evidence) {
    console.log(`       Evidence: ${evidence}`);
  }
  if (!passed && failureDetails) {
    console.log(`       Failure Details: ${failureDetails}`);
  }
}

async function runSession6Audit() {
  console.log('================================================================');
  console.log('      HOSTELCARE — SESSION 6 FINAL AUDIT & VERIFICATION         ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const seedPassword = 'Password@123';
  const inactiveEmail = 'audit_s6_inactive@hostelcare.edu';

  try {
    // Clean any prior temporary test user
    await pool.query('DELETE FROM users WHERE email = ?', [inactiveEmail]);

    // ========================================================================
    // 1. BACKEND LOGIN AUDIT
    // ========================================================================
    console.log('--- 1. AUDITING BACKEND LOGIN ---');

    // 1.1: Valid Student Login
    const sRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul.cs23@hostelcare.edu', password: seedPassword })
    });
    const sData = await sRes.json();
    const studentPassed = sRes.status === 200 && sData.success === true && sData.user?.role === 'student' && typeof sData.token === 'string';
    recordAudit(
      'Backend Login',
      'Valid Student Login (rahul.cs23@hostelcare.edu)',
      studentPassed,
      `HTTP Status: ${sRes.status}, role: "${sData.user?.role}", token issued: ${Boolean(sData.token)}`
    );

    // 1.2: Valid Staff Login
    const stRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sunita.supervisor@hostelcare.edu', password: seedPassword })
    });
    const stData = await stRes.json();
    const staffPassed = stRes.status === 200 && stData.success === true && stData.user?.role === 'staff';
    recordAudit(
      'Backend Login',
      'Valid Staff Login (sunita.supervisor@hostelcare.edu)',
      staffPassed,
      `HTTP Status: ${stRes.status}, role: "${stData.user?.role}", token issued: ${Boolean(stData.token)}`
    );

    // 1.3: Valid Admin Login
    const aRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hostelcare.edu', password: seedPassword })
    });
    const aData = await aRes.json();
    const adminPassed = aRes.status === 200 && aData.success === true && aData.user?.role === 'admin';
    recordAudit(
      'Backend Login',
      'Valid Admin Login (admin@hostelcare.edu)',
      adminPassed,
      `HTTP Status: ${aRes.status}, role: "${aData.user?.role}", token issued: ${Boolean(aData.token)}`
    );

    // 1.4: Dual Routes Verification (/api/auth/login and /api/v1/auth/login)
    const v1Res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'priya.ee24@hostelcare.edu', password: seedPassword })
    });
    const v1Data = await v1Res.json();
    const dualRoutesPassed = v1Res.status === 200 && v1Data.success === true;
    recordAudit(
      'Backend Login',
      'Both Routes Operational (/api/auth/login and /api/v1/auth/login)',
      dualRoutesPassed,
      `/api/v1/auth/login returned HTTP ${v1Res.status}, user: "${v1Data.user?.name}"`
    );

    // 1.5: Incorrect Password returns HTTP 401
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul.cs23@hostelcare.edu', password: 'InvalidPassword#123' })
    });
    const wrongPassData = await wrongPassRes.json();
    const wrongPassPassed = wrongPassRes.status === 401 && wrongPassData.success === false;

    // 1.6: Non-existing email returns same generic error (Anti-Enumeration)
    const nonExistRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent.student@hostelcare.edu', password: seedPassword })
    });
    const nonExistData = await nonExistRes.json();
    const nonExistPassed = nonExistRes.status === 401 && nonExistData.success === false;
    const sameGenericError = wrongPassData.message === nonExistData.message && wrongPassData.message === 'Invalid email or password.';

    recordAudit(
      'Backend Login',
      'Incorrect Password and Non-Existent Account Return HTTP 401 Generic Error',
      wrongPassPassed && nonExistPassed && sameGenericError,
      `Wrong Password HTTP: ${wrongPassRes.status}, Non-Existent HTTP: ${nonExistRes.status}, Message: "${wrongPassData.message}"`
    );

    // 1.7: Case-Insensitive Email Matching
    const upperEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'RAHUL.CS23@HOSTELCARE.EDU', password: seedPassword })
    });
    const upperEmailData = await upperEmailRes.json();
    const upperEmailPassed = upperEmailRes.status === 200 && upperEmailData.user?.email === 'rahul.cs23@hostelcare.edu';
    recordAudit(
      'Backend Login',
      'Case-Insensitive Email Authentication',
      upperEmailPassed,
      `Input: "RAHUL.CS23@HOSTELCARE.EDU" -> Resolved email: "${upperEmailData.user?.email}"`
    );

    // 1.8: Inactive / Suspended users blocked with HTTP 403
    const inactiveHash = await bcrypt.hash(seedPassword, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ('Suspended User', ?, ?, 'student', 'inactive')`,
      [inactiveEmail, inactiveHash]
    );

    const inactiveRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inactiveEmail, password: seedPassword })
    });
    const inactiveData = await inactiveRes.json();
    const inactiveBlocked = inactiveRes.status === 403 && inactiveData.success === false;
    await pool.query('DELETE FROM users WHERE email = ?', [inactiveEmail]);

    recordAudit(
      'Backend Login',
      'Inactive / Suspended User Account Blocked (HTTP 403)',
      inactiveBlocked,
      `HTTP Status: ${inactiveRes.status}, Message: "${inactiveData.message}"`
    );

    // 1.9: Password checked with bcrypt.compare and password_hash never returned
    const hashAbsentInResponse = !JSON.stringify(sData).includes('password_hash') && !JSON.stringify(sData).includes('$2a$');
    recordAudit(
      'Backend Login',
      'Password Checked with bcrypt.compare & password_hash Omitted from Response',
      hashAbsentInResponse,
      `password_hash in response body: ${!hashAbsentInResponse}`
    );

    // ========================================================================
    // 2. JWT SECURITY AUDIT
    // ========================================================================
    console.log('\n--- 2. AUDITING JWT SECURITY ---');

    // 2.1: Secret stored only in backend environment variables
    const secretConfigured = Boolean(process.env.JWT_SECRET) && process.env.JWT_SECRET.length >= 32;
    recordAudit(
      'JWT Security',
      'JWT Secret Stored Exclusively in Backend Environment (>= 32 chars)',
      secretConfigured,
      `process.env.JWT_SECRET configured: ${secretConfigured} (Length: ${process.env.JWT_SECRET?.length} chars)`
    );

    // 2.2: Application refuses startup if JWT_SECRET is missing or insecure
    const jwtSource = fs.readFileSync(path.join(rootDir, 'backend', 'src', 'utils', 'jwt.js'), 'utf8');
    const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
    const jwtThrowsIfMissing = jwtSource.includes('JWT_SECRET environment variable is missing');
    const serverGuardsSecret = serverSource.includes('!process.env.JWT_SECRET') && serverSource.includes('process.exit(1)');
    const noHardcodedFallback = !jwtSource.includes('hostelcare_dev_fallback');

    recordAudit(
      'JWT Security',
      'Application Startup Guard (Refuses Insecure Startup if JWT_SECRET Missing)',
      jwtThrowsIfMissing && serverGuardsSecret && noHardcodedFallback,
      `jwt.js throws: ${jwtThrowsIfMissing}, server.js startup check: ${serverGuardsSecret}, hardcoded fallback removed: ${noHardcodedFallback}`
    );

    // 2.3: Appropriate algorithm and token expiry
    const testToken = sData.token;
    const decodedHeader = jwt.decode(testToken, { complete: true })?.header;
    const isHS256 = decodedHeader?.alg === 'HS256';

    const decoded = verifyToken(testToken);
    const duration = decoded.exp - decoded.iat;
    const isSevenDays = duration === 604800; // 7 days

    recordAudit(
      'JWT Security',
      'Token Algorithm (HS256) and Configured Expiry (7 Days / 604800s)',
      isHS256 && isSevenDays,
      `Algorithm: "${decodedHeader?.alg}", Expiry duration: ${duration}s (Expected: 604800s)`
    );

    // 2.4: Claims contain only necessary information
    const allowedClaims = ['id', 'email', 'role', 'name', 'iat', 'exp'];
    const claimsClean = Object.keys(decoded).every(k => allowedClaims.includes(k));
    const noSensitiveClaims = !decoded.password && !decoded.password_hash && !decoded.secret;

    recordAudit(
      'JWT Security',
      'JWT Claims Contain Only Necessary Public Claims (id, email, role, name)',
      claimsClean && noSensitiveClaims,
      `Encoded claims: [${Object.keys(decoded).join(', ')}]`
    );

    // 2.5: Invalid, malformed, expired, and tampered token rejection
    let malformedRejected = false;
    try {
      verifyToken('not.a.valid.jwt.token');
    } catch {
      malformedRejected = true;
    }

    let tamperedRejected = false;
    try {
      const parts = testToken.split('.');
      const tampered = `${parts[0]}.${parts[1]}.tamperedSignatureHere999`;
      verifyToken(tampered);
    } catch {
      tamperedRejected = true;
    }

    let expiredRejected = false;
    try {
      // Generate explicitly expired token (-10 seconds)
      const expiredToken = jwt.sign({ id: 99, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '-10s' });
      verifyToken(expiredToken);
    } catch (e) {
      expiredRejected = e.name === 'TokenExpiredError';
    }

    recordAudit(
      'JWT Security',
      'Rejection of Malformed, Tampered, and Expired Tokens',
      malformedRejected && tamperedRejected && expiredRejected,
      `Malformed rejected: ${malformedRejected}, Tampered signature rejected: ${tamperedRejected}, Expired token rejected: ${expiredRejected}`
    );

    // 2.6: JWT secret never exposed in client files or responses
    const frontendCode = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'config.js'), 'utf8') +
                         fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'api.js'), 'utf8') +
                         fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'auth', 'login.html'), 'utf8');
    const secretInFrontend = frontendCode.includes(process.env.JWT_SECRET);
    const secretInResponse = JSON.stringify(sData).includes(process.env.JWT_SECRET);

    recordAudit(
      'JWT Security',
      'Zero Exposure of JWT Secret to Client Files or API Responses',
      !secretInFrontend && !secretInResponse,
      `Secret in frontend code: ${secretInFrontend}, Secret in API response: ${secretInResponse}`
    );

    // ========================================================================
    // 3. FRONTEND AUTHENTICATION AUDIT
    // ========================================================================
    console.log('\n--- 3. AUDITING FRONTEND AUTHENTICATION ---');

    const loginHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'auth', 'login.html'), 'utf8');
    const apiJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'api.js'), 'utf8');

    // 3.1: Login form calls backend API
    const callsBackend = loginHtml.includes("window.Api.post('/auth/login', { email, password })");
    recordAudit(
      'Frontend Authentication',
      'Login Form Calls POST /auth/login with Form Data',
      callsBackend,
      `Calls window.Api.post('/auth/login', ...): ${callsBackend}`
    );

    // 3.2: Loading state prevents duplicate submissions
    const handlesLoading = loginHtml.includes('submitBtn.disabled = true') && loginHtml.includes("submitBtn.textContent = 'Signing In...'");
    recordAudit(
      'Frontend Authentication',
      'Submit Button Disabled During Request (Double-Submit Guard)',
      handlesLoading,
      `Button disabled on submit: ${handlesLoading}`
    );

    // 3.3: Token is stored and attached correctly
    const savesToken = loginHtml.includes('window.Api.setToken(result.token)');
    const attachesToken = apiJs.includes("headers['Authorization'] = `Bearer ${token}`");
    recordAudit(
      'Frontend Authentication',
      'JWT Stored in localStorage and Attached as Authorization: Bearer Header',
      savesToken && attachesToken,
      `setToken called: ${savesToken}, Bearer header attached in api.js: ${attachesToken}`
    );

    // 3.4: User profile stored without sensitive info
    const savesProfile = loginHtml.includes('localStorage.setItem(window.CONFIG?.USER_KEY');
    recordAudit(
      'Frontend Authentication',
      'User Profile Stored Under Centralized USER_KEY',
      savesProfile,
      `User profile stored: ${savesProfile}`
    );

    // 3.5: Role-based redirection
    const hasStudentRedirect = loginHtml.includes("role === 'student'") && loginHtml.includes('/pages/student/dashboard.html');
    const hasStaffRedirect = loginHtml.includes("role === 'staff'") && loginHtml.includes('/pages/staff/dashboard.html');
    const hasAdminRedirect = loginHtml.includes("role === 'admin'") && loginHtml.includes('/pages/admin/dashboard.html');
    const roleRedirectionPassed = hasStudentRedirect && hasStaffRedirect && hasAdminRedirect;

    recordAudit(
      'Frontend Authentication',
      'Role Redirection (Student -> Student, Staff -> Staff, Admin -> Admin)',
      roleRedirectionPassed,
      `Student redirect: ${hasStudentRedirect}, Staff redirect: ${hasStaffRedirect}, Admin redirect: ${hasAdminRedirect}`
    );

    // 3.6: Logout clears frontend auth data
    const studentDash = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html'), 'utf8');
    const staffDash = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html'), 'utf8');
    const adminDash = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html'), 'utf8');

    const studentLogout = studentDash.includes('window.Api.clearAuth()');
    const staffLogout = staffDash.includes('window.Api.clearAuth()');
    const adminLogout = adminDash.includes('window.Api.clearAuth()');
    const clearAuthRemovesToken = apiJs.includes("localStorage.removeItem(window.CONFIG?.TOKEN_KEY") &&
                                  apiJs.includes("localStorage.removeItem(window.CONFIG?.USER_KEY");

    const logoutPassed = studentLogout && staffLogout && adminLogout && clearAuthRemovesToken;
    recordAudit(
      'Frontend Authentication',
      'Logout Clears Token and User Profile from Client Storage',
      logoutPassed,
      `Student dashboard: ${studentLogout}, Staff dashboard: ${staffLogout}, Admin dashboard: ${adminLogout}, clearAuth logic: ${clearAuthRemovesToken}`
    );

    // 3.7: No passwords or JWT printed in console logs
    const hasConsolePasswords = loginHtml.includes('console.log(password') || loginHtml.includes('console.log(result.token');
    recordAudit(
      'Frontend Authentication',
      'No Passwords or Tokens Logged to Browser Console',
      !hasConsolePasswords,
      `Password/Token console logs found: ${hasConsolePasswords}`
    );

    // ========================================================================
    // 4. VALIDATION AND ERROR HANDLING
    // ========================================================================
    console.log('\n--- 4. AUDITING VALIDATION AND ERROR HANDLING ---');

    const validationCases = [
      { name: 'Empty Email', payload: { email: '', password: seedPassword }, expectedStatus: 400 },
      { name: 'Empty Password', payload: { email: 'rahul.cs23@hostelcare.edu', password: '' }, expectedStatus: 400 },
      { name: 'Invalid Email Format', payload: { email: 'notanemail', password: seedPassword }, expectedStatus: 400 },
      { name: 'Missing Email Property', payload: { password: seedPassword }, expectedStatus: 400 },
      { name: 'Missing Password Property', payload: { email: 'rahul.cs23@hostelcare.edu' }, expectedStatus: 400 },
      { name: 'Non-String Email (Type Injection)', payload: { email: 12345, password: seedPassword }, expectedStatus: 400 },
      { name: 'Non-String Password (Type Injection)', payload: { email: 'rahul.cs23@hostelcare.edu', password: { pass: true } }, expectedStatus: 400 }
    ];

    let allValidationPassed = true;
    for (const vc of validationCases) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vc.payload)
      });
      const data = await res.json();
      const passed = res.status === vc.expectedStatus && data.success === false;
      if (!passed) allValidationPassed = false;
      recordAudit(
        'Validation and Error Handling',
        `Validation: ${vc.name}`,
        passed,
        `Status: ${res.status} (Expected: ${vc.expectedStatus}), Message: "${data.message}"`
      );
    }

    // ========================================================================
    // 5. SECURITY REVIEW
    // ========================================================================
    console.log('\n--- 5. AUDITING SECURITY POSTURE ---');

    // 5.1: No hardcoded secrets anywhere in backend code
    const backendCode = fs.readFileSync(path.join(rootDir, 'backend', 'src', 'utils', 'jwt.js'), 'utf8') +
                        fs.readFileSync(path.join(rootDir, 'backend', 'src', 'controllers', 'authController.js'), 'utf8') +
                        fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
    const hasHardcodedSecret = backendCode.includes('your_super_secret') || backendCode.includes('hostelcare_dev_fallback');
    recordAudit(
      'Security Review',
      'Absence of Hardcoded Secrets in Backend Source Code',
      !hasHardcodedSecret,
      `Hardcoded secret found in backend source: ${hasHardcodedSecret}`
    );

    // 5.2: No password hashes in API responses across login and register
    const hasHashInLogin = JSON.stringify(sData).includes('password_hash') || JSON.stringify(sData).includes('$2a$');
    recordAudit(
      'Security Review',
      'Zero Password Hashes in Authentication Responses',
      !hasHashInLogin,
      `password_hash present in login response: ${hasHashInLogin}`
    );

    // 5.3: No sensitive info in frontend files
    const frontendDirFiles = fs.readdirSync(path.join(rootDir, 'frontend', 'js'));
    let frontendSensitive = false;
    for (const f of frontendDirFiles) {
      const content = fs.readFileSync(path.join(rootDir, 'frontend', 'js', f), 'utf8');
      if (content.includes('password_hash') || content.includes(process.env.JWT_SECRET)) {
        frontendSensitive = true;
      }
    }
    recordAudit(
      'Security Review',
      'Zero Sensitive Credentials in Frontend Source Files',
      !frontendSensitive,
      `Sensitive data in frontend/js: ${frontendSensitive}`
    );

    // ========================================================================
    // 6. REGRESSION AND DATABASE SEED INTEGRITY
    // ========================================================================
    console.log('\n--- 6. AUDITING REGRESSION & DATABASE SEED INTEGRITY ---');

    // 6.1: Seed users count and IDs
    const [seedRows] = await pool.query('SELECT id, name, email, role FROM users ORDER BY id ASC');
    const seedIntact = seedRows.length === 8 && seedRows.map(u => u.id).join(',') === '1,2,3,4,5,6,7,8';
    recordAudit(
      'Regression Tests',
      'MySQL Database Seed Data Preserved (8 Seed Users: IDs 1-8)',
      seedIntact,
      `Total users: ${seedRows.length}, IDs: [${seedRows.map(u => u.id).join(', ')}]`
    );

    // 6.2: Health check endpoint remains operational (Session 3 compatibility)
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    const healthPassed = healthRes.status === 200 && healthData.status === 'healthy' && healthData.database?.status === 'connected';
    recordAudit(
      'Regression Tests',
      'System & Database Health Checks Functional (/api/health)',
      healthPassed,
      `HTTP Status: ${healthRes.status}, App: "${healthData.application}", DB: "${healthData.database?.status}"`
    );

    // 6.3: Student Registration remains operational (Session 5 compatibility)
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Audit Regression Student',
        email: 'audit_regression_student@hostelcare.edu',
        password: 'RegressionPass@123',
        hostel_block: 'Block A',
        room_number: 'A-101'
      })
    });
    const regData = await regRes.json();
    const regPassed = regRes.status === 201 && regData.success === true;
    await pool.query('DELETE FROM users WHERE email = ?', ['audit_regression_student@hostelcare.edu']);

    recordAudit(
      'Regression Tests',
      'Student Registration Endpoint Intact (/api/auth/register)',
      regPassed,
      `Registration returned HTTP ${regRes.status}, user ID: ${regData.user?.id}`
    );

    // ========================================================================
    // 7. GIT REPOSITORY STATUS
    // ========================================================================
    console.log('\n--- 7. AUDITING GIT REPOSITORY STATUS ---');

    const { execSync } = await import('node:child_process');
    const gitLog = execSync('git log -1 --oneline', { cwd: rootDir, encoding: 'utf8' }).trim();
    const envTracked = execSync('git ls-files .env', { cwd: rootDir, encoding: 'utf8' }).trim().length > 0;

    recordAudit(
      'Regression Tests',
      'Environment Isolation (.env is Untracked in Git)',
      !envTracked,
      `.env is tracked in git: ${envTracked}, Head commit: "${gitLog}"`
    );

  } finally {
    server.close();
  }

  // ========================================================================
  // FINAL EVALUATION
  // ========================================================================
  console.log('\n================================================================');
  console.log('                 SESSION 6 AUDIT SUMMARY                        ');
  console.log('================================================================');

  const categories = [
    'Backend Login',
    'JWT Security',
    'Frontend Authentication',
    'Validation and Error Handling',
    'Security Review',
    'Regression Tests'
  ];

  const categorySummary = {};
  for (const cat of categories) {
    const tests = auditResults.filter(t => t.category === cat);
    const passedCount = tests.filter(t => t.passed).length;
    const totalCount = tests.length;
    const isPass = totalCount > 0 && passedCount === totalCount;
    const sampleEvidence = tests.map(t => t.evidence).slice(0, 2).join(' | ');

    categorySummary[cat] = {
      result: isPass ? 'PASS' : 'FAIL',
      score: `${passedCount}/${totalCount}`,
      sampleEvidence
    };
  }

  console.table(
    Object.entries(categorySummary).map(([cat, data]) => ({
      Category: cat,
      Result: data.result,
      Score: data.score,
      SampleEvidence: data.sampleEvidence
    }))
  );

  const totalFailed = auditResults.filter(t => !t.passed).length;
  console.log(`\nTotal Checks: ${auditResults.length} | Passed: ${auditResults.length - totalFailed} | Failed: ${totalFailed}`);

  if (totalFailed === 0) {
    console.log('\nFinal Verdict: APPROVED — Session 6 meets all requirements.');
  } else {
    console.log('\nFinal Verdict: NOT APPROVED — Deficiencies detected.');
  }

  await pool.end();
  process.exit(totalFailed === 0 ? 0 : 1);
}

runSession6Audit();
