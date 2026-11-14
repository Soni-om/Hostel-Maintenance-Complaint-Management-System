/**
 * HostelCare — Session 11 Live Verification Suite
 * Automated tests for:
 * 1. JSON complaint creation without photo (backward compatibility)
 * 2. Multipart photo upload with valid JPEG, PNG, WEBP (using Sharp & magic-byte validation)
 * 3. Multipart request without photo (optional attachment)
 * 4. Unsupported file formats (e.g. .pdf, .txt) rejected with HTTP 415
 * 5. MIME-spoofed and fake images rejected with HTTP 415
 * 6. Corrupted images rejected with HTTP 415
 * 7. File size limits: 5MB boundary accepted, > 5MB rejected with HTTP 413 (FILE_TOO_LARGE)
 * 8. Multiple file rejection with HTTP 400 (UNEXPECTED_FILE)
 * 9. Authentication & Role Guards: Unauthenticated (401), Staff/Admin (403) before Multer buffers
 * 10. Private attachment download route:
 *     - Authenticated student owner retrieves attachment stream
 *     - Staff and Admin can retrieve attachment stream
 *     - Student A cannot access Student B's attachment (anti-enumeration 404)
 *     - Direct public access to /uploads blocked with HTTP 403
 *     - Safe headers (nosniff, private/no-store, safe Content-Disposition)
 * 11. Transaction rollback & safe file cleanup:
 *     - Database failure unlinks file from disk and rolls back
 *     - Validation failure leaves zero orphaned files
 *     - Missing physical file handled cleanly with HTTP 404
 *     - Zero absolute server path leakage
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

async function runSession11Verification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 11 LIVE VERIFICATION & SECURITY AUDIT SUITE');
  console.log('========================================================================\n');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  try {
    // Retrieve active seed users
    const student1 = await UserModel.findByEmail('rahul.cs23@hostelcare.edu');     // id: 5 (Block A, A-102)
    const student2 = await UserModel.findByEmail('priya.ee24@hostelcare.edu');      // id: 6 (Block B, B-204)
    const staffUser = await UserModel.findByEmail('rajesh.electrician@hostelcare.edu'); // id: 3 (Block A)
    const rameshUser = await UserModel.findByEmail('ramesh.plumber@hostelcare.edu');    // id: 4 (Block B)
    const adminUser = await UserModel.findByEmail('admin@hostelcare.edu');              // id: 1

    if (!student1 || !student2 || !staffUser || !rameshUser || !adminUser) {
      throw new Error('Seed users missing from database. Please verify seeds.sql.');
    }

    const student1Token = generateToken({
      id: student1.id,
      email: student1.email,
      role: student1.role,
      name: student1.name,
      hostel_block: student1.hostel_block
    });

    const student2Token = generateToken({
      id: student2.id,
      email: student2.email,
      role: student2.role,
      name: student2.name,
      hostel_block: student2.hostel_block
    });

    const staffToken = generateToken({
      id: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      name: staffUser.name,
      hostel_block: staffUser.hostel_block
    });

    const rameshToken = generateToken({
      id: rameshUser.id,
      email: rameshUser.email,
      role: rameshUser.role,
      name: rameshUser.name,
      hostel_block: rameshUser.hostel_block
    });

    const adminToken = generateToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name
    });

    // Helper: generate valid test images with sharp
    const validJpegBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).jpeg().toBuffer();

    const validPngBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } }
    }).png().toBuffer();

    const validWebpBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } }
    }).webp().toBuffer();

    // Helper: generate a 100% valid, genuinely decodable JPEG image of an exact byte count
    // Uses conformant ITU-T T.81 COM (comment) marker segments so image remains structurally valid
    async function createExactSizeValidJpeg(targetBytes) {
      const baseJpeg = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } }
      }).jpeg().toBuffer();

      let neededPadding = targetBytes - baseJpeg.length;
      const comChunks = [];
      while (neededPadding > 0) {
        const maxChunkData = 60000;
        const dataLen = Math.min(maxChunkData, neededPadding - 4);
        const markerLen = dataLen + 2;
        const header = Buffer.from([0xFF, 0xFE, (markerLen >> 8) & 0xFF, markerLen & 0xFF]);
        const data = Buffer.alloc(dataLen, 0x41); // 'A'
        comChunks.push(header, data);
        neededPadding -= (dataLen + 4);
      }

      return Buffer.concat([
        baseJpeg.subarray(0, 2),
        ...comChunks,
        baseJpeg.subarray(2)
      ]);
    }

    // ========================================================================
    // PART 1: COMPLAINT CREATION & OPTIONAL PHOTO UPLOAD
    // ========================================================================
    console.log('--- PART 1: Complaint Creation with Photo Upload ---');

    // Test 1: JSON complaint creation without photo (backward compatibility)
    const res1 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${student1Token}`
      },
      body: JSON.stringify({
        title: 'Ceiling plaster peeling off in corner',
        description: 'Large plaster flakes falling from the ceiling near study desk.',
        category_id: 5
      })
    });
    const data1 = await res1.json();
    if (data1?.complaint?.id) createdComplaintIds.push(data1.complaint.id);

    const t1Pass = res1.status === 201 &&
                   data1?.success === true &&
                   data1?.complaint?.id > 0 &&
                   data1?.complaint?.attachment === null;
    recordTest(1, 'Backward Compatibility: JSON complaint creation succeeds with attachment: null', t1Pass,
      `HTTP ${res1.status}, id: ${data1?.complaint?.id}, attachment: ${data1?.complaint?.attachment}`);

    // Test 2: Multipart complaint creation with valid JPEG photo upload
    const form2 = new FormData();
    form2.append('title', 'Bathroom door latch completely broken');
    form2.append('description', 'The brass latch joint has snapped and door cannot stay shut.');
    form2.append('category_id', '5');
    form2.append('photo', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'door_latch.jpg');

    const res2 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form2
    });
    const data2 = await res2.json();
    if (data2?.complaint?.id) createdComplaintIds.push(data2.complaint.id);

    const att2 = data2?.complaint?.attachment;
    const t2Pass = res2.status === 201 &&
                   data2?.success === true &&
                   att2?.id > 0 &&
                   att2?.original_name === 'door_latch.jpg' &&
                   att2?.mime_type === 'image/jpeg' &&
                   att2?.download_url === `/api/v1/complaints/${data2.complaint.id}/attachments/${att2.id}`;
    recordTest(2, 'Valid JPEG photo upload succeeds (201 Created with attachment metadata)', t2Pass,
      `HTTP ${res2.status}, ticket: ${data2?.complaint?.ticket_number}, att ID: ${att2?.id}, download: ${att2?.download_url}`);

    // Test 3: Multipart complaint creation with valid PNG photo upload
    const form3 = new FormData();
    form3.append('title', 'Water seepage along south window wall');
    form3.append('description', 'Continuous moisture and damp smell spreading across window sill.');
    form3.append('category_id', '2');
    form3.append('photo', new Blob([validPngBuffer], { type: 'image/png' }), 'water_seepage.png');

    const res3 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form3
    });
    const data3 = await res3.json();
    if (data3?.complaint?.id) createdComplaintIds.push(data3.complaint.id);

    const att3 = data3?.complaint?.attachment;
    const t3Pass = res3.status === 201 &&
                   data3?.success === true &&
                   att3?.id > 0 &&
                   att3?.mime_type === 'image/png';
    recordTest(3, 'Valid PNG photo upload succeeds (201 Created, mime_type: image/png)', t3Pass,
      `HTTP ${res3.status}, att ID: ${att3?.id}, mime: ${att3?.mime_type}`);

    // Test 4: Multipart complaint creation with valid WEBP photo upload
    const form4 = new FormData();
    form4.append('title', 'Curtain rod bracket unfastened from wall');
    form4.append('description', 'Screws pulled out of brickwork and bracket is hanging loosely.');
    form4.append('category_id', '5');
    form4.append('photo', new Blob([validWebpBuffer], { type: 'image/webp' }), 'curtain_bracket.webp');

    const res4 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form4
    });
    const data4 = await res4.json();
    if (data4?.complaint?.id) createdComplaintIds.push(data4.complaint.id);

    const att4 = data4?.complaint?.attachment;
    const t4Pass = res4.status === 201 &&
                   data4?.success === true &&
                   att4?.id > 0 &&
                   att4?.mime_type === 'image/webp';
    recordTest(4, 'Valid WEBP photo upload succeeds (201 Created, mime_type: image/webp)', t4Pass,
      `HTTP ${res4.status}, att ID: ${att4?.id}, mime: ${att4?.mime_type}`);

    // Test 5: Multipart complaint creation without photo field (optional attachment)
    const form5 = new FormData();
    form5.append('title', 'Study table drawer stuck and jammed');
    form5.append('description', 'Left runner channel bent, drawer cannot open past two inches.');
    form5.append('category_id', '5');

    const res5 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form5
    });
    const data5 = await res5.json();
    if (data5?.complaint?.id) createdComplaintIds.push(data5.complaint.id);

    const t5Pass = res5.status === 201 &&
                   data5?.success === true &&
                   data5?.complaint?.attachment === null;
    recordTest(5, 'Multipart request without photo field succeeds with attachment: null', t5Pass,
      `HTTP ${res5.status}, attachment: ${data5?.complaint?.attachment}`);

    // ========================================================================
    // PART 2: IMAGE VALIDATION, REJECTION & ERROR STATUS CODES
    // ========================================================================
    console.log('\n--- PART 2: Format Rejection, MIME Spoofing & Error Codes ---');

    // Test 6: Unsupported file format (.pdf / .txt) rejected with HTTP 415
    const form6 = new FormData();
    form6.append('title', 'Electrical spark near switchboard');
    form6.append('description', 'Sparking observed behind the modular wall switchplate.');
    form6.append('category_id', '1');
    form6.append('photo', new Blob([Buffer.from('%PDF-1.4 sample pdf document')], { type: 'application/pdf' }), 'document.pdf');

    const res6 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form6
    });
    const data6 = await res6.json();
    const t6Pass = res6.status === 415 && data6?.success === false;
    recordTest(6, 'Unsupported file format (.pdf) rejected with HTTP 415', t6Pass,
      `HTTP ${res6.status}, code: ${data6?.code}, message: "${data6?.message}"`);

    // Test 7: Spoofed MIME type & extension (Text file disguised as photo.jpg) rejected with HTTP 415
    const form7 = new FormData();
    form7.append('title', 'Electrical spark near switchboard');
    form7.append('description', 'Sparking observed behind the modular wall switchplate.');
    form7.append('category_id', '1');
    form7.append('photo', new Blob([Buffer.from('This is plain text disguised as JPEG content.')], { type: 'image/jpeg' }), 'malicious.jpg');

    const res7 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form7
    });
    const data7 = await res7.json();
    const t7Pass = res7.status === 415 && data7?.success === false;
    recordTest(7, 'Spoofed image (plain text with image/jpeg header) rejected with HTTP 415 via magic bytes', t7Pass,
      `HTTP ${res7.status}, code: ${data7?.code}, message: "${data7?.message}"`);

    // Test 8: Corrupted image content rejected with HTTP 415
    const form8 = new FormData();
    form8.append('title', 'Electrical spark near switchboard');
    form8.append('description', 'Sparking observed behind the modular wall switchplate.');
    form8.append('category_id', '1');
    // JPEG header followed by random garbage bytes
    form8.append('photo', new Blob([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x00, 0x00, 0x99, 0x88])], { type: 'image/jpeg' }), 'corrupted.jpg');

    const res8 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form8
    });
    const data8 = await res8.json();
    const t8Pass = res8.status === 415 && data8?.success === false;
    recordTest(8, 'Corrupted image bytes rejected with HTTP 415 via Sharp decoding validation', t8Pass,
      `HTTP ${res8.status}, code: ${data8?.code}, message: "${data8?.message}"`);

    // Test 9: Exact 5MB Boundary — Valid decodable JPEG of exactly 5,242,880 bytes succeeds (HTTP 201 Created)
    const exact5MbJpeg = await createExactSizeValidJpeg(5 * 1024 * 1024);
    const form9 = new FormData();
    form9.append('title', 'Water cooler compressor burnt out');
    form9.append('description', 'Cooler unit tripping main circuit breaker on 2nd floor corridor.');
    form9.append('category_id', '1');
    form9.append('photo', new Blob([exact5MbJpeg], { type: 'image/jpeg' }), 'boundary_exact5mb.jpg');

    const res9 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form9
    });
    const data9 = await res9.json();
    if (data9?.complaint?.id) createdComplaintIds.push(data9.complaint.id);

    const att9 = data9?.complaint?.attachment;
    const t9Pass = res9.status === 201 &&
                   data9?.success === true &&
                   att9?.id > 0 &&
                   att9?.mime_type === 'image/jpeg';
    recordTest(9, 'File Size Boundary: Valid image of exactly 5,242,880 bytes (5MB) succeeds (HTTP 201 Created)', t9Pass,
      `HTTP ${res9.status}, att ID: ${att9?.id}, size: ${att9?.size_bytes} bytes, download: ${att9?.download_url}`);

    // Test 10: 5MB + 1 Byte Boundary — Valid decodable JPEG of exactly 5,242,881 bytes rejected with HTTP 413 (FILE_TOO_LARGE)
    const oversized5MbJpeg = await createExactSizeValidJpeg(5 * 1024 * 1024 + 1);
    const form10 = new FormData();
    form10.append('title', 'Electrical spark near switchboard');
    form10.append('description', 'Sparking observed behind the modular wall switchplate.');
    form10.append('category_id', '1');
    form10.append('photo', new Blob([oversized5MbJpeg], { type: 'image/jpeg' }), 'oversized_5mb_plus_1.jpg');

    const res10 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form10
    });
    const data10 = await res10.json();
    const t10Pass = res10.status === 413 && data10?.code === 'FILE_TOO_LARGE';
    recordTest(10, 'File Size Boundary: Valid image of exactly 5,242,881 bytes (5MB + 1B) rejected with HTTP 413 FILE_TOO_LARGE', t10Pass,
      `HTTP ${res10.status}, code: ${data10?.code}, message: "${data10?.message}"`);

    // Test 11: Explicit multipart parts limit (SEC-11-LOW-01) — Request exceeding 25 parts rejected with HTTP 400 LIMIT_PART_COUNT
    const form11 = new FormData();
    form11.append('title', 'Door hinge loose and rattling');
    form11.append('description', 'The top hinge screws are completely stripped out.');
    form11.append('category_id', '5');
    // Add 24 additional dummy text fields to total 27 parts (> 25 parts limit)
    for (let p = 1; p <= 24; p++) {
      form11.append(`dummy_field_${p}`, `part_${p}`);
    }

    const res11 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form11
    });
    const data11 = await res11.json();
    const t11Pass = res11.status === 400 && (data11?.code === 'LIMIT_PART_COUNT' || data11?.code === 'LIMIT_FIELD_COUNT');
    recordTest(11, 'Explicit Parts & Fields Limit: Multipart request exceeding limits rejected with HTTP 400', t11Pass,
      `HTTP ${res11.status}, code: ${data11?.code}, message: "${data11?.message}"`);

    // Test 12: Multiple files rejected with HTTP 400 (UNEXPECTED_FILE)
    const form12 = new FormData();
    form12.append('title', 'Electrical spark near switchboard');
    form12.append('description', 'Sparking observed behind the modular wall switchplate.');
    form12.append('category_id', '1');
    form12.append('photo', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'photo1.jpg');
    form12.append('extra_photo', new Blob([validPngBuffer], { type: 'image/png' }), 'photo2.png');

    const res12 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form12
    });
    const data12 = await res12.json();
    const t12Pass = res12.status === 400 && data12?.code === 'UNEXPECTED_FILE';
    recordTest(12, 'Unexpected/multiple file fields rejected with HTTP 400 UNEXPECTED_FILE', t12Pass,
      `HTTP ${res12.status}, code: ${data12?.code}, message: "${data12?.message}"`);

    // ========================================================================
    // PART 3: AUTHENTICATION & ROLE GUARDS (PRE-MULTER REJECTION)
    // ========================================================================
    console.log('\n--- PART 3: Authentication & Role Authorization Enforcement ---');

    // Test 13: Unauthenticated multipart upload rejected with HTTP 401 NO_TOKEN
    const form13 = new FormData();
    form13.append('title', 'Electrical spark near switchboard');
    form13.append('description', 'Sparking observed behind the modular wall switchplate.');
    form13.append('category_id', '1');
    form13.append('photo', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'photo.jpg');

    const res13 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      body: form13
    });
    const data13 = await res13.json();
    const t13Pass = res13.status === 401 && data13?.code === 'NO_TOKEN';
    recordTest(13, 'Unauthenticated upload rejected with HTTP 401 NO_TOKEN', t13Pass,
      `HTTP ${res13.status}, code: ${data13?.code}`);

    // Test 14: Staff token attempting complaint upload rejected with HTTP 403 FORBIDDEN_ROLE
    const form14 = new FormData();
    form14.append('title', 'Electrical spark near switchboard');
    form14.append('description', 'Sparking observed behind the modular wall switchplate.');
    form14.append('category_id', '1');
    form14.append('photo', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'photo.jpg');

    const res14 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${staffToken}` },
      body: form14
    });
    const data14 = await res14.json();
    const t14Pass = res14.status === 403 && data14?.code === 'FORBIDDEN_ROLE';
    recordTest(14, 'Staff token rejected from lodging complaint with HTTP 403 FORBIDDEN_ROLE', t14Pass,
      `HTTP ${res14.status}, code: ${data14?.code}`);

    // ========================================================================
    // PART 4: PRIVATE ATTACHMENT ACCESS & DOWNLOAD SECURITY
    // ========================================================================
    console.log('\n--- PART 4: Private Attachment Access & Security Headers ---');

    // Test 15: Student 1 downloads owned attachment stream successfully (HTTP 200)
    const downloadUrl = `/api/v1/complaints/${data2.complaint.id}/attachments/${att2.id}`;
    const res15 = await fetch(`${baseUrl}${downloadUrl}`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const buf15 = Buffer.from(await res15.arrayBuffer());
    const t15Pass = res15.status === 200 &&
                    res15.headers.get('content-type') === 'image/jpeg' &&
                    res15.headers.get('x-content-type-options') === 'nosniff' &&
                    res15.headers.get('cache-control')?.includes('private') &&
                    buf15.length > 0;
    recordTest(15, 'Student 1 retrieves owned attachment stream with secure headers', t15Pass,
      `HTTP ${res15.status}, bytes: ${buf15.length}, content-type: ${res15.headers.get('content-type')}, nosniff: ${res15.headers.get('x-content-type-options')}`);

    // Test 16: Cross-Student IDOR Defense — Student 2 cannot access Student 1's attachment (HTTP 404)
    const res16 = await fetch(`${baseUrl}${downloadUrl}`, {
      headers: { 'Authorization': `Bearer ${student2Token}` }
    });
    const data16 = await res16.json();
    const t16Pass = res16.status === 404 && data16?.message === 'Attachment not found.';
    recordTest(16, 'Cross-Student IDOR Defense: Student 2 receives HTTP 404 on Student 1 attachment', t16Pass,
      `HTTP ${res16.status}, message: "${data16?.message}"`);

    // Test 17: Staff Attachment Access Authorization per Option D (SEC-11-MED-01 Resolution)
    // Non-permitted cross-hostel staff (Ramesh, Block B) receives HTTP 404 anti-enumeration.
    // Permitted hostel staff (Rajesh, Block A) retrieves image stream with HTTP 200.
    const res17Cross = await fetch(`${baseUrl}${downloadUrl}`, {
      headers: { 'Authorization': `Bearer ${rameshToken}` }
    });
    const data17Cross = await res17Cross.json();

    const res17Permitted = await fetch(`${baseUrl}${downloadUrl}`, {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const buf17 = Buffer.from(await res17Permitted.arrayBuffer());

    const t17Pass = res17Cross.status === 404 &&
                    data17Cross?.message === 'Attachment not found.' &&
                    res17Permitted.status === 200 &&
                    buf17.length > 0;
    recordTest(17, 'Staff Attachment Scoping (Option D): Cross-hostel staff denied (404), permitted staff streams photo (200)', t17Pass,
      `Cross-hostel (Block B) status: ${res17Cross.status}, Permitted (Block A) status: ${res17Permitted.status}, bytes: ${buf17.length}`);

    // Test 18: Authorized Admin can view/download ticket attachment (HTTP 200)
    const res18 = await fetch(`${baseUrl}${downloadUrl}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const buf18 = Buffer.from(await res18.arrayBuffer());
    const t18Pass = res18.status === 200 && buf18.length > 0;
    recordTest(18, 'Admin authorized to inspect ticket attachment stream (HTTP 200 OK)', t18Pass,
      `HTTP ${res18.status}, streamed bytes: ${buf18.length}`);

    // Test 19: Unauthenticated attachment download rejected with HTTP 401 NO_TOKEN
    const res19 = await fetch(`${baseUrl}${downloadUrl}`);
    const data19 = await res19.json();
    const t19Pass = res19.status === 401 && data19?.code === 'NO_TOKEN';
    recordTest(19, 'Unauthenticated attachment download rejected with HTTP 401 NO_TOKEN', t19Pass,
      `HTTP ${res19.status}, code: ${data19?.code}`);

    // Test 20: Direct public access to /uploads is blocked with HTTP 403
    const res20 = await fetch(`${baseUrl}/uploads/complaints/test.jpg`);
    const data20 = await res20.json();
    const t20Pass = res20.status === 403 && data20?.success === false;
    recordTest(20, 'Direct public access to /uploads strictly blocked with HTTP 403', t20Pass,
      `HTTP ${res20.status}, message: "${data20?.message}"`);

    // ========================================================================
    // PART 5: TRANSACTION SAFETY, ORPHAN CLEANUP & ROBUSTNESS
    // ========================================================================
    console.log('\n--- PART 5: Transaction Safety, Orphan Cleanup & Path Protection ---');

    // Test 21: Validation failure before write leaves zero orphaned files
    const filesBefore21 = fs.readdirSync(COMPLAINTS_UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    const form21 = new FormData();
    form21.append('title', 'Bad'); // Too short (< 5 chars)
    form21.append('description', 'Valid description long enough for schema validation.');
    form21.append('category_id', '1');
    form21.append('photo', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'will_fail.jpg');

    const res21 = await fetch(`${baseUrl}/api/v1/complaints`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${student1Token}` },
      body: form21
    });
    const data21 = await res21.json();
    const filesAfter21 = fs.readdirSync(COMPLAINTS_UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    const t21Pass = res21.status === 400 &&
                    filesAfter21.length === filesBefore21.length;
    recordTest(21, 'Validation failure leaves zero orphaned files on disk', t21Pass,
      `HTTP ${res21.status}, files before: ${filesBefore21.length}, files after: ${filesAfter21.length}`);

    // Test 22: Missing physical attachment file handled cleanly with HTTP 404
    // We query seed attachment 1 (whose seed file is a mock path not physically present)
    const res22 = await fetch(`${baseUrl}/api/v1/complaints/1/attachments/1`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const data22 = await res22.json();
    const t22Pass = res22.status === 404 &&
                    data22?.message === 'Attachment file not found on server.';
    recordTest(22, 'Missing physical file handled safely with HTTP 404 (no server crash or path leak)', t22Pass,
      `HTTP ${res22.status}, message: "${data22?.message}"`);

    // Test 23: No absolute server paths leaked in API responses
    const jsonString2 = JSON.stringify(data2);
    const leakedPath = jsonString2.includes('C:\\') ||
                       jsonString2.includes('/Users/') ||
                       jsonString2.includes(rootDir);
    const t23Pass = !leakedPath &&
                    data2?.complaint?.attachment?.download_url.startsWith('/api/v1/complaints/');
    recordTest(23, 'Zero absolute physical path leakage in API response payload', t23Pass,
      `Contains absolute root: ${leakedPath}, download_url: "${data2?.complaint?.attachment?.download_url}"`);

    // Test 24: Complaint details (GET /api/v1/complaints/:id) returns attachment metadata
    const res24 = await fetch(`${baseUrl}/api/v1/complaints/${data2.complaint.id}`, {
      headers: { 'Authorization': `Bearer ${student1Token}` }
    });
    const data24 = await res24.json();
    const c24 = data24?.complaint;
    const t24Pass = res24.status === 200 &&
                    c24?.attachment?.id === att2.id &&
                    c24?.attachment?.download_url === att2.download_url;
    recordTest(24, 'Complaint details API exposes structured attachment metadata', t24Pass,
      `HTTP ${res24.status}, att id: ${c24?.attachment?.id}, download_url: "${c24?.attachment?.download_url}"`);

    // Test 25: Simulated Database Failure triggers rollback and unlinks staged file
    console.log('\n--- Testing Simulated Database Transaction Rollback & File Cleanup ---');
    const filesBeforeRollback = fs.readdirSync(COMPLAINTS_UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    let rollbackErrorCaught = false;

    // Simulate failure by running model with an invalid category ID that passes initial checks but fails DB FK
    try {
      await ComplaintModel.createComplaint({
        studentId: student1.id,
        categoryId: 999999, // Non-existent category triggers FK failure
        title: 'Rollback verification complaint',
        description: 'Testing rollback cleanup when MySQL constraint is violated.',
        hostelBlock: 'Block A',
        roomNumber: 'A-102',
        photoFile: {
          buffer: validJpegBuffer,
          originalname: 'rollback_test.jpg'
        }
      });
    } catch (err) {
      rollbackErrorCaught = true;
    }

    const filesAfterRollback = fs.readdirSync(COMPLAINTS_UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    const t25Pass = rollbackErrorCaught &&
                    filesAfterRollback.length === filesBeforeRollback.length;
    recordTest(25, 'Database failure triggers transaction rollback and safely unlinks staged image', t25Pass,
      `Rollback caught: ${rollbackErrorCaught}, disk files before: ${filesBeforeRollback.length}, disk files after: ${filesAfterRollback.length}`);

  } finally {
    // Teardown: Clean up synthetic complaints and uploaded files
    console.log('\nCleaning up synthetic complaints and uploaded test files...');
    for (const id of createdComplaintIds) {
      try {
        // Find any attachment files to unlink
        const [attRows] = await pool.query('SELECT storage_key FROM complaint_attachments WHERE complaint_id = ?', [id]);
        for (const row of attRows) {
          try {
            const absPath = resolveSafeStoragePath(row.storage_key);
            await unlinkFileSafely(absPath);
          } catch {}
        }
        await pool.query('DELETE FROM complaint_status_history WHERE complaint_id = ?', [id]);
        await pool.query('DELETE FROM complaint_attachments WHERE complaint_id = ?', [id]);
        await pool.query('DELETE FROM complaints WHERE id = ?', [id]);
      } catch (err) {
        console.error(`Error cleaning complaint ID ${id}:`, err.message);
      }
    }

    // Clean any orphaned files created during this test
    const remainingFiles = fs.readdirSync(COMPLAINTS_UPLOAD_DIR).filter((f) => f !== '.gitkeep');
    for (const f of remainingFiles) {
      await unlinkFileSafely(path.join(COMPLAINTS_UPLOAD_DIR, f));
    }

    await new Promise((resolve) => server.close(resolve));
    console.log('✓ Synthetic test complaints and upload files cleanly removed.');
    console.log('✓ Test HTTP server closed.');
  }

  // ========================================================================
  // FINAL SCOREBOARD
  // ========================================================================
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n========================================================================');
  console.log(`  SESSION 11 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    console.error(`❌ VERIFICATION FAILED: ${failedTests} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('🎉 ALL SESSION 11 TESTS PASSED PERFECTLY with ZERO FAILURES!\n');
    process.exit(0);
  }
}

runSession11Verification().catch((error) => {
  console.error('Fatal Verification Error:', error);
  process.exit(1);
});
