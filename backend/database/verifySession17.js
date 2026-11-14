/**
 * HostelCare — Session 17 Verification & Integration Test Suite
 * Automated tests for Admin Management, User Governance, Category CRUD, and Dashboard:
 *
 * 1. Static file structure & Frontend assets:
 *    - frontend/pages/admin/dashboard.html (live KPI cards, tab navigation, modals)
 *    - backend/src/controllers/adminController.js & categoryController.js & userController.js
 *    - backend/src/routes/adminRoutes.js & categoryRoutes.js & userRoutes.js
 *
 * 2. Admin User Governance & RBAC Enforcement:
 *    - GET /api/admin/users (paginated directory, role/status/search filters)
 *    - GET /api/admin/users/:id (details without password_hash)
 *    - PATCH /api/admin/users/:id (update profile, role, room, block)
 *    - Non-admin (Student, Staff) forbidden with 403
 *    - Unauthenticated request rejected with 401
 *
 * 3. Last Active Admin Protection & Account Safety Guards:
 *    - Cannot deactivate last active admin (400 CANNOT_DISABLE_LAST_ADMIN)
 *    - Cannot demote last active admin (400 CANNOT_DISABLE_LAST_ADMIN)
 *    - Cannot self-deactivate active admin (400 SELF_DEACTIVATION_DENIED)
 *    - Non-admin account status toggling works (200 OK)
 *
 * 4. Category Master & Active/Inactive Management:
 *    - GET /api/admin/categories (all categories with complaint usage counts)
 *    - GET /api/categories (active categories only for student ticket submission)
 *    - POST /api/admin/categories (create new category with 201)
 *    - Duplicate category name rejected with 409 Conflict
 *    - PATCH /api/admin/categories/:id/status (deactivate/activate toggle)
 *    - Inactive category excluded from student complaint form
 *
 * 5. Historical Complaint Preservation & Safe Deletion:
 *    - Category with complaints cannot be deleted (409 CATEGORY_IN_USE)
 *    - Historical records and FK integrity preserved
 *    - Unused category with 0 complaints can be safely deleted (200 OK)
 *
 * 6. Live Admin Dashboard Statistics & Analytics:
 *    - GET /api/admin/stats (live database stats: complaints, users, SLA, feedback)
 *    - GET /api/admin/dashboard parity
 *    - Non-admin (Student, Staff) forbidden with 403
 *
 * 7. Database Baseline Restoration & Integrity:
 *    - Teardown of synthetic test objects
 *    - Verification of original seed counts (5 complaints, 8 users, 4 assignments, 2 feedback, 6 categories)
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
const { default: CategoryModel } = await import('../src/models/categoryModel.js');
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

async function runSession17Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 17 VERIFICATION & INTEGRATION TEST SUITE');
  console.log('  Admin Management, User Governance, Category CRUD & Live Dashboard');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function makeRequest({ path: reqPath, method = 'GET', headers = {}, body = null }) {
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
  const createdUserIds = [];
  const createdCategoryIds = [];

  try {
    // 1. Fetch seed users from database
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');
    const supervisorStaff = await UserModel.findByEmail('sunita.supervisor@hostelcare.edu');
    const student1 = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');
    const student2 = await UserModel.findByEmail('priya.ee24@hostelcare.edu');

    // Generate JWT auth tokens
    const adminToken = generateToken(adminUser);
    const staffToken = generateToken(supervisorStaff);
    const studentToken = generateToken(student1);

    console.log('--- SECTION 1: STATIC FILE STRUCTURE & FRONTEND ASSETS ---\n');

    // Test 1: Frontend Admin Dashboard file exists
    {
      const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html');
      const exists = fs.existsSync(dashboardPath);
      recordTest(1, 'Admin Dashboard HTML exists at frontend/pages/admin/dashboard.html', exists, `Path: ${dashboardPath}`);
    }

    // Test 2: Admin Dashboard contains KPI cards and tab navigation
    {
      const dashboardContent = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html'), 'utf8');
      const hasTabs = dashboardContent.includes('tab-btn-overview') && dashboardContent.includes('tab-btn-users') && dashboardContent.includes('tab-btn-categories');
      const hasKPIs = dashboardContent.includes('kpi-total-complaints') && dashboardContent.includes('kpi-students-count') && dashboardContent.includes('kpi-staff-count');
      recordTest(2, 'Admin Dashboard integrates live KPI cards and tabbed navigation (Overview, Users, Categories)', hasTabs && hasKPIs, `Has tabs: ${hasTabs}, Has KPIs: ${hasKPIs}`);
    }

    // Test 3: Admin Dashboard contains provisioning, edit user, and category modals
    {
      const dashboardContent = fs.readFileSync(path.join(rootDir, 'frontend', 'pages', 'admin', 'dashboard.html'), 'utf8');
      const hasProvModal = dashboardContent.includes('modal-provision-staff');
      const hasEditUserModal = dashboardContent.includes('modal-edit-user');
      const hasAddCatModal = dashboardContent.includes('modal-add-category');
      const hasEditCatModal = dashboardContent.includes('modal-edit-category');
      const passed = hasProvModal && hasEditUserModal && hasAddCatModal && hasEditCatModal;
      recordTest(3, 'Admin Dashboard contains modals for Staff Provisioning, Edit User, Add Category, and Edit Category', passed, `Modals verified: prov=${hasProvModal}, editUser=${hasEditUserModal}, addCat=${hasAddCatModal}, editCat=${hasEditCatModal}`);
    }

    // Test 4: Backend Admin controller exists
    {
      const adminCtrlPath = path.join(rootDir, 'backend', 'src', 'controllers', 'adminController.js');
      const exists = fs.existsSync(adminCtrlPath);
      recordTest(4, 'Backend Admin controller exists at backend/src/controllers/adminController.js', exists, `Exists: ${exists}`);
    }

    // Test 5: Backend Admin routes exist
    {
      const adminRoutesPath = path.join(rootDir, 'backend', 'src', 'routes', 'adminRoutes.js');
      const exists = fs.existsSync(adminRoutesPath);
      recordTest(5, 'Backend Admin routes exist at backend/src/routes/adminRoutes.js', exists, `Exists: ${exists}`);
    }

    // Test 6: Backend Category controller exists with CRUD methods
    {
      const catCtrlPath = path.join(rootDir, 'backend', 'src', 'controllers', 'categoryController.js');
      const exists = fs.existsSync(catCtrlPath);
      const catModel = await import('../src/models/categoryModel.js');
      const hasModelMethods = typeof catModel.default.create === 'function' && typeof catModel.default.update === 'function' && typeof catModel.default.delete === 'function';
      recordTest(6, 'Backend Category controller & model exist with CRUD methods', exists && hasModelMethods, `Ctrl exists: ${exists}, Model CRUD methods: ${hasModelMethods}`);
    }

    console.log('\n--- SECTION 2: ADMIN USER GOVERNANCE & RBAC ENFORCEMENT ---\n');

    // Test 7: GET /api/admin/users returns 200 OK for Admin
    {
      const res = await makeRequest({
        path: '/api/admin/users',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && Array.isArray(res.data.users) && res.data.pagination;
      recordTest(7, 'Admin retrieves paginated user directory via GET /api/admin/users (200 OK)', passed, `Status: ${res.status}, User count: ${res.data.users?.length}, Total: ${res.data.pagination?.total}`);
    }

    // Test 8: GET /api/v1/admin/users API version prefix parity
    {
      const res = await makeRequest({
        path: '/api/v1/admin/users',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && Array.isArray(res.data.users);
      recordTest(8, 'API version prefix parity: GET /api/v1/admin/users returns 200 OK', passed, `Status: ${res.status}, Users: ${res.data.users?.length}`);
    }

    // Test 9: GET /api/admin/users pagination works
    {
      const res = await makeRequest({
        path: '/api/admin/users?limit=2&page=1',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.users?.length === 2 && res.data.pagination?.limit === 2 && res.data.pagination?.page === 1;
      recordTest(9, 'Pagination parameters enforce limit=2 and page=1 correctly', passed, `Status: ${res.status}, Returned: ${res.data.users?.length}, Limit: ${res.data.pagination?.limit}`);
    }

    // Test 10: GET /api/admin/users?role=staff filters by role
    {
      const res = await makeRequest({
        path: '/api/admin/users?role=staff',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const allStaff = res.data.users?.every(u => u.role === 'staff');
      const passed = res.status === 200 && allStaff && res.data.users?.length === 3;
      recordTest(10, 'Filter by role: ?role=staff returns only staff members (count=3)', passed, `Status: ${res.status}, Count: ${res.data.users?.length}, All staff: ${allStaff}`);
    }

    // Test 11: GET /api/admin/users?status=active filters by status
    {
      const res = await makeRequest({
        path: '/api/admin/users?status=active',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const allActive = res.data.users?.every(u => u.account_status === 'active');
      const passed = res.status === 200 && allActive && res.data.users?.length === 8;
      recordTest(11, 'Filter by status: ?status=active returns only active users (count=8)', passed, `Status: ${res.status}, Count: ${res.data.users?.length}, All active: ${allActive}`);
    }

    // Test 12: GET /api/admin/users?search=ramesh search filter
    {
      const res = await makeRequest({
        path: '/api/admin/users?search=ramesh',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.users?.length === 1 && res.data.users[0]?.name?.toLowerCase().includes('ramesh');
      recordTest(12, 'Keyword search: ?search=ramesh finds target staff record', passed, `Status: ${res.status}, Found: ${res.data.users?.[0]?.name}`);
    }

    // Test 13: GET /api/admin/users/:id retrieves user details without password_hash
    {
      const res = await makeRequest({
        path: `/api/admin/users/${student1.id}`,
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const user = res.data.user;
      const noPassword = user && user.password_hash === undefined;
      const passed = res.status === 200 && user?.id === student1.id && noPassword;
      recordTest(13, 'GET /api/admin/users/:id returns user details and NEVER leaks password_hash', passed, `Status: ${res.status}, User: ${user?.name}, Has password_hash: ${Boolean(user?.password_hash)}`);
    }

    // Test 14: GET /api/admin/users/99999 non-existent user returns 404
    {
      const res = await makeRequest({
        path: '/api/admin/users/99999',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(14, 'GET /api/admin/users/99999 non-existent user returns 404 Not Found', passed, `Status: ${res.status}, Message: ${res.data.message}`);
    }

    // Test 15: RBAC: Student forbidden from GET /api/admin/users (403)
    {
      const res = await makeRequest({
        path: '/api/admin/users',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(15, 'RBAC Defense: Student receives HTTP 403 Forbidden on GET /api/admin/users', passed, `Status: ${res.status}, Message: ${res.data.message}`);
    }

    // Test 16: RBAC: Staff forbidden from GET /api/admin/users (403)
    {
      const res = await makeRequest({
        path: '/api/admin/users',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(16, 'RBAC Defense: Staff receives HTTP 403 Forbidden on GET /api/admin/users', passed, `Status: ${res.status}, Message: ${res.data.message}`);
    }

    // Test 17: Unauthenticated request receives HTTP 401 on GET /api/admin/users
    {
      const res = await makeRequest({
        path: '/api/admin/users'
      });
      const passed = res.status === 401 && res.data.success === false;
      recordTest(17, 'Unauthenticated access rejected with HTTP 401 Unauthorized on GET /api/admin/users', passed, `Status: ${res.status}, Code: ${res.data.code}`);
    }

    // Test 18: PATCH /api/admin/users/:id updates user details
    {
      const res = await makeRequest({
        path: `/api/admin/users/${student2.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          phone: '+91 9988776655',
          room_number: 'B-205'
        }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.user?.phone === '+91 9988776655' && res.data.user?.room_number === 'B-205';
      recordTest(18, 'Admin updates user details via PATCH /api/admin/users/:id (200 OK)', passed, `Status: ${res.status}, Updated phone: ${res.data.user?.phone}, room: ${res.data.user?.room_number}`);

      // Revert student2 changes to preserve baseline
      await UserModel.updateUser(student2.id, {
        phone: student2.phone,
        room_number: student2.room_number
      });
    }

    // Test 19: Student forbidden from PATCH /api/admin/users/:id (403)
    {
      const res = await makeRequest({
        path: `/api/admin/users/${student2.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { phone: '+91 0000000000' }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(19, 'RBAC Defense: Student receives HTTP 403 Forbidden on PATCH /api/admin/users/:id', passed, `Status: ${res.status}`);
    }

    // Test 20: Staff forbidden from PATCH /api/admin/users/:id (403)
    {
      const res = await makeRequest({
        path: `/api/admin/users/${student2.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { phone: '+91 0000000000' }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(20, 'RBAC Defense: Staff receives HTTP 403 Forbidden on PATCH /api/admin/users/:id', passed, `Status: ${res.status}`);
    }

    console.log('\n--- SECTION 3: LAST ACTIVE ADMIN PROTECTION & SAFETY GUARDS ---\n');

    // Test 21: Deactivating the last active Admin is rejected with 400 CANNOT_DISABLE_LAST_ADMIN
    {
      const res = await makeRequest({
        path: `/api/admin/users/${adminUser.id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { account_status: 'inactive' }
      });
      // Should be blocked by either self-deactivation or last-admin guard
      const passed = res.status === 400 && (res.data.code === 'CANNOT_DISABLE_LAST_ADMIN' || res.data.code === 'SELF_DEACTIVATION_DENIED');
      recordTest(21, 'Admin self-deactivation or disabling last admin is blocked (HTTP 400 Bad Request)', passed, `Status: ${res.status}, Code: ${res.data.code}, Msg: ${res.data.message}`);
    }

    // Test 22: Demoting the last active Admin is rejected with 400 CANNOT_DISABLE_LAST_ADMIN
    {
      const res = await makeRequest({
        path: `/api/admin/users/${adminUser.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: 'staff' }
      });
      const passed = res.status === 400 && res.data.code === 'CANNOT_DISABLE_LAST_ADMIN';
      recordTest(22, 'Demoting the last active Administrator account is rejected with CANNOT_DISABLE_LAST_ADMIN (HTTP 400)', passed, `Status: ${res.status}, Code: ${res.data.code}, Msg: ${res.data.message}`);
    }

    // Test 23: Test last admin defense when requested from another admin (simulate 2 admins, disable 1, then fail disabling the 2nd)
    {
      // Create a temporary secondary admin
      const [insertRes] = await pool.execute(
        `INSERT INTO users (name, email, password_hash, role, account_status)
         VALUES ('Temp Co-Admin', 'temp.coadmin@hostelcare.edu', 'mock_hash', 'admin', 'active')`
      );
      const tempAdminId = insertRes.insertId;
      createdUserIds.push(tempAdminId);

      // Now we have 2 active admins. Deactivating temp admin should succeed:
      const deactRes = await makeRequest({
        path: `/api/admin/users/${tempAdminId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { account_status: 'inactive' }
      });
      const deactPassed = deactRes.status === 200 && deactRes.data.user?.account_status === 'inactive';

      // Now active admin count is 1. Attempting to demote primary admin must trigger CANNOT_DISABLE_LAST_ADMIN:
      const demoteRes = await makeRequest({
        path: `/api/admin/users/${adminUser.id}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: 'staff' }
      });
      const demoteBlocked = demoteRes.status === 400 && demoteRes.data.code === 'CANNOT_DISABLE_LAST_ADMIN';

      // Clean up temp admin immediately
      await pool.execute(`DELETE FROM users WHERE id = ?`, [tempAdminId]);
      const idx = createdUserIds.indexOf(tempAdminId);
      if (idx !== -1) createdUserIds.splice(idx, 1);

      recordTest(23, 'Multi-admin test: Disabling allowed when active admins > 1, strictly denied when active admins = 1', deactPassed && demoteBlocked, `Deactivation allowed: ${deactPassed}, Last admin demotion denied: ${demoteBlocked}`);
    }

    // Test 24: Admin can toggle status of non-admin account (student/staff)
    {
      // Deactivate student1
      const deactRes = await makeRequest({
        path: `/api/admin/users/${student1.id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { account_status: 'inactive' }
      });
      const deactOk = deactRes.status === 200 && deactRes.data.user?.account_status === 'inactive';

      // Reactivate student1
      const reactRes = await makeRequest({
        path: `/api/admin/users/${student1.id}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { account_status: 'active' }
      });
      const reactOk = reactRes.status === 200 && reactRes.data.user?.account_status === 'active';

      recordTest(24, 'Admin successfully deactivates and reactivates non-admin user account (200 OK)', deactOk && reactOk, `Deactivated: ${deactOk}, Reactivated: ${reactOk}`);
    }

    console.log('\n--- SECTION 4: CATEGORY MASTER & ACTIVE/INACTIVE MANAGEMENT ---\n');

    // Test 25: GET /api/admin/categories retrieves all categories with complaint usage counts
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const hasCounts = res.data.categories?.every(c => typeof c.complaint_count === 'number');
      const passed = res.status === 200 && res.data.success === true && res.data.categories?.length === 6 && hasCounts;
      recordTest(25, 'Admin retrieves all categories with live complaint usage counts via GET /api/admin/categories', passed, `Status: ${res.status}, Categories: ${res.data.categories?.length}, Has usage counts: ${hasCounts}`);
    }

    // Test 26: RBAC: Student forbidden from GET /api/admin/categories (403)
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(26, 'RBAC Defense: Student receives HTTP 403 Forbidden on GET /api/admin/categories', passed, `Status: ${res.status}`);
    }

    // Test 27: RBAC: Staff forbidden from GET /api/admin/categories (403)
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(27, 'RBAC Defense: Staff receives HTTP 403 Forbidden on GET /api/admin/categories', passed, `Status: ${res.status}`);
    }

    // Test 28: Student and Staff can access public GET /api/categories (active categories only)
    {
      const res = await makeRequest({
        path: '/api/categories',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const allActive = res.data.categories?.every(c => c.active === 1 || c.active === true);
      const passed = res.status === 200 && res.data.success === true && allActive && res.data.categories?.length === 6;
      recordTest(28, 'Authenticated Student retrieves active categories via GET /api/categories (200 OK)', passed, `Status: ${res.status}, Count: ${res.data.categories?.length}, All active: ${allActive}`);
    }

    // Test 29: Admin creates new category via POST /api/admin/categories (201 Created)
    let testCatId = null;
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'HVAC & Air Conditioning',
          description: 'AC cooling, duct repairs, filter replacement, ventilation fans',
          active: true
        }
      });
      const passed = res.status === 201 && res.data.success === true && res.data.category?.id && res.data.category.name === 'HVAC & Air Conditioning';
      if (res.data.category?.id) {
        testCatId = res.data.category.id;
        createdCategoryIds.push(testCatId);
      }
      recordTest(29, 'Admin creates new category via POST /api/admin/categories (201 Created)', passed, `Status: ${res.status}, Created Cat ID: ${testCatId}`);
    }

    // Test 30: Duplicate category name is rejected with 409 DUPLICATE_CATEGORY_NAME
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'hvac & air conditioning', // Case-insensitive duplicate
          description: 'Duplicate category attempt'
        }
      });
      const passed = res.status === 409 && res.data.code === 'DUPLICATE_CATEGORY_NAME';
      recordTest(30, 'Duplicate category name is rejected with HTTP 409 Conflict (DUPLICATE_CATEGORY_NAME)', passed, `Status: ${res.status}, Code: ${res.data.code}, Msg: ${res.data.message}`);
    }

    // Test 31: Category creation without required name rejected with 400 Bad Request
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { description: 'Missing name' }
      });
      const passed = res.status === 400 && res.data.success === false;
      recordTest(31, 'Category creation without required name rejected with HTTP 400 Bad Request', passed, `Status: ${res.status}, Msg: ${res.data.message}`);
    }

    // Test 32: Category creation by Student rejected with 403 Forbidden
    {
      const res = await makeRequest({
        path: '/api/admin/categories',
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { name: 'Student Rogue Category' }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(32, 'RBAC Defense: Student receives HTTP 403 Forbidden when creating category', passed, `Status: ${res.status}`);
    }

    // Test 33: GET /api/admin/categories/:id retrieves category details
    {
      const res = await makeRequest({
        path: `/api/admin/categories/${testCatId}`,
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.category?.id === testCatId && res.data.category.name === 'HVAC & Air Conditioning';
      recordTest(33, 'Admin retrieves category details via GET /api/admin/categories/:id', passed, `Status: ${res.status}, Name: ${res.data.category?.name}`);
    }

    // Test 34: PATCH /api/admin/categories/:id updates category
    {
      const res = await makeRequest({
        path: `/api/admin/categories/${testCatId}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          description: 'Updated HVAC description with chiller maintenance'
        }
      });
      const passed = res.status === 200 && res.data.category?.description === 'Updated HVAC description with chiller maintenance';
      recordTest(34, 'Admin updates category description via PATCH /api/admin/categories/:id (200 OK)', passed, `Status: ${res.status}, Desc: ${res.data.category?.description}`);
    }

    // Test 35: PATCH /api/admin/categories/:id/status deactivates category
    {
      const res = await makeRequest({
        path: `/api/admin/categories/${testCatId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { active: false }
      });
      const passed = res.status === 200 && res.data.category?.active === false;
      recordTest(35, 'Admin deactivates category via PATCH /api/admin/categories/:id/status (200 OK)', passed, `Status: ${res.status}, Active: ${res.data.category?.active}`);
    }

    // Test 36: Deactivated category is excluded from standard GET /api/categories for students
    {
      const res = await makeRequest({
        path: '/api/categories',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const containsTestCat = res.data.categories?.some(c => c.id === testCatId);
      const passed = res.status === 200 && !containsTestCat;
      recordTest(36, 'Deactivated category is excluded from student complaint categories dropdown', passed, `Categories count: ${res.data.categories?.length}, Contains deactivated cat: ${containsTestCat}`);
    }

    // Test 37: PATCH /api/admin/categories/:id/status reactivates category
    {
      const res = await makeRequest({
        path: `/api/admin/categories/${testCatId}/status`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { active: true }
      });
      const passed = res.status === 200 && res.data.category?.active === true;
      recordTest(37, 'Admin reactivates category via PATCH /api/admin/categories/:id/status (200 OK)', passed, `Status: ${res.status}, Active: ${res.data.category?.active}`);
    }

    // Test 38: Reactivated category is now included in student GET /api/categories
    {
      const res = await makeRequest({
        path: '/api/categories',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const containsTestCat = res.data.categories?.some(c => c.id === testCatId);
      const passed = res.status === 200 && containsTestCat;
      recordTest(38, 'Reactivated category is now available in student complaint categories dropdown', passed, `Categories count: ${res.data.categories?.length}, Contains reactivated cat: ${containsTestCat}`);
    }

    console.log('\n--- SECTION 5: HISTORICAL PRESERVATION & SAFE DELETION ---\n');

    // Test 39: Deleting category with existing complaints is rejected with 409 CATEGORY_IN_USE
    {
      const res = await makeRequest({
        path: '/api/admin/categories/1', // Electrical has complaints
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 409 && res.data.code === 'CATEGORY_IN_USE';
      recordTest(39, 'Historical Preservation: Deleting category with active complaints rejected with CATEGORY_IN_USE (409)', passed, `Status: ${res.status}, Code: ${res.data.code}, Complaints: ${res.data.complaint_count}`);
    }

    // Test 40: Category 1 still exists intact in database
    {
      const cat1 = await CategoryModel.findById(1);
      const passed = cat1 !== null && cat1.name === 'Electrical';
      recordTest(40, 'Category 1 remains intact in database after rejected deletion attempt', passed, `Exists: ${Boolean(cat1)}, Name: ${cat1?.name}`);
    }

    // Test 41: Deleting category with 0 complaints succeeds (200 OK)
    {
      const res = await makeRequest({
        path: `/api/admin/categories/${testCatId}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true;
      if (passed) {
        const idx = createdCategoryIds.indexOf(testCatId);
        if (idx !== -1) createdCategoryIds.splice(idx, 1);
      }
      recordTest(41, 'Deleting newly created category with 0 complaints succeeds (200 OK)', passed, `Status: ${res.status}, Msg: ${res.data.message}`);
    }

    // Test 42: Deleting non-existent category returns 404
    {
      const res = await makeRequest({
        path: '/api/admin/categories/99999',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 404 && res.data.success === false;
      recordTest(42, 'Deleting non-existent category returns 404 Not Found', passed, `Status: ${res.status}, Msg: ${res.data.message}`);
    }

    // Test 43: Delete category by Student rejected with 403 Forbidden
    {
      const res = await makeRequest({
        path: '/api/admin/categories/2',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(43, 'RBAC Defense: Student receives HTTP 403 Forbidden on DELETE /api/admin/categories/:id', passed, `Status: ${res.status}`);
    }

    console.log('\n--- SECTION 6: LIVE ADMIN DASHBOARD STATS & ANALYTICS ---\n');

    // Test 44: GET /api/admin/stats returns comprehensive live database statistics
    let liveStats = null;
    {
      const res = await makeRequest({
        path: '/api/admin/stats',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      liveStats = res.data.stats;
      const hasComplaints = liveStats && liveStats.complaints && typeof liveStats.complaints.total === 'number';
      const hasUsers = liveStats && liveStats.users && typeof liveStats.users.total === 'number';
      const hasPerf = liveStats && liveStats.performance && typeof liveStats.performance.avg_resolution_hours === 'number';
      const hasFeedback = liveStats && liveStats.feedback && typeof liveStats.feedback.avg_rating === 'number';
      const passed = res.status === 200 && res.data.success === true && hasComplaints && hasUsers && hasPerf && hasFeedback;
      recordTest(44, 'Admin retrieves comprehensive system statistics via GET /api/admin/stats (200 OK)', passed, `Status: ${res.status}, Total Complaints: ${liveStats?.complaints?.total}, Total Users: ${liveStats?.users?.total}`);
    }

    // Test 45: GET /api/admin/dashboard parity route returns same statistics
    {
      const res = await makeRequest({
        path: '/api/admin/dashboard',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const passed = res.status === 200 && res.data.success === true && res.data.stats?.complaints?.total === liveStats?.complaints?.total;
      recordTest(45, 'Route parity: GET /api/admin/dashboard returns identical live statistics', passed, `Status: ${res.status}, Complaints match: ${res.data.stats?.complaints?.total === liveStats?.complaints?.total}`);
    }

    // Test 46: Stats verify real database complaint status counts
    {
      const c = liveStats.complaints;
      const verified = c.total === 5 && c.pending === 1 && c.assigned === 1 && c.in_progress === 1 && c.resolved === 1 && c.closed === 1;
      recordTest(46, 'Live complaint stats match exact database records (Total=5, P=1, A=1, IP=1, R=1, C=1)', verified, `Total: ${c.total}, P: ${c.pending}, A: ${c.assigned}, IP: ${c.in_progress}, R: ${c.resolved}, C: ${c.closed}`);
    }

    // Test 47: Stats verify real database user distribution
    {
      const u = liveStats.users;
      const verified = u.total === 8 && u.students === 4 && u.staff === 3 && u.active_staff === 3 && u.admins === 1 && u.active_admins === 1;
      recordTest(47, 'Live user stats match exact database records (Total=8, Students=4, Staff=3, Admins=1)', verified, `Total: ${u.total}, Students: ${u.students}, Staff: ${u.staff}, Admins: ${u.admins}`);
    }

    // Test 48: Stats verify real resident feedback metrics
    {
      const f = liveStats.feedback;
      const verified = f.total === 2 && f.avg_rating === 4.5;
      recordTest(48, 'Live feedback stats match database records (Total Feedback=2, Avg Rating=4.5)', verified, `Total: ${f.total}, Avg Rating: ${f.avg_rating}, Rating 5s: ${f.ratings?.[5]}, Rating 4s: ${f.ratings?.[4]}`);
    }

    // Test 49: Stats verify category distribution and recent complaints list
    {
      const hasCategories = Array.isArray(liveStats.categories) && liveStats.categories.length === 6;
      const hasRecent = Array.isArray(liveStats.recent_complaints) && liveStats.recent_complaints.length === 5;
      const passed = hasCategories && hasRecent;
      recordTest(49, 'Live stats include category distribution (6 categories) and recent complaint activity (5 records)', passed, `Categories count: ${liveStats.categories?.length}, Recent complaints count: ${liveStats.recent_complaints?.length}`);
    }

    // Test 50: RBAC: Student forbidden from GET /api/admin/stats (403)
    {
      const res = await makeRequest({
        path: '/api/admin/stats',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(50, 'RBAC Defense: Student receives HTTP 403 Forbidden on GET /api/admin/stats', passed, `Status: ${res.status}`);
    }

    // Test 51: RBAC: Staff forbidden from GET /api/admin/stats (403)
    {
      const res = await makeRequest({
        path: '/api/admin/stats',
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      const passed = res.status === 403 && res.data.success === false;
      recordTest(51, 'RBAC Defense: Staff receives HTTP 403 Forbidden on GET /api/admin/stats', passed, `Status: ${res.status}`);
    }

    // Test 52: Unauthenticated request rejected with HTTP 401 on GET /api/admin/stats
    {
      const res = await makeRequest({
        path: '/api/admin/stats'
      });
      const passed = res.status === 401 && res.data.success === false;
      recordTest(52, 'Unauthenticated request receives HTTP 401 Unauthorized on GET /api/admin/stats', passed, `Status: ${res.status}, Code: ${res.data.code}`);
    }

    console.log('\n--- SECTION 7: CONTROLLED TEARDOWN & BASELINE INTEGRITY ---\n');

    // Test 53: Clean up any lingering synthetic test items
    {
      for (const catId of createdCategoryIds) {
        await pool.execute(`DELETE FROM complaint_categories WHERE id = ?`, [catId]);
      }
      for (const uId of createdUserIds) {
        await pool.execute(`DELETE FROM users WHERE id = ?`, [uId]);
      }

      recordTest(53, 'Controlled teardown: All synthetic test users and categories purged', true, `Purged categories: ${createdCategoryIds.length}, Purged users: ${createdUserIds.length}`);
    }

    // Test 54: Baseline database integrity preserved
    {
      const [[{ count: complaintCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaints');
      const [[{ count: userCount }]] = await pool.query('SELECT COUNT(*) as count FROM users');
      const [[{ count: assignmentCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaint_assignments');
      const [[{ count: feedbackCount }]] = await pool.query('SELECT COUNT(*) as count FROM feedback');
      const [[{ count: categoryCount }]] = await pool.query('SELECT COUNT(*) as count FROM complaint_categories');

      const passed =
        Number(complaintCount) === 5 &&
        Number(userCount) === 8 &&
        Number(assignmentCount) === 4 &&
        Number(feedbackCount) === 2 &&
        Number(categoryCount) === 6;

      recordTest(
        54,
        'Database baseline integrity preserved (5 complaints, 8 users, 4 assignments, 2 feedback, 6 categories)',
        passed,
        `Complaints: ${complaintCount} (exp 5), Users: ${userCount} (exp 8), Assignments: ${assignmentCount} (exp 4), Feedback: ${feedbackCount} (exp 2), Categories: ${categoryCount} (exp 6)`
      );
    }

  } catch (err) {
    console.error('Fatal Verification Error:', err);
    recordTest(999, 'Unexpected verification exception', false, null, err.message);
  } finally {
    server.close();
    console.log('\nVerification test server closed.\n');
  }

  // Summary Report
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed).length;

  console.log('========================================================================');
  console.log('  SESSION 17 VERIFICATION EXECUTION SUMMARY');
  console.log('========================================================================');
  console.log(`Total Automated Tests : ${totalTests}`);
  console.log(`Tests Passed           : ${passedTests}`);
  console.log(`Tests Failed           : ${failedTests}`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL SESSION 17 TESTS PASSED PERFECTLY!');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED. Inspect details above.');
  }
  console.log('========================================================================\n');

  return failedTests === 0;
}

runSession17Verification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
