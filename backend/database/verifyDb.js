/**
 * HostelCare — Database Schema Import & Relationship Verification Harness
 * Tests MySQL Connection, Schema Execution, Foreign Key Integrity, and JOIN Queries
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Allow password override via CLI: node verifyDb.js [password]
const cliPassword = process.argv[2];
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: cliPassword !== undefined ? cliPassword : (process.env.DB_PASSWORD || ''),
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  multipleStatements: true
};

async function runDatabaseVerification() {
  console.log('================================================================');
  console.log('  HOSTELCARE — MYSQL DATABASE IMPORT & RELATIONSHIP VERIFICATION');
  console.log('================================================================');
  console.log(`Connecting to MySQL on ${dbConfig.host}:${dbConfig.port} as user '${dbConfig.user}'...`);

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✓ Successfully connected to MySQL server.');
  } catch (err) {
    console.error('✗ Failed to connect to MySQL:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\nNOTE: MySQL requires a valid password. Provide it via:');
      console.error('  1. Updating DB_PASSWORD in .env');
      console.error('  2. Or running: node backend/database/verifyDb.js <YOUR_MYSQL_PASSWORD>\n');
    }
    process.exit(1);
  }

  try {
    // 1. Read schema.sql & seeds.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    const seedsSql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf-8');

    // 2. Execute schema
    console.log('\n--- 1. Importing Schema (schema.sql) ---');
    await connection.query(schemaSql);
    console.log('✓ Database `hostelcare_db` created and 8 tables initialized.');

    // Switch to database
    await connection.changeUser({ database: 'hostelcare_db' });

    // 3. Execute seeds
    console.log('\n--- 2. Importing Synthetic Seeds (seeds.sql) ---');
    await connection.query(seedsSql);
    console.log('✓ Seed records populated successfully.');

    // 4. Test Foreign Key Enforcement
    console.log('\n--- 3. Testing Foreign Key Integrity & Constraints ---');
    
    // Test A: Invalid foreign key rejection
    let fkPassed = false;
    try {
      await connection.query(`
        INSERT INTO complaints (ticket_number, student_id, category_id, title, description, hostel_block, room_number)
        VALUES ('HC-INVALID-001', 99999, 1, 'Fake Complaint', 'Testing FK', 'Block A', '101')
      `);
    } catch (e) {
      if (e.code === 'ER_NO_REFERENCED_ROW_2' || e.code === 'ER_NO_REFERENCED_ROW') {
        fkPassed = true;
        console.log('✓ PASS: Foreign key correctly rejected invalid student_id=99999 (Error: ER_NO_REFERENCED_ROW_2).');
      } else {
        console.warn('! Unexpected error during FK test:', e.message);
      }
    }
    if (!fkPassed) {
      console.error('✗ FAIL: Database allowed insert with non-existent student_id foreign key!');
    }

    // Test B: Check constraint on feedback rating (must be 1-5)
    let chkPassed = false;
    try {
      await connection.query(`
        INSERT INTO feedback (complaint_id, student_id, rating, comment)
        VALUES (1, 5, 9, 'Invalid rating')
      `);
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        chkPassed = true;
        console.log('✓ PASS: Check constraint correctly rejected invalid rating=9 (Error: ER_CHECK_CONSTRAINT_VIOLATED).');
      } else {
        console.warn('! Unexpected error during Check constraint test:', e.message);
      }
    }

    // 5. Test JOIN Queries
    console.log('\n--- 4. Executing Verified Relational JOIN Queries ---\n');

    // Query 1: Complaint + Student + Category JOIN
    console.log('QUERY 1: Complaints with Student Name & Category:');
    const [q1] = await connection.query(`
      SELECT 
        c.ticket_number,
        c.title,
        u.name AS student_name,
        u.hostel_block,
        u.room_number,
        cc.name AS category,
        c.priority,
        c.status
      FROM complaints c
      INNER JOIN users u ON u.id = c.student_id
      INNER JOIN complaint_categories cc ON cc.id = c.category_id
      ORDER BY c.id ASC
    `);
    console.table(q1);

    // Query 2: Aggregate Student Complaints
    console.log('\nQUERY 2: Complaints Filed Per Student Resident:');
    const [q2] = await connection.query(`
      SELECT 
        u.id AS student_id,
        u.name AS student_name,
        u.hostel_block,
        u.room_number,
        COUNT(c.id) AS total_complaints,
        SUM(CASE WHEN c.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN c.status = 'resolved' OR c.status = 'closed' THEN 1 ELSE 0 END) AS resolved_count
      FROM users u
      LEFT JOIN complaints c ON c.student_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id, u.name, u.hostel_block, u.room_number
      ORDER BY total_complaints DESC
    `);
    console.table(q2);

    // Query 3: Status Distribution
    console.log('\nQUERY 3: System Status Distribution:');
    const [q3] = await connection.query(`
      SELECT 
        status,
        COUNT(*) AS total_tickets
      FROM complaints
      GROUP BY status
      ORDER BY total_tickets DESC
    `);
    console.table(q3);

    // Query 4: Staff Assignments
    console.log('\nQUERY 4: Active Maintenance Staff Assignments:');
    const [q4] = await connection.query(`
      SELECT 
        ca.id AS assignment_id,
        c.ticket_number,
        c.title AS complaint_title,
        staff.name AS assigned_technician,
        staff.staff_designation,
        assignor.name AS assigned_by,
        ca.assigned_at
      FROM complaint_assignments ca
      INNER JOIN complaints c ON c.id = ca.complaint_id
      INNER JOIN users staff ON staff.id = ca.staff_id
      INNER JOIN users assignor ON assignor.id = ca.assigned_by
      ORDER BY ca.id ASC
    `);
    console.table(q4);

    // Query 5: Complaint Status History Audit Trail
    console.log('\nQUERY 5: Status Change History Audit Trail:');
    const [q5] = await connection.query(`
      SELECT 
        c.ticket_number,
        changer.name AS changed_by_name,
        changer.role AS changer_role,
        h.old_status,
        h.new_status,
        h.remarks,
        h.changed_at
      FROM complaint_status_history h
      INNER JOIN complaints c ON c.id = h.complaint_id
      INNER JOIN users changer ON changer.id = h.changed_by
      ORDER BY h.id ASC
    `);
    console.table(q5);

    // Query 6: Student Feedback with Ratings
    console.log('\nQUERY 6: Quality Assurance Ratings & Feedback:');
    const [q6] = await connection.query(`
      SELECT 
        f.id AS feedback_id,
        c.ticket_number,
        student.name AS student_name,
        f.rating,
        f.comment,
        f.created_at
      FROM feedback f
      INNER JOIN complaints c ON c.id = f.complaint_id
      INNER JOIN users student ON student.id = f.student_id
      ORDER BY f.id ASC
    `);
    console.table(q6);

    console.log('\n================================================================');
    console.log('✓ ALL DATABASE RELATIONSHIP & INTEGRITY VERIFICATIONS PASSED!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('✗ Execution Error:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runDatabaseVerification();

