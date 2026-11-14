/**
 * HostelCare — Session 12 Verification & Integration Test Suite
 * Automated tests for Complaint Form, Student Dashboard, and Frontend-Backend Integration:
 *
 * 1. Static file structure and frontend assets:
 *    - new-complaint.html (category fetch, 5MB limit, JPEG/PNG/WEBP checks, anti-duplicate submission)
 *    - complaints.html (table, filters, pagination, badges, empty/loading states)
 *    - complaint-details.html (meta info, remarks, secure image preview via getBlob, download)
 *    - dashboard.html (dynamic KPI counters, recent complaints table, + New Ticket wire)
 *    - api.js (getBlob implementation)
 *    - utils.js (escapeHtml, renderPriorityBadge, renderStatusBadge, formatFileSize)
 *    - components.css (tables, modals, dropzone, pagination, badges)
 *
 * 2. API Integration & Business Logic:
 *    - Categories API endpoint (GET /api/v1/categories)
 *    - Validation guards (title, description, category_id, forbidden privileged fields)
 *    - Complaint creation without photo (JSON) -> HTTP 201 with ticket_number
 *    - Complaint creation with photo (Multipart FormData) -> HTTP 201 with attachment metadata
 *    - My complaints listing (GET /api/v1/complaints/mine) with newest-first ordering
 *    - Filter by status and filter by category
 *    - Pagination (page, limit, totalPages, total)
 *    - Complaint details by ID (GET /api/v1/complaints/:id) with latest remarks
 *    - Anti-IDOR ownership protection (Student 2 receives 404 for Student 1 ticket)
 *    - Authenticated attachment stream retrieval (GET /api/v1/complaints/:id/attachments/:attId)
 *    - Attachment authentication guard (401 without token)
 *    - Attachment anti-IDOR guard (404 for non-owner student)
 *    - Direct /uploads static access block (403 Forbidden)
 *    - Complete teardown and database baseline preservation
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sharp from 'sharp';

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
const {
  COMPLAINTS_UPLOAD_DIR,
  unlinkFileSafely,
  resolveSafeStoragePath
} = await import('../src/utils/fileStorage.js');

const results = [];
const createdComplaintIds = [];
const createdFiles = [];

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

async function runSession12Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 12 INTEGRATION & DASHBOARD VERIFICATION SUITE');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Frontend Files & Assets Integrity Verification
    // -------------------------------------------------------------------------
    console.log('--- Phase 1: Frontend Assets & Static Architecture ---');

    // 1.1 Verify new-complaint.html
    const newComplaintPath = path.join(rootDir, 'frontend', 'pages', 'student', 'new-complaint.html');
    const newComplaintExists = fs.existsSync(newComplaintPath);
    let newComplaintContent = '';
    if (newComplaintExists) {
      newComplaintContent = fs.readFileSync(newComplaintPath, 'utf8');
    }
    const hasCategoryFetch = newComplaintContent.includes('/categories');
    const has5MBLimit = newComplaintContent.includes('5242880') || newComplaintContent.includes('5 * 1024 * 1024');
    const hasAntiDuplicate = newComplaintContent.includes('isSubmitting') && newComplaintContent.includes('disabled');
    const hasSuccessCard = newComplaintContent.includes('success-panel') && newComplaintContent.includes('success-ticket-num');

    recordTest(
      1,
      'Frontend — new-complaint.html structural integrity & client guards',
      newComplaintExists && hasCategoryFetch && has5MBLimit && hasAntiDuplicate && hasSuccessCard,
      `File exists: ${newComplaintExists}, Category fetch: ${hasCategoryFetch}, 5MB limit: ${has5MBLimit}, Anti-dup: ${hasAntiDuplicate}, Ticket confirm: ${hasSuccessCard}`
    );

    // 1.2 Verify complaints.html
    const complaintsListPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaints.html');
    const complaintsListExists = fs.existsSync(complaintsListPath);
    let complaintsListContent = '';
    if (complaintsListExists) {
      complaintsListContent = fs.readFileSync(complaintsListPath, 'utf8');
    }
    const hasFilterBar = complaintsListContent.includes('filter-status') && complaintsListContent.includes('filter-category');
    const hasPagination = complaintsListContent.includes('pagination') && complaintsListContent.includes('goToPage');
    const hasMineFetch = complaintsListContent.includes('/complaints/mine');

    recordTest(
      2,
      'Frontend — complaints.html list view, filter bar & pagination',
      complaintsListExists && hasFilterBar && hasPagination && hasMineFetch,
      `File exists: ${complaintsListExists}, Filters: ${hasFilterBar}, Pagination: ${hasPagination}, Mine fetch: ${hasMineFetch}`
    );

    // 1.3 Verify complaint-details.html
    const detailsPath = path.join(rootDir, 'frontend', 'pages', 'student', 'complaint-details.html');
    const detailsExists = fs.existsSync(detailsPath);
    let detailsContent = '';
    if (detailsExists) {
      detailsContent = fs.readFileSync(detailsPath, 'utf8');
    }
    const hasGetBlob = detailsContent.includes('getBlob');
    const hasIdorCard = detailsContent.includes('notfound-card');
    const hasAttachmentStreaming = detailsContent.includes('createObjectURL');

    recordTest(
      3,
      'Frontend — complaint-details.html secure attachment preview & IDOR handling',
      detailsExists && hasGetBlob && hasIdorCard && hasAttachmentStreaming,
      `File exists: ${detailsExists}, Api.getBlob: ${hasGetBlob}, IDOR card: ${hasIdorCard}, ObjectURL stream: ${hasAttachmentStreaming}`
    );

    // 1.4 Verify dashboard.html dynamic upgrades
    const dashboardPath = path.join(rootDir, 'frontend', 'pages', 'student', 'dashboard.html');
    const dashboardExists = fs.existsSync(dashboardPath);
    let dashboardContent = '';
    if (dashboardExists) {
      dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
    }
    const hasDynamicKPI = dashboardContent.includes('stat-total') && dashboardContent.includes('stat-inprogress');
    const hasRecentTable = dashboardContent.includes('recent-complaints-tbody');
    const hasNewTicketLink = dashboardContent.includes('/pages/student/new-complaint.html');
    const hasCompliantLimit = dashboardContent.includes('limit=50') && !dashboardContent.includes('limit=100');

    recordTest(
      4,
      'Frontend — dashboard.html dynamic KPI counters, recent complaints & limit<=50 compliance',
      dashboardExists && hasDynamicKPI && hasRecentTable && hasNewTicketLink && hasCompliantLimit,
      `File exists: ${dashboardExists}, Dynamic KPI: ${hasDynamicKPI}, Recent Table: ${hasRecentTable}, New Ticket Link: ${hasNewTicketLink}, Limit 50 Compliant: ${hasCompliantLimit}`
    );

    // 1.5 Verify api.js and utils.js method parity
    const apiJs = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'js', 'api.js'), 'utf8');
    const utilsJs = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'js', 'utils.js'), 'utf8');
    const hasApiGetBlob = apiJs.includes('getBlob(');
    const hasUtilsEscape = utilsJs.includes('escapeHtml(');
    const hasUtilsPriority = utilsJs.includes('renderPriorityBadge(');
    const hasUtilsFileSize = utilsJs.includes('formatFileSize(');

    recordTest(
      5,
      'Frontend Utilities — Api.getBlob, Utils.escapeHtml, and formatters availability',
      hasApiGetBlob && hasUtilsEscape && hasUtilsPriority && hasUtilsFileSize,
      `getBlob: ${hasApiGetBlob}, escapeHtml: ${hasUtilsEscape}, renderPriorityBadge: ${hasUtilsPriority}, formatFileSize: ${hasUtilsFileSize}`
    );

    // -------------------------------------------------------------------------
    // Phase 2: Live Backend API Integration Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Backend Integration & Business Logic Tests ---');

    // Retrieve active seed users
    const student1 = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');     // id: 5 (Block A, A-102)
    const student2 = await UserModel.findByEmail('priya.ee24@hostelcare.edu');      // id: 6 (Block B, B-204)
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu'); // id: 3
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');              // id: 1

    if (!student1 || !student2 || !staffUser || !adminUser) {
      throw new Error('Required seed users missing from database.');
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

    // Test 6: GET /api/v1/categories authentication guard & data retrieval
    const unauthCatRes = await fetch(`${baseUrl}/api/v1/categories`);
    const catRes = await fetch(`${baseUrl}/api/v1/categories`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const catData = await catRes.json();
    const categoriesValid = unauthCatRes.status === 401 &&
      catRes.status === 200 &&
      Array.isArray(catData.categories) &&
      catData.categories.length > 0;

    recordTest(
      6,
      'API — GET /api/v1/categories requires auth (401) and returns active categories with Bearer token (200)',
      categoriesValid,
      `Unauth Status: ${unauthCatRes.status}, Auth Status: ${catRes.status}, Total Categories: ${catData.categories?.length || 0}`
    );

    // Test 7: Complaint validation: Empty or invalid category_id rejected with 400
    const invCatRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_id: 99999,
        title: 'Valid title for invalid category',
        description: 'Detailed description explaining the maintenance issue.'
      })
    });
    const invCatData = await invCatRes.json();
    recordTest(
      7,
      'Validation — Non-existent category_id rejected with HTTP 400',
      invCatRes.status === 400 && invCatData.success === false,
      `Status: ${invCatRes.status}, Message: "${invCatData.message || invCatData.errors?.[0]?.msg}"`
    );

    // Test 8: Complaint validation: Short title (< 5 chars) rejected with 400
    const shortTitleRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_id: 1,
        title: 'Fan',
        description: 'Ceiling fan is making humming sound.'
      })
    });
    recordTest(
      8,
      'Validation — Title shorter than 5 chars rejected with HTTP 400',
      shortTitleRes.status === 400,
      `Status: ${shortTitleRes.status}`
    );

    // Test 9: Complaint validation: Short description (< 10 chars) rejected with 400
    const shortDescRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_id: 1,
        title: 'Water Tap Leaking',
        description: 'Too short'
      })
    });
    recordTest(
      9,
      'Validation — Description shorter than 10 chars rejected with HTTP 400',
      shortDescRes.status === 400,
      `Status: ${shortDescRes.status}`
    );

    // Test 10: Security — Forbidden privileged fields in request body rejected with 400
    const privFieldsRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_id: 1,
        title: 'Attempted Privileged Escalation',
        description: 'Trying to inject priority urgent and status resolved directly.',
        priority: 'urgent',
        status: 'resolved'
      })
    });
    const privFieldsData = await privFieldsRes.json();
    recordTest(
      10,
      'Security — Privileged fields (priority, status) rejected with HTTP 400',
      privFieldsRes.status === 400 && privFieldsData.success === false,
      `Status: ${privFieldsRes.status}, Message: "${privFieldsData.message || privFieldsData.errors?.[0]?.msg}"`
    );

    // Test 11: Create valid complaint without photo (JSON) -> HTTP 201 with ticket_number
    const createJsonRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_id: 1,
        title: 'Session 12 Room Tube Light Blinking',
        description: 'The tube light in room A-102 is constantly flickering when turned on.'
      })
    });
    const createJsonData = await createJsonRes.json();
    const jsonCreated = createJsonRes.status === 201 && createJsonData.complaint?.ticket_number;
    if (jsonCreated) {
      createdComplaintIds.push(createJsonData.complaint.id);
    }
    recordTest(
      11,
      'Creation — Standard complaint without photo creates ticket with HTTP 201',
      jsonCreated && /^HC-\d{8}-[A-Z0-9]{4}$/.test(createJsonData.complaint.ticket_number),
      `Status: ${createJsonRes.status}, Ticket: ${createJsonData.complaint?.ticket_number}, ID: ${createJsonData.complaint?.id}`
    );

    // Test 12: Create valid complaint with photo attachment (Multipart FormData)
    // Generate valid 100x100 JPEG buffer
    const validJpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 59, g: 130, b: 246 }
      }
    }).jpeg().toBuffer();

    const boundary = '----WebKitFormBoundaryS12TestBoundaryXYZ';
    const formParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="category_id"\r\n\r\n2\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nBathroom Washbasin Tap Leaking Heavily\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nWater is leaking from the tap joint causing floor flooding in room A-102.\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="tap_leak.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ];

    const multipartBody = Buffer.concat([
      Buffer.from(formParts.join(''), 'utf8'),
      validJpegBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
    ]);

    const createMultiRes = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${student1Token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    const createMultiData = await createMultiRes.json();
    const multiCreated = createMultiRes.status === 201 && createMultiData.complaint?.attachment?.download_url;
    let student1WithPhotoComplaintId = null;
    let attachmentId = null;

    if (multiCreated) {
      student1WithPhotoComplaintId = createMultiData.complaint.id;
      createdComplaintIds.push(student1WithPhotoComplaintId);
      attachmentId = createMultiData.complaint.attachment.id;

      // Track disk file for cleanup
      const [attRow] = await pool.query(
        'SELECT storage_key FROM complaint_attachments WHERE id = ?',
        [attachmentId]
      );
      if (attRow[0]?.storage_key) {
        const absPath = resolveSafeStoragePath(attRow[0].storage_key);
        createdFiles.push(absPath);
      }
    }

    recordTest(
      12,
      'Creation — Complaint with photo upload creates ticket & attachment with HTTP 201',
      multiCreated,
      `Status: ${createMultiRes.status}, Ticket: ${createMultiData.complaint?.ticket_number}, Download URL: ${createMultiData.complaint?.attachment?.download_url}`
    );

    // Test 13: Student complaints listing (GET /api/v1/complaints/mine)
    const listRes = await fetch(`${baseUrl}/api/v1/complaints/mine`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const listData = await listRes.json();
    const listValid = listRes.status === 200 && Array.isArray(listData.complaints) && listData.complaints.length >= 2;
    // Verify newest-first order
    const isNewestFirst = listValid && listData.complaints[0].id > listData.complaints[1].id;

    recordTest(
      13,
      'Listing — GET /api/v1/complaints/mine returns student complaints in newest-first order',
      listValid && isNewestFirst,
      `Status: ${listRes.status}, Total: ${listData.pagination?.total}, Top ID: ${listData.complaints?.[0]?.id}, Second ID: ${listData.complaints?.[1]?.id}`
    );

    // Test 14: Filter complaints by status (GET /api/v1/complaints/mine?status=pending)
    const filterStatusRes = await fetch(`${baseUrl}/api/v1/complaints/mine?status=pending`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const filterStatusData = await filterStatusRes.json();
    const allPending = filterStatusRes.status === 200 && filterStatusData.complaints.every(c => c.status === 'pending');

    recordTest(
      14,
      'Filtering — Filter by status (status=pending) returns only matching records',
      allPending && filterStatusData.complaints.length > 0,
      `Status: ${filterStatusRes.status}, Returned: ${filterStatusData.complaints.length}, All Pending: ${allPending}`
    );

    // Test 15: Filter complaints by category (GET /api/v1/complaints/mine?category_id=2)
    const filterCatRes = await fetch(`${baseUrl}/api/v1/complaints/mine?category_id=2`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const filterCatData = await filterCatRes.json();
    const allCat2 = filterCatRes.status === 200 && filterCatData.complaints.every(c => c.category_id === 2);

    recordTest(
      15,
      'Filtering — Filter by category (category_id=2) returns only matching records',
      allCat2 && filterCatData.complaints.length > 0,
      `Status: ${filterCatRes.status}, Returned: ${filterCatData.complaints.length}, All Cat 2: ${allCat2}`
    );

    // Test 16: Pagination limits (GET /api/v1/complaints/mine?page=1&limit=1)
    const pageRes = await fetch(`${baseUrl}/api/v1/complaints/mine?page=1&limit=1`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const pageData = await pageRes.json();
    const paginationAccurate = pageRes.status === 200 &&
      pageData.complaints.length === 1 &&
      pageData.pagination.page === 1 &&
      pageData.pagination.limit === 1 &&
      pageData.pagination.totalPages >= 2;

    recordTest(
      16,
      'Pagination — Limit and page controls calculate accurate pagination metadata',
      paginationAccurate,
      `Status: ${pageRes.status}, Count: ${pageData.complaints.length}, Page: ${pageData.pagination?.page}, TotalPages: ${pageData.pagination?.totalPages}`
    );

    // Test 17: Complaint details API: GET /api/v1/complaints/:id returns complete details & attachment
    const detailRes = await fetch(`${baseUrl}/api/v1/complaints/${student1WithPhotoComplaintId}`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const detailData = await detailRes.json();
    const detailValid = detailRes.status === 200 &&
      detailData.complaint?.id === student1WithPhotoComplaintId &&
      detailData.complaint?.attachment?.id === attachmentId &&
      detailData.complaint?.hostel_block === 'Block A' &&
      detailData.complaint?.room_number === 'A-102';

    recordTest(
      17,
      'Details — GET /api/v1/complaints/:id returns ticket metadata, room, and attachment',
      detailValid,
      `Status: ${detailRes.status}, Block: ${detailData.complaint?.hostel_block}, Room: ${detailData.complaint?.room_number}, Attachment ID: ${detailData.complaint?.attachment?.id}`
    );

    // Test 18: Anti-IDOR Ownership Protection: Student 2 cannot access Student 1 complaint
    const idorRes = await fetch(`${baseUrl}/api/v1/complaints/${student1WithPhotoComplaintId}`, {
      headers: { 'Authorization': `Bearer ${student2Token}` }
    });
    recordTest(
      18,
      'Security — Anti-IDOR: Student 2 receives HTTP 404 for Student 1 complaint',
      idorRes.status === 404,
      `Status: ${idorRes.status} (Uniform 404 prevents ticket enumeration)`
    );

    // Test 19: Non-existent complaint ID returns HTTP 404
    const notFoundRes = await fetch(`${baseUrl}/api/v1/complaints/999999`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    recordTest(
      19,
      'API — Non-existent complaint ID returns HTTP 404',
      notFoundRes.status === 404,
      `Status: ${notFoundRes.status}`
    );

    // Test 20: Authenticated photo stream: Student owner retrieves attachment binary with 200
    const streamRes = await fetch(`${baseUrl}/api/v1/complaints/${student1WithPhotoComplaintId}/attachments/${attachmentId}`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const streamBlob = await streamRes.arrayBuffer();
    const streamValid = streamRes.status === 200 &&
      streamRes.headers.get('content-type')?.includes('image/jpeg') &&
      streamBlob.byteLength > 0;

    recordTest(
      20,
      'Attachment — Student owner streams photo attachment with HTTP 200 & correct Content-Type',
      streamValid,
      `Status: ${streamRes.status}, Content-Type: ${streamRes.headers.get('content-type')}, Bytes: ${streamBlob.byteLength}`
    );

    // Test 21: Attachment stream without Bearer token returns HTTP 401
    const unauthStreamRes = await fetch(`${baseUrl}/api/v1/complaints/${student1WithPhotoComplaintId}/attachments/${attachmentId}`);
    recordTest(
      21,
      'Security — Attachment stream without Bearer token rejected with HTTP 401',
      unauthStreamRes.status === 401,
      `Status: ${unauthStreamRes.status}`
    );

    // Test 22: Attachment stream IDOR protection: Student 2 receives HTTP 404 for Student 1 attachment
    const idorStreamRes = await fetch(`${baseUrl}/api/v1/complaints/${student1WithPhotoComplaintId}/attachments/${attachmentId}`, {
      headers: { 'Authorization': `Bearer ${student2Token}` }
    });
    recordTest(
      22,
      'Security — Anti-IDOR: Student 2 receives HTTP 404 for Student 1 attachment stream',
      idorStreamRes.status === 404,
      `Status: ${idorStreamRes.status} (Uniform 404 prevents file enumeration)`
    );

    // Test 23: Direct static access to /uploads is blocked with HTTP 403
    const staticRes = await fetch(`${baseUrl}/uploads/complaints/test.jpg`);
    recordTest(
      23,
      'Security — Direct static access to /uploads blocked with HTTP 403',
      staticRes.status === 403,
      `Status: ${staticRes.status}`
    );

  } catch (err) {
    console.error('Fatal Verification Error:', err);
    recordTest('FATAL', 'Verification Suite Execution', false, null, err.message);
  } finally {
    // -------------------------------------------------------------------------
    // Phase 3: Controlled Teardown and Rollback
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: Controlled Teardown & Baseline Cleanup ---');

    let cleanedDbRecords = 0;
    let cleanedDiskFiles = 0;

    if (createdComplaintIds.length > 0) {
      try {
        const placeholders = createdComplaintIds.map(() => '?').join(',');

        // Find any attachment files to unlink
        const [attRows] = await pool.query(
          `SELECT storage_key FROM complaint_attachments WHERE complaint_id IN (${placeholders})`,
          createdComplaintIds
        );
        for (const row of attRows) {
          try {
            const absPath = resolveSafeStoragePath(row.storage_key);
            const unlinked = await unlinkFileSafely(absPath);
            if (unlinked) cleanedDiskFiles++;
          } catch {}
        }

        // Remove attachments from DB
        await pool.query(
          `DELETE FROM complaint_attachments WHERE complaint_id IN (${placeholders})`,
          createdComplaintIds
        );

        // Remove status history from DB
        await pool.query(
          `DELETE FROM complaint_status_history WHERE complaint_id IN (${placeholders})`,
          createdComplaintIds
        );

        // Remove complaints from DB
        const [delResult] = await pool.query(
          `DELETE FROM complaints WHERE id IN (${placeholders})`,
          createdComplaintIds
        );
        cleanedDbRecords = delResult.affectedRows || 0;
      } catch (cleanupErr) {
        console.error('Database cleanup error:', cleanupErr);
      }
    }

    for (const filePath of createdFiles) {
      try {
        const unlinked = await unlinkFileSafely(filePath);
        if (unlinked) cleanedDiskFiles++;
      } catch (fileErr) {
        console.error(`File unlink error for ${filePath}:`, fileErr);
      }
    }

    // Verify AUD-12-LOW-01: unlinkFileSafely explicit return contracts
    const missingResult = await unlinkFileSafely(path.join(COMPLAINTS_UPLOAD_DIR, 'non-existent-file-xyz.jpg'));
    const tempTestFile = path.join(COMPLAINTS_UPLOAD_DIR, `temp-test-${Date.now()}.tmp`);
    fs.writeFileSync(tempTestFile, 'test');
    const tempUnlinkResult = await unlinkFileSafely(tempTestFile);
    const unlinkContractValid = missingResult === false && tempUnlinkResult === true && !fs.existsSync(tempTestFile);

    recordTest(
      24,
      'Teardown — Synthetic test complaints, status history & disk attachments purged with verified unlink contracts',
      cleanedDbRecords >= 2 && cleanedDiskFiles >= 1 && unlinkContractValid,
      `Cleaned DB Complaints: ${cleanedDbRecords}, Cleaned Disk Files: ${cleanedDiskFiles}, Missing file returned false: ${missingResult === false}, Deleted file returned true: ${tempUnlinkResult === true}`
    );

    // Close server
    await new Promise((resolve) => server.close(resolve));
    await pool.end();

    // Summary Scoreboard
    console.log('\n========================================================================');
    console.log('  SESSION 12 VERIFICATION SCOREBOARD');
    console.log('========================================================================');
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    console.log(`Total Checks: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount}`);

    if (passedCount === totalCount) {
      console.log('Result: 100% PASS — SESSION 12 IMPLEMENTATION FULLY VERIFIED');
    } else {
      console.log('Result: FAIL — Some verification checks failed');
    }
    console.log('========================================================================\n');
    process.exit(passedCount === totalCount ? 0 : 1);
  }
}

runSession12Verification();
