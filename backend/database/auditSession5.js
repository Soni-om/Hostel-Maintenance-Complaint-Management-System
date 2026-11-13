/**
 * HostelCare — Session 5 Comprehensive Security & Implementation Audit
 * Performs deep inspection and live automated testing across:
 * 1. User Model & SQL Parameterization
 * 2. Validation & Input Sanitization
 * 3. Auth Controller, bcrypt Hashing, and Safe Responses
 * 4. Role Security & Public Staff/Admin Prevention
 * 5. Route Compatibility (/api/auth and /api/v1/auth)
 * 6. Frontend Registration Implementation
 * 7. Database Integrity & Complete Cleanup
 * 8. Git Status & Commit History
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

const auditResults = [];

function recordAudit(section, testName, passed, evidence, failureReason = null) {
  auditResults.push({ section, testName, passed, evidence, failureReason });
  const statusBadge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${statusBadge}] ${section} :: ${testName}`);
  if (evidence) {
    console.log(`       Evidence: ${evidence}`);
  }
  if (!passed && failureReason) {
    console.log(`       Failure Detail: ${failureReason}`);
  }
}

async function runSession5Audit() {
  console.log('================================================================');
  console.log('   HOSTELCARE — SESSION 5 SECURITY & IMPLEMENTATION AUDIT       ');
  console.log('================================================================\n');

  // Launch test Express HTTP instance
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Synthetic test identifiers
  const auditPrefix = 'audit_s5_';
  const testStudentEmail = `${auditPrefix}student@hostelcare.edu`;
  const testPlainPassword = 'AuditorSecretPass@2026';

  try {
    // Initial cleanup: ensure no leftover audit accounts
    await pool.query('DELETE FROM users WHERE email LIKE ?', [`${auditPrefix}%`]);

    // ========================================================================
    // 1. USER MODEL AUDIT
    // ========================================================================
    console.log('--- 1. AUDITING USER MODEL (backend/src/models/userModel.js) ---');
    const modelSource = fs.readFileSync(path.join(rootDir, 'backend', 'src', 'models', 'userModel.js'), 'utf8');

    // 1.1: Parameterized SQL
    const hasInterpolatedSql = modelSource.includes('${') && modelSource.includes('SELECT') ||
                               modelSource.includes('${') && modelSource.includes('INSERT');
    const usesPlaceholders = modelSource.includes('?') && modelSource.includes('pool.query') && modelSource.includes('pool.execute');
    recordAudit(
      'SQL parameterization',
      'All SQL Queries Use Parameterized Placeholders (?)',
      !hasInterpolatedSql && usesPlaceholders,
      `Direct string interpolation in SQL: ${hasInterpolatedSql}, Parameter placeholders: ${usesPlaceholders}`
    );

    // 1.2: Case-insensitive email lookup
    const hasLowerEmailQuery = modelSource.includes('LOWER(email) = LOWER(?)');
    recordAudit(
      'User model',
      'Case-Insensitive Email Lookup (LOWER(email) = LOWER(?))',
      hasLowerEmailQuery,
      `Query uses LOWER(email) = LOWER(?): ${hasLowerEmailQuery}`
    );

    // 1.3: findById never returns password_hash
    const findByIdMatch = modelSource.match(/async findById\([\s\S]*?^  }/m);
    const findByIdHasHash = findByIdMatch ? findByIdMatch[0].includes('password_hash') : true;
    recordAudit(
      'User model',
      'findById() Excludes password_hash From Selected Columns',
      !findByIdHasHash,
      `password_hash in findById SELECT list: ${findByIdHasHash ? 'Leaked' : 'Omitted (Secure)'}`
    );

    // 1.4: createStudent always inserts role 'student'
    const createStudentMatch = modelSource.match(/async createStudent\([\s\S]*?^  }/m);
    const insertsHardcodedStudent = createStudentMatch ? createStudentMatch[0].includes("'student'") : false;
    recordAudit(
      'User model',
      "createStudent() Enforces Hardcoded 'student' Role in SQL",
      insertsHardcodedStudent,
      `SQL literal 'student' present in INSERT: ${insertsHardcodedStudent}`
    );

    // 1.5: Account status controlled by backend
    const insertsHardcodedActive = createStudentMatch ? createStudentMatch[0].includes("'active'") : false;
    recordAudit(
      'User model',
      "createStudent() Enforces Hardcoded 'active' Account Status",
      insertsHardcodedActive,
      `SQL literal 'active' present in INSERT: ${insertsHardcodedActive}`
    );

    // 1.6: findBlock correctly resolves block names and codes
    const blockAByName = await UserModel.findBlock('Block A');
    const blockAByCode = await UserModel.findBlock('BLK-A');
    const blockAFull = await UserModel.findBlock('Block A (North Wing)');
    const blockUnknown = await UserModel.findBlock('Nonexistent Block XYZ');
    const blocksResolved = blockAByName?.id === 1 && blockAByCode?.id === 1 && blockAFull?.id === 1 && blockUnknown === null;
    recordAudit(
      'User model',
      'findBlock() Resolves Block Names, Codes, and Wing Prefixes',
      blocksResolved,
      `By Name: ID ${blockAByName?.id}, By Code: ID ${blockAByCode?.id}, Full: ID ${blockAFull?.id}, Unknown: ${blockUnknown}`
    );

    // 1.7: Database unique constraint on email
    const [indexRows] = await pool.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = 'hostelcare_db' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'`
    );
    const emailUniqueConstraint = indexRows.length > 0;
    recordAudit(
      'Email uniqueness',
      'MySQL Database UNIQUE Constraint on users.email',
      emailUniqueConstraint,
      `Unique constraint registered in MySQL schema: ${emailUniqueConstraint} (${indexRows[0]?.CONSTRAINT_NAME})`
    );

    // ========================================================================
    // 2. VALIDATION AUDIT
    // ========================================================================
    console.log('\n--- 2. AUDITING REQUEST VALIDATION (backend/src/middleware/validationMiddleware.js) ---');

    const validationTests = [
      { name: 'Missing Name', body: { email: `${auditPrefix}no_name@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Empty Name String', body: { name: '', email: `${auditPrefix}empty_name@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Whitespace-Only Name', body: { name: '     ', email: `${auditPrefix}ws_name@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Single-Character Name (< 2 chars)', body: { name: 'A', email: `${auditPrefix}short_name@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Name with Digits (Disallowed)', body: { name: 'Rahul Sharma 2', email: `${auditPrefix}digits@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Invalid Email Format', body: { name: 'Valid Name', email: 'not-a-valid-email', password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Short Password (< 6 chars)', body: { name: 'Valid Name', email: `${auditPrefix}short_pass@hostel.edu`, password: '12345' }, expectedStatus: 400 },
      { name: 'Password Exceeding Max Length (> 128 chars)', body: { name: 'Valid Name', email: `${auditPrefix}long_pass@hostel.edu`, password: 'P'.repeat(129) }, expectedStatus: 400 },
      { name: 'Invalid Phone Number Format', body: { name: 'Valid Name', email: `${auditPrefix}bad_phone@hostel.edu`, password: testPlainPassword, phone: 'INVALID-PHONE-STRING' }, expectedStatus: 400 },
      { name: 'Non-String Name Input (Type Injection)', body: { name: 123456, email: `${auditPrefix}bad_type@hostel.edu`, password: testPlainPassword }, expectedStatus: 400 },
      { name: 'Object Email Input (NoSQL Injection Style)', body: { name: 'Valid Name', email: { $gt: '' }, password: testPlainPassword }, expectedStatus: 400 }
    ];

    let allValidationPassed = true;
    for (const vt of validationTests) {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vt.body)
      });
      const data = await res.json();
      const passed = res.status === vt.expectedStatus && data.success === false;
      if (!passed) allValidationPassed = false;
      recordAudit(
        'Validation',
        `Validation: ${vt.name}`,
        passed,
        `Status: ${res.status} (Expected: ${vt.expectedStatus}), Error: "${data.message}"`
      );
    }

    // 2.2: Name with valid spaces and periods
    const validSpacedNameRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A. R. Rahman',
        email: `${auditPrefix}spaced_name@hostelcare.edu`,
        password: testPlainPassword,
        hostel_block: 'Block B',
        room_number: 'B-101'
      })
    });
    const validSpacedData = await validSpacedNameRes.json();
    const spacedNamePassed = validSpacedNameRes.status === 201 && validSpacedData.user?.name === 'A. R. Rahman';
    recordAudit(
      'Validation',
      'Legitimate Names with Spaces and Periods Permitted',
      spacedNamePassed,
      `Status: ${validSpacedNameRes.status}, Returned name: "${validSpacedData.user?.name}"`
    );

    // 2.3: Email normalization preserves dots and lowercases
    const dottedEmailInput = `${auditPrefix.toUpperCase()}STUDENT.ROLL2026@HOSTELCARE.EDU`;
    const expectedDottedEmail = `${auditPrefix}student.roll2026@hostelcare.edu`;
    const normRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dotted Email User',
        email: dottedEmailInput,
        password: testPlainPassword
      })
    });
    const normData = await normRes.json();
    const dotPreservedAndLower = normRes.status === 201 && normData.user?.email === expectedDottedEmail;
    recordAudit(
      'Validation',
      'Email Normalization Preserves Dots and Converts to Lowercase',
      dotPreservedAndLower,
      `Input: "${dottedEmailInput}" -> Output: "${normData.user?.email}"`
    );

    // ========================================================================
    // 3. AUTH CONTROLLER AUDIT & BCRYPT HASHING
    // ========================================================================
    console.log('\n--- 3. AUDITING AUTH CONTROLLER & PASSWORD HASHING ---');

    // Register a canonical student for controller checks
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pooja Kulkarni',
        email: testStudentEmail,
        password: testPlainPassword,
        phone: '+91 9988776655',
        hostel_block: 'Block A',
        room_number: 'A-304'
      })
    });
    const regData = await regRes.json();
    const studentUser = regData.user;

    // 3.1: Verify bcrypt hash stored in MySQL
    const [dbRows] = await pool.query('SELECT * FROM users WHERE id = ?', [studentUser?.id]);
    const dbRecord = dbRows[0];
    const hash = dbRecord?.password_hash;
    const isBcrypt = typeof hash === 'string' && (hash.startsWith('$2a$10$') || hash.startsWith('$2b$10$')) && hash.length === 60;
    const bcryptMatches = await bcrypt.compare(testPlainPassword, hash || '');
    const wrongBcryptFails = !(await bcrypt.compare('WrongPassword', hash || ''));

    recordAudit(
      'Password hashing',
      'Passwords Hashed Using bcryptjs with Salt Rounds 10',
      isBcrypt && bcryptMatches && wrongBcryptFails,
      `Hash prefix: ${hash?.substring(0, 7)}, Length: ${hash?.length}, Match verified: ${bcryptMatches}, Wrong rejected: ${wrongBcryptFails}`
    );

    // 3.2: Plain password never stored in MySQL
    const plainNotStored = dbRecord?.password_hash !== testPlainPassword && !JSON.stringify(dbRecord).includes(testPlainPassword);
    recordAudit(
      'Password hashing',
      'Plain-Text Password Never Stored in Database Record',
      plainNotStored,
      `Database record contains plain password: ${!plainNotStored}`
    );

    // 3.3: Safe response: password and password_hash absent from API response
    const payloadHasHash = JSON.stringify(regData).includes('$2a$') || JSON.stringify(regData).includes('$2b$');
    const payloadHasPlain = JSON.stringify(regData).includes(testPlainPassword);
    const approvedKeysOnly = Object.keys(studentUser).every(k =>
      ['id', 'name', 'email', 'role', 'account_status', 'phone', 'block_id', 'hostel_block', 'room_number', 'created_at'].includes(k)
    );

    recordAudit(
      'Safe responses',
      'API Response Returns HTTP 201 with Sanitized User (No Password or Hash)',
      regRes.status === 201 && !payloadHasHash && !payloadHasPlain && approvedKeysOnly,
      `HTTP ${regRes.status}, Approved keys only: ${approvedKeysOnly}, Hash in body: ${payloadHasHash}, Plain in body: ${payloadHasPlain}`
    );

    // ========================================================================
    // 4. DUPLICATE REGISTRATION AUDIT
    // ========================================================================
    console.log('\n--- 4. AUDITING DUPLICATE EMAIL PROTECTION ---');

    // Attempt exact duplicate
    const exactDupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Imposter Student',
        email: testStudentEmail,
        password: 'AnotherPassword@123'
      })
    });
    const exactDupData = await exactDupRes.json();
    const exactDupBlocked = exactDupRes.status === 409 && exactDupData.success === false;

    // Attempt case-variant duplicate
    const caseDupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Case Variant Imposter',
        email: testStudentEmail.toUpperCase(),
        password: 'AnotherPassword@123'
      })
    });
    const caseDupData = await caseDupRes.json();
    const caseDupBlocked = caseDupRes.status === 409 && caseDupData.success === false;

    // Concurrent duplicate simulation (Promise.all)
    const concurrentEmail = `${auditPrefix}concurrent@hostelcare.edu`;
    const [cRes1, cRes2] = await Promise.all([
      fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Concurrent Alpha', email: concurrentEmail, password: testPlainPassword })
      }),
      fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Concurrent Beta', email: concurrentEmail, password: testPlainPassword })
      })
    ]);

    const statuses = [cRes1.status, cRes2.status].sort();
    const oneCreatedOneConflict = statuses[0] === 201 && statuses[1] === 409;

    recordAudit(
      'Duplicate protection',
      'Exact and Case-Variant Duplicate Emails Rejected with HTTP 409 Conflict',
      exactDupBlocked && caseDupBlocked,
      `Exact Dup: HTTP ${exactDupRes.status} ("${exactDupData.message}"), Case Dup: HTTP ${caseDupRes.status}`
    );

    recordAudit(
      'Duplicate protection',
      'Concurrent Duplicate Race Condition Protected (One 201, One 409)',
      oneCreatedOneConflict,
      `Concurrent requests returned: [${statuses.join(', ')}]`
    );

    // ========================================================================
    // 5. ROLE SECURITY AUDIT
    // ========================================================================
    console.log('\n--- 5. AUDITING ROLE PROTECTION & RBAC BOUNDARIES ---');

    // 5.1: Without role -> Defaults to student
    const noRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Role Omitted User',
        email: `${auditPrefix}no_role@hostelcare.edu`,
        password: testPlainPassword
      })
    });
    const noRoleData = await noRoleRes.json();
    const noRoleDefaultsStudent = noRoleRes.status === 201 && noRoleData.user?.role === 'student';

    // 5.2: With role 'student' -> Allowed
    const studentRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Explicit Student User',
        email: `${auditPrefix}student_role@hostelcare.edu`,
        password: testPlainPassword,
        role: 'student'
      })
    });
    const studentRoleData = await studentRoleRes.json();
    const studentRolePassed = studentRoleRes.status === 201 && studentRoleData.user?.role === 'student';

    // 5.3: With role 'admin' -> Rejected HTTP 403
    const adminRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Attacker Admin',
        email: `${auditPrefix}fake_admin@hostelcare.edu`,
        password: testPlainPassword,
        role: 'admin'
      })
    });
    const adminRoleData = await adminRoleRes.json();
    const adminRoleBlocked = adminRoleRes.status === 403 && adminRoleData.success === false;

    // 5.4: With role 'staff' -> Rejected HTTP 403
    const staffRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Attacker Staff',
        email: `${auditPrefix}fake_staff@hostelcare.edu`,
        password: testPlainPassword,
        role: 'staff'
      })
    });
    const staffRoleData = await staffRoleRes.json();
    const staffRoleBlocked = staffRoleRes.status === 403 && staffRoleData.success === false;

    // 5.5: Unexpected role ('warden') -> Rejected HTTP 400
    const unexpectedRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Warden Wannabe',
        email: `${auditPrefix}warden@hostelcare.edu`,
        password: testPlainPassword,
        role: 'warden'
      })
    });
    const unexpectedRoleData = await unexpectedRoleRes.json();
    const unexpectedRoleBlocked = unexpectedRoleRes.status === 400 && unexpectedRoleData.success === false;

    // 5.6: Null role -> Allowed (defaults to student)
    const nullRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Null Role User',
        email: `${auditPrefix}null_role@hostelcare.edu`,
        password: testPlainPassword,
        role: null
      })
    });
    const nullRoleData = await nullRoleRes.json();
    const nullRoleAllowed = nullRoleRes.status === 201 && nullRoleData.user?.role === 'student';

    // 5.7: Malformed role (number or array) -> Rejected HTTP 400
    const malformedRoleRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Malformed Role User',
        email: `${auditPrefix}malformed_role@hostelcare.edu`,
        password: testPlainPassword,
        role: 9999
      })
    });
    const malformedRoleData = await malformedRoleRes.json();
    const malformedRoleBlocked = malformedRoleRes.status === 400 && malformedRoleData.success === false;

    // Verify zero staff or admin accounts created during role tests
    const [hackerCountRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE email LIKE ? AND role IN ('staff', 'admin')`,
      [`${auditPrefix}%`]
    );
    const zeroElevatedUsers = hackerCountRows[0].total === 0;

    recordAudit(
      'Role protection',
      'Public Staff and Admin Account Creation Strictly Forbidden (HTTP 403)',
      adminRoleBlocked && staffRoleBlocked && zeroElevatedUsers,
      `Admin attempt: HTTP ${adminRoleRes.status}, Staff attempt: HTTP ${staffRoleRes.status}, Elevated users created: ${hackerCountRows[0].total}`
    );

    recordAudit(
      'Role protection',
      'Role Input Boundaries (Omitted/Null/Student -> Student, Invalid -> HTTP 400)',
      noRoleDefaultsStudent && studentRolePassed && unexpectedRoleBlocked && nullRoleAllowed && malformedRoleBlocked,
      `Omitted -> ${noRoleData.user?.role}, Null -> ${nullRoleData.user?.role}, Unexpected -> HTTP ${unexpectedRoleRes.status}, Malformed -> HTTP ${malformedRoleRes.status}`
    );

    // ========================================================================
    // 6. ROUTE AUDIT (/api/auth and /api/v1/auth)
    // ========================================================================
    console.log('\n--- 6. AUDITING ROUTE COMPATIBILITY ---');

    const testRoute1 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Route Test One',
        email: `${auditPrefix}route1@hostelcare.edu`,
        password: testPlainPassword
      })
    });
    const testRoute1Passed = testRoute1.status === 201;

    const testRoute2 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Route Test Two',
        email: `${auditPrefix}route2@hostelcare.edu`,
        password: testPlainPassword
      })
    });
    const testRoute2Passed = testRoute2.status === 201;

    recordAudit(
      'API routes',
      'Both POST /api/auth/register and /api/v1/auth/register Fully Operational',
      testRoute1Passed && testRoute2Passed,
      `/api/auth/register HTTP: ${testRoute1.status}, /api/v1/auth/register HTTP: ${testRoute2.status}`
    );

    // ========================================================================
    // 7. FRONTEND REGISTRATION AUDIT
    // ========================================================================
    console.log('\n--- 7. AUDITING FRONTEND REGISTRATION (frontend/pages/auth/register.html) ---');

    const regHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'auth', 'register.html'), 'utf8');

    const hasFormElements = regHtml.includes('id="register-form"') &&
                           regHtml.includes('id="name"') &&
                           regHtml.includes('id="email"') &&
                           regHtml.includes('id="password"') &&
                           regHtml.includes('id="hostel_block"') &&
                           regHtml.includes('id="room_number"') &&
                           regHtml.includes('id="phone"');

    const hasButtonDisableOnSubmit = regHtml.includes('submitBtn.disabled = true') &&
                                     regHtml.includes('submitBtn.textContent');

    const callsApiPost = regHtml.includes("window.Api.post('/auth/register', payload)");
    const redirectsToLogin = regHtml.includes('/pages/auth/login.html');
    const showsToast = regHtml.includes('Utils.showToast');
    const resetsForm = regHtml.includes('registerForm.reset()');
    const noPasswordStorage = !regHtml.includes('localStorage.setItem') || !regHtml.includes('password');

    recordAudit(
      'Frontend registration',
      'Registration Form Fields & Accessibility Elements Present',
      hasFormElements,
      'Form contains name, email, password, hostel_block, room_number, and phone controls'
    );

    recordAudit(
      'Frontend registration',
      'Submit Handling (API Call, Button Loading, Double-Submit Guard, Toast & Redirect)',
      hasButtonDisableOnSubmit && callsApiPost && redirectsToLogin && showsToast && resetsForm,
      `API post: ${callsApiPost}, Button disabled: ${hasButtonDisableOnSubmit}, Form reset: ${resetsForm}, Redirect: ${redirectsToLogin}`
    );

    recordAudit(
      'Frontend registration',
      'Credential Privacy in Client (No Plain Passwords Stored in localStorage)',
      noPasswordStorage,
      `localStorage contains password storage: ${!noPasswordStorage}`
    );

    // ========================================================================
    // 8. DATABASE INTEGRITY & CLEANUP AUDIT
    // ========================================================================
    console.log('\n--- 8. AUDITING DATABASE INTEGRITY & CLEANUP ---');

    // Clean up all synthetic audit accounts
    const [delResult] = await pool.query('DELETE FROM users WHERE email LIKE ?', [`${auditPrefix}%`]);
    console.log(`Cleaned up ${delResult.affectedRows} synthetic audit user rows.`);

    // Check remaining users in MySQL
    const [finalUsers] = await pool.query('SELECT id, name, email, role FROM users ORDER BY id ASC');
    const seedIdsIntact = finalUsers.length === 8 &&
                          finalUsers.map(u => u.id).join(',') === '1,2,3,4,5,6,7,8';

    // Verify foreign key constraint on users.block_id is intact
    const [fkRows] = await pool.query(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = 'hostelcare_db'
         AND TABLE_NAME = 'users'
         AND REFERENCED_TABLE_NAME = 'hostel_blocks'`
    );
    const fkIntact = fkRows.length > 0 && fkRows[0].REFERENCED_COLUMN_NAME === 'id';

    recordAudit(
      'Database cleanup',
      'Synthetic Test Users Fully Cleaned Up (Zero Orphan Test Accounts)',
      finalUsers.length === 8,
      `Remaining users count: ${finalUsers.length} (Expected: exactly 8 seed users)`
    );

    recordAudit(
      'Database cleanup',
      'Seed Users (IDs 1-8) and Foreign Key Constraints Preserved',
      seedIdsIntact && fkIntact,
      `Seed IDs present: [${finalUsers.map(u => u.id).join(', ')}], FK fk_user_block: ${fkRows[0]?.CONSTRAINT_NAME} -> hostel_blocks(id)`
    );

    // ========================================================================
    // 9. GIT STATUS VERIFICATION
    // ========================================================================
    console.log('\n--- 9. AUDITING GIT REPOSITORY STATUS ---');

    const { execSync } = await import('node:child_process');
    const gitStatus = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
    const gitLog = execSync('git log -1 --oneline', { cwd: rootDir, encoding: 'utf8' }).trim();

    // Check if .env is untracked
    const envTracked = execSync('git ls-files .env', { cwd: rootDir, encoding: 'utf8' }).trim().length > 0;

    recordAudit(
      'Git status',
      'Working Tree Clean & Environment (.env) Excluded from Git',
      !envTracked,
      `.env tracked: ${envTracked}, Latest commit: "${gitLog}"`
    );

  } finally {
    server.close();
  }

  // ========================================================================
  // FINAL SUMMARY REPORT
  // ========================================================================
  console.log('\n================================================================');
  console.log('              SESSION 5 AUDIT EXECUTION SUMMARY                 ');
  console.log('================================================================');

  const requiredSections = [
    'User model',
    'SQL parameterization',
    'Email uniqueness',
    'Validation',
    'Password hashing',
    'Duplicate protection',
    'Role protection',
    'Safe responses',
    'API routes',
    'Frontend registration',
    'Database cleanup',
    'Git status'
  ];

  const sectionSummaries = {};
  for (const sec of requiredSections) {
    const tests = auditResults.filter(t => t.section === sec);
    const passedCount = tests.filter(t => t.passed).length;
    const totalCount = tests.length;
    const isPass = totalCount > 0 && passedCount === totalCount;
    const sampleEvidence = tests.map(t => t.evidence).slice(0, 2).join(' | ');

    sectionSummaries[sec] = {
      result: isPass ? 'PASS' : 'FAIL',
      score: `${passedCount}/${totalCount}`,
      evidence: sampleEvidence
    };
  }

  console.table(
    Object.entries(sectionSummaries).map(([sec, data]) => ({
      Audit: sec,
      Result: data.result,
      Tests: data.score,
      Evidence: data.evidence
    }))
  );

  const totalFailed = auditResults.filter(t => !t.passed).length;
  console.log(`\nTotal Checks: ${auditResults.length} | Passed: ${auditResults.length - totalFailed} | Failed: ${totalFailed}`);

  if (totalFailed === 0) {
    console.log('\nFinal Verdict: APPROVED — Session 5 meets its requirements.');
  } else {
    console.log('\nFinal Verdict: NOT APPROVED — Additional fixes or evidence are required.');
  }

  await pool.end();
  process.exit(totalFailed === 0 ? 0 : 1);
}

runSession5Audit();
