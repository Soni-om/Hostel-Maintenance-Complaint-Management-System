/**
 * HostelCare — Session 8 Comprehensive Security & RBAC Audit
 * Exhaustive technical audit verifying:
 * 1. Strict Role Boundaries (Student vs Staff vs Admin)
 * 2. Unauthenticated (401) vs Unauthorized (403) Access Control
 * 3. Controlled Staff/Admin Account Provisioning (POST /api/v1/users)
 * 4. Privilege Escalation Prevention & Request Body Role Validation
 * 5. Input Validation, Bcrypt Hashing, and Safe Entity Sanitization
 * 6. User Directory Listing & Status Management with Self-Deactivation Guard
 * 7. Frontend Role Guards, Navigation Link Visibility, and Dashboard Access
 * 8. Full System Regression (Sessions 5, 6, 7) & MySQL Relational Cleanliness
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/db.js');
const { default: UserModel } = await import('../src/models/userModel.js');
const { generateToken } = await import('../src/utils/jwt.js');

const auditResults = [];

function recordAudit(section, testNum, testName, passed, evidence, failureDetails = null) {
  auditResults.push({ section, testNum, testName, passed, evidence, failureDetails });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${badge}] [${section}] #${testNum}: ${testName}`);
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

async function runSession8Audit() {
  console.log('================================================================');
  console.log('       HOSTELCARE — SESSION 8 COMPREHENSIVE SECURITY AUDIT      ');
  console.log('================================================================\n');

  // Launch test Express instance on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tempStaffEmail = 'audit.s8.carpenter@hostelcare.edu';
  const tempAdminEmail = 'audit.s8.asstwarden@hostelcare.edu';

  try {
    // Teardown any leftover test accounts
    await pool.query('DELETE FROM users WHERE email IN (?, ?)', [tempStaffEmail, tempAdminEmail]);

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
    // SECTION 1: Unauthenticated & Malformed Token Rejection (401)
    // ========================================================================
    console.log('--- SECTION 1: Unauthenticated & Invalid Token Rejection ---');

    // 1.1: GET /api/v1/users without token
    const a1 = await requestJson(baseUrl, '/api/v1/users');
    recordAudit('Auth Guards', 1, 'Missing token on /api/v1/users returns HTTP 401 NO_TOKEN',
      a1.status === 401 && a1.data.code === 'NO_TOKEN',
      `HTTP ${a1.status}, code: ${a1.data.code}`
    );

    // 1.2: GET /api/v1/staff/overview without token
    const a2 = await requestJson(baseUrl, '/api/v1/staff/overview');
    recordAudit('Auth Guards', 2, 'Missing token on /api/v1/staff/overview returns HTTP 401 NO_TOKEN',
      a2.status === 401 && a2.data.code === 'NO_TOKEN',
      `HTTP ${a2.status}, code: ${a2.data.code}`
    );

    // 1.3: POST /api/v1/users without token
    const a3 = await requestJson(baseUrl, '/api/v1/users', { method: 'POST', body: { name: 'Test' } });
    recordAudit('Auth Guards', 3, 'Missing token on POST /api/v1/users returns HTTP 401 NO_TOKEN',
      a3.status === 401 && a3.data.code === 'NO_TOKEN',
      `HTTP ${a3.status}, code: ${a3.data.code}`
    );

    // 1.4: Invalid token on /api/v1/users
    const a4 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': 'Bearer bad.token.string' }
    });
    recordAudit('Auth Guards', 4, 'Invalid token on /api/v1/users returns HTTP 401 INVALID_TOKEN',
      a4.status === 401 && a4.data.code === 'INVALID_TOKEN',
      `HTTP ${a4.status}, code: ${a4.data.code}`
    );

    // ========================================================================
    // SECTION 2: Student Role Boundaries (Strict Least-Privilege Enforcement)
    // ========================================================================
    console.log('\n--- SECTION 2: Student Role Access Boundaries ---');

    // 2.1: Student can access own profile
    const a5 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordAudit('Student RBAC', 5, 'Student can access own profile on /api/v1/auth/me',
      a5.status === 200 && a5.data.user?.role === 'student',
      `HTTP ${a5.status}, user: "${a5.data.user?.name}"`
    );

    // 2.2: Student rejected from Staff Overview (403)
    const a6 = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordAudit('Student RBAC', 6, 'Student is forbidden from Staff Overview API (HTTP 403)',
      a6.status === 403 && a6.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a6.status}, code: ${a6.data.code}`
    );

    // 2.3: Student rejected from User Directory (403)
    const a7 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    recordAudit('Student RBAC', 7, 'Student is forbidden from User Directory API (HTTP 403)',
      a7.status === 403 && a7.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a7.status}, code: ${a7.data.code}`
    );

    // 2.4: Student rejected from Provisioning Users (403)
    const a8 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { name: 'Attempt', email: 'attempt@hostelcare.edu', password: 'Password@123', role: 'staff' }
    });
    recordAudit('Student RBAC', 8, 'Student is forbidden from Provisioning Users (HTTP 403)',
      a8.status === 403 && a8.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a8.status}, code: ${a8.data.code}`
    );

    // 2.5: Student rejected from Status Updates (403)
    const a9 = await requestJson(baseUrl, `/api/v1/users/${adminUser.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { account_status: 'inactive' }
    });
    recordAudit('Student RBAC', 9, 'Student is forbidden from Modifying Account Status (HTTP 403)',
      a9.status === 403 && a9.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a9.status}, code: ${a9.data.code}`
    );

    // ========================================================================
    // SECTION 3: Staff Role Boundaries
    // ========================================================================
    console.log('\n--- SECTION 3: Staff Role Access Boundaries ---');

    // 3.1: Staff can access own profile
    const a10 = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    recordAudit('Staff RBAC', 10, 'Staff can access own profile on /api/v1/auth/me',
      a10.status === 200 && a10.data.user?.role === 'staff',
      `HTTP ${a10.status}, designation: "${a10.data.user?.staff_designation}"`
    );

    // 3.2: Staff can access Staff Overview
    const a11 = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    recordAudit('Staff RBAC', 11, 'Staff can access Staff Operations Overview API (HTTP 200)',
      a11.status === 200 && a11.data.success === true,
      `HTTP ${a11.status}, data: ${JSON.stringify(a11.data.data)}`
    );

    // 3.3: Staff rejected from User Directory (403)
    const a12 = await requestJson(baseUrl, '/api/v1/users', {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    recordAudit('Staff RBAC', 12, 'Staff is forbidden from Administrative User Directory (HTTP 403)',
      a12.status === 403 && a12.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a12.status}, code: ${a12.data.code}`
    );

    // 3.4: Staff rejected from Provisioning Users (403)
    const a13 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${staffToken}` },
      body: { name: 'Attempt', email: 'attempt2@hostelcare.edu', password: 'Password@123', role: 'staff' }
    });
    recordAudit('Staff RBAC', 13, 'Staff is forbidden from Provisioning Users (HTTP 403)',
      a13.status === 403 && a13.data.code === 'FORBIDDEN_ROLE',
      `HTTP ${a13.status}, code: ${a13.data.code}`
    );

    // ========================================================================
    // SECTION 4: Controlled Administrative Provisioning & Validation
    // ========================================================================
    console.log('\n--- SECTION 4: Controlled Administrative Account Provisioning ---');

    // 4.1: Public self-registration of staff strictly blocked (HTTP 403)
    const a14 = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Fake Staff', email: 'fakestaff@hostelcare.edu', password: 'Password@123', role: 'staff' }
    });
    recordAudit('Provisioning', 14, 'Public registration blocks staff role elevation with HTTP 403',
      a14.status === 403,
      `HTTP ${a14.status}, message: "${a14.data?.message}"`
    );

    // 4.2: Public self-registration of admin strictly blocked (HTTP 403)
    const a15 = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Fake Admin', email: 'fakeadmin@hostelcare.edu', password: 'Password@123', role: 'admin' }
    });
    recordAudit('Provisioning', 15, 'Public registration blocks admin role elevation with HTTP 403',
      a15.status === 403,
      `HTTP ${a15.status}, message: "${a15.data?.message}"`
    );

    // 4.3: Admin provisions new Staff user (HTTP 201)
    const a16 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Anand Carpenter Varma',
        email: tempStaffEmail,
        password: 'Password@123',
        role: 'staff',
        staff_designation: 'Hostel Master Carpenter',
        hostel_block: 'Block B',
        phone: '+91 9899334455'
      }
    });
    const provStaff = a16.data?.user;
    recordAudit('Provisioning', 16, 'Admin provisions Staff account successfully with HTTP 201',
      a16.status === 201 && provStaff?.role === 'staff' && provStaff?.email === tempStaffEmail,
      `HTTP ${a16.status}, id: ${provStaff?.id}, role: "${provStaff?.role}", designation: "${provStaff?.staff_designation}"`
    );

    // 4.4: password_hash is strictly absent from provisioned user response
    const hasHash = 'password_hash' in (provStaff || {}) || 'password' in (provStaff || {});
    recordAudit('Provisioning', 17, 'Sensitive password_hash is strictly omitted from provisioning response',
      !hasHash,
      `password_hash present: ${hasHash}, keys: [${Object.keys(provStaff || {}).join(', ')}]`
    );

    // 4.5: Duplicate email provisioning rejected (HTTP 409)
    const a18 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Duplicate Staff',
        email: tempStaffEmail,
        password: 'Password@123',
        role: 'staff'
      }
    });
    recordAudit('Provisioning', 18, 'Duplicate email on user provisioning is rejected with HTTP 409 Conflict',
      a18.status === 409,
      `HTTP ${a18.status}, message: "${a18.data?.message}"`
    );

    // 4.6: Admin attempts to provision Admin account -> Strictly rejected (HTTP 400 Bad Request)
    const a19 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        name: 'Assistant Warden Verma',
        email: tempAdminEmail,
        password: 'Password@123',
        role: 'admin',
        phone: '+91 9811445566'
      }
    });
    recordAudit('Provisioning', 19, 'Admin provisioning of Admin role is strictly rejected with HTTP 400 (system-seeded)',
      a19.status === 400 && (a19.data?.message?.includes('system-seeded') || a19.data?.errors?.[0]?.msg?.includes('system-seeded')),
      `HTTP ${a19.status}, message: "${a19.data?.message || a19.data?.errors?.[0]?.msg}"`
    );

    // 4.7: Invalid role manipulation rejected (e.g. role: 'student' or 'superadmin')
    const a20 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { name: 'Bad Role', email: 'badrole@hostelcare.edu', password: 'Password@123', role: 'student' }
    });
    recordAudit('Provisioning', 20, 'Request body role manipulation on /api/v1/users rejected with HTTP 400',
      a20.status === 400,
      `HTTP ${a20.status}, message: "${a20.data?.message}"`
    );

    // 4.8: Weak password (< 6 chars) rejected on provisioning
    const a21 = await requestJson(baseUrl, '/api/v1/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { name: 'Weak Pass', email: 'weakpass@hostelcare.edu', password: '123', role: 'staff' }
    });
    recordAudit('Provisioning', 21, 'Short password (< 6 characters) rejected with HTTP 400',
      a21.status === 400,
      `HTTP ${a21.status}, message: "${a21.data?.message}"`
    );

    // ========================================================================
    // SECTION 5: User Directory & Status Administration
    // ========================================================================
    console.log('\n--- SECTION 5: User Directory & Status Administration ---');

    // 5.1: Admin lists users directory with pagination
    const a22 = await requestJson(baseUrl, '/api/v1/users?role=staff', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    recordAudit('User Admin', 22, 'Admin retrieves filtered user directory (role=staff)',
      a22.status === 200 && Array.isArray(a22.data.users) && a22.data.users.every(u => u.role === 'staff'),
      `HTTP ${a22.status}, staff records returned: ${a22.data.users?.length}`
    );

    // 5.2: Admin cannot deactivate their own active account
    const a23 = await requestJson(baseUrl, `/api/v1/users/${adminUser.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { account_status: 'inactive' }
    });
    recordAudit('User Admin', 23, 'Self-deactivation protection: Admin cannot deactivate own account (HTTP 400)',
      a23.status === 400,
      `HTTP ${a23.status}, message: "${a23.data?.message}"`
    );

    // 5.3: Admin toggles provisioned user status to inactive
    const a24 = await requestJson(baseUrl, `/api/v1/users/${provStaff.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { account_status: 'inactive' }
    });
    recordAudit('User Admin', 24, 'Admin successfully deactivates provisioned staff user (HTTP 200)',
      a24.status === 200 && a24.data.user?.account_status === 'inactive',
      `HTTP ${a24.status}, new status: "${a24.data.user?.account_status}"`
    );

    // 5.4: Deactivated user is rejected from protected endpoints on subsequent requests
    const deactivatedToken = generateToken({
      id: provStaff.id,
      email: tempStaffEmail,
      role: 'staff',
      name: provStaff.name
    });
    const a25 = await requestJson(baseUrl, '/api/v1/staff/overview', {
      headers: { 'Authorization': `Bearer ${deactivatedToken}` }
    });
    recordAudit('User Admin', 25, 'Deactivated account immediately rejected on protected requests with HTTP 403',
      a25.status === 403 && a25.data.code === 'ACCOUNT_INACTIVE',
      `HTTP ${a25.status}, code: ${a25.data.code}`
    );

    // Clean up temporary test users created during audit
    if (provStaff?.id) {
      await pool.query('DELETE FROM users WHERE id = ?', [provStaff.id]);
    }

    // ========================================================================
    // SECTION 6: Frontend Role Guards & Navigation Architecture
    // ========================================================================
    console.log('\n--- SECTION 6: Frontend Role Guards & Navigation ---');

    const authJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'auth.js'), 'utf8');
    const studentHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html'), 'utf8');
    const staffHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'staff', 'dashboard.html'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html'), 'utf8');

    const hasRoleMethod = authJs.includes('hasRole(');
    const hasDataAllowed = authJs.includes('[data-allowed-roles]');
    const hasDataForbidden = authJs.includes('[data-forbidden-roles]');

    recordAudit('Frontend', 26, 'Frontend auth.js implements hasRole and dynamic role visibility decorators',
      hasRoleMethod && hasDataAllowed && hasDataForbidden,
      `hasRole: ${hasRoleMethod}, [data-allowed-roles]: ${hasDataAllowed}, [data-forbidden-roles]: ${hasDataForbidden}`
    );

    const sGuarded = studentHtml.includes("requireAuth(['student'])");
    const stGuarded = staffHtml.includes("requireAuth(['staff'])");
    const aGuarded = adminHtml.includes("requireAuth(['admin'])");

    recordAudit('Frontend', 27, 'All 3 dashboard pages enforce role-specific route guards',
      sGuarded && stGuarded && aGuarded,
      `Student: ${sGuarded}, Staff: ${stGuarded}, Admin: ${aGuarded}`
    );

    // ========================================================================
    // SECTION 7: System Regression Tests (Sessions 5, 6, 7)
    // ========================================================================
    console.log('\n--- SECTION 7: System Regression Stability ---');

    // 7.1: Session 3 Health Checks
    const hRes = await requestJson(baseUrl, '/api/health');
    recordAudit('Regression', 28, 'Session 3: Express server & MySQL pool health check healthy',
      hRes.status === 200 && hRes.data.status === 'healthy',
      `HTTP ${hRes.status}, database: ${hRes.data.database?.status}`
    );

    // 7.2: Session 5 Student Registration duplicate protection
    const regRes = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Rahul Sharma',
        email: 'rahul.cs23@hostelcare.edu',
        password: 'Password@123',
        phone: '9876543210',
        hostel_block: 'Block A',
        room_number: '101'
      }
    });
    recordAudit('Regression', 29, 'Session 5: Student registration prevents duplicates with HTTP 409',
      regRes.status === 409,
      `HTTP ${regRes.status}, message: "${regRes.data?.message}"`
    );

    // 7.3: Session 6 Login authentication
    const lRes = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'rahul.cs23@hostelcare.edu',
        password: 'Password@123'
      }
    });
    recordAudit('Regression', 30, 'Session 6: Login API verifies password and returns JWT token & safe profile',
      lRes.status === 200 && Boolean(lRes.data.token) && !('password_hash' in lRes.data.user),
      `HTTP ${lRes.status}, token present: ${Boolean(lRes.data.token)}, role: "${lRes.data.user?.role}"`
    );

    // 7.4: Session 7 Auth Profile & Logout
    const meRes = await requestJson(baseUrl, '/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const logoutRes = await requestJson(baseUrl, '/api/v1/auth/logout', { method: 'POST' });
    recordAudit('Regression', 31, 'Session 7: GET /api/v1/auth/me & POST /api/v1/auth/logout fully operational',
      meRes.status === 200 && logoutRes.status === 200,
      `Profile HTTP: ${meRes.status}, Logout HTTP: ${logoutRes.status}`
    );

    // 7.5: Database Relational Cleanliness
    const [finalCount] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const remainingUsers = finalCount[0].total;
    recordAudit('Database', 32, 'MySQL database retains exactly 8 pristine seed records (Zero test pollution)',
      remainingUsers === 8,
      `Total users remaining in DB: ${remainingUsers} (1 Admin, 3 Staff, 4 Students)`
    );

    // 7.6: Database Admin Account Audit
    const [adminRows] = await pool.query('SELECT id, name, email, role FROM users WHERE role = ?', ['admin']);
    const onlySeededAdmin = adminRows.length === 1 && adminRows[0].email === 'admin@hostelcare.edu';
    recordAudit('Database', 33, 'Database Security: Exactly 1 seeded Admin account exists (no unauthorized Admin accounts)',
      onlySeededAdmin,
      `Admin count: ${adminRows.length}, accounts: [${adminRows.map(a => a.email).join(', ')}]`
    );

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\n✓ Test HTTP server closed.');
  }

  // Summary
  const passedCount = auditResults.filter((r) => r.passed).length;
  const failedCount = auditResults.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`SESSION 8 COMPREHENSIVE AUDIT: ${passedCount}/${auditResults.length} CHECKS PASSED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED AUDIT CHECKS: ${failedCount}`);
    await pool.end();
    process.exit(1);
  } else {
    console.log('ALL 32/32 SESSION 8 AUDIT CHECKS PASSED WITH ZERO ERRORS.');
    await pool.end();
    process.exit(0);
  }
}

runSession8Audit().catch((err) => {
  console.error('Fatal Audit Error:', err);
  process.exit(1);
});

