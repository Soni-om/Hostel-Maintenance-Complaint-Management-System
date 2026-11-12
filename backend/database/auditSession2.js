/**
 * HostelCare — Session 2 Comprehensive Database Audit Runner
 * Tests Table Integrity, Primary/Foreign Keys, Unique Constraints, ENUM Constraints, Check Constraints,
 * Cascade Behaviors, and Indexes
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function runSession2Audit() {
  console.log('================================================================');
  console.log('  HOSTELCARE — SESSION 2 COMPREHENSIVE QUALITY AUDIT');
  console.log('================================================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'hostelcare_db',
    multipleStatements: true
  });

  const results = [];

  function record(name, category, passed, detail) {
    results.push({ name, category, status: passed ? 'PASS' : 'FAIL', detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  try {
    // -------------------------------------------------------------
    // 1. Table Verification
    // -------------------------------------------------------------
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(r => Object.values(r)[0]).sort();
    const expectedTables = [
      'complaint_assignments',
      'complaint_attachments',
      'complaint_categories',
      'complaint_status_history',
      'complaints',
      'feedback',
      'hostel_blocks',
      'users'
    ].sort();

    const allTablesPresent = expectedTables.every(t => tableNames.includes(t)) && tableNames.length === 8;
    record(
      'All 8 Tables Exist',
      'Database Integrity',
      allTablesPresent,
      `Found ${tableNames.length} tables: ${tableNames.join(', ')}`
    );

    // -------------------------------------------------------------
    // 2. Primary & Foreign Keys Check
    // -------------------------------------------------------------
    const [fks] = await connection.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = 'hostelcare_db' AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    record(
      'Foreign Keys Configured',
      'Database Integrity',
      fks.length >= 10,
      `Found ${fks.length} active foreign key constraints across relational tables.`
    );

    // -------------------------------------------------------------
    // 3. Duplicate Email Rejection
    // -------------------------------------------------------------
    let dupEmailRejected = false;
    try {
      await connection.query(`
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Duplicate Test', 'admin@hostelcare.edu', 'hash', 'student')
      `);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        dupEmailRejected = true;
      }
    }
    record(
      'Duplicate Email Rejection',
      'Database Integrity',
      dupEmailRejected,
      'Duplicate email rejected with ER_DUP_ENTRY unique constraint violation.'
    );

    // -------------------------------------------------------------
    // 4. Duplicate Ticket Number Rejection
    // -------------------------------------------------------------
    let dupTicketRejected = false;
    try {
      await connection.query(`
        INSERT INTO complaints (ticket_number, student_id, category_id, title, description, hostel_block, room_number)
        VALUES ('HC-20261101-0001', 5, 1, 'Dup Ticket', 'Desc', 'Block A', '102')
      `);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        dupTicketRejected = true;
      }
    }
    record(
      'Duplicate Ticket Number Rejection',
      'Database Integrity',
      dupTicketRejected,
      'Duplicate ticket_number rejected with ER_DUP_ENTRY unique constraint violation.'
    );

    // -------------------------------------------------------------
    // 5. Duplicate Feedback complaint_id Rejection (1-to-1)
    // -------------------------------------------------------------
    let dupFeedbackRejected = false;
    try {
      // complaint_id 4 already has feedback in seeds
      await connection.query(`
        INSERT INTO feedback (complaint_id, student_id, rating, comment)
        VALUES (4, 8, 4, 'Second feedback attempt')
      `);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        dupFeedbackRejected = true;
      }
    }
    record(
      'Duplicate Feedback Rejection (1-to-1)',
      'Database Integrity',
      dupFeedbackRejected,
      'Duplicate feedback on same complaint rejected with ER_DUP_ENTRY constraint violation.'
    );

    // -------------------------------------------------------------
    // 6. Invalid Complaint Status ENUM Rejection
    // -------------------------------------------------------------
    let invalidStatusRejected = false;
    try {
      await connection.query(`
        INSERT INTO complaints (ticket_number, student_id, category_id, title, description, hostel_block, room_number, status)
        VALUES ('HC-TEST-ENUM-01', 5, 1, 'Invalid Status', 'Desc', 'Block A', '102', 'dispatched_nowhere')
      `);
    } catch (e) {
      if (e.code === 'ER_WARN_DATA_TRUNCATED' || e.code === 'WARN_DATA_TRUNCATED' || e.message.includes('Data truncated')) {
        invalidStatusRejected = true;
      }
    }
    record(
      'Invalid Complaint Status ENUM Rejection',
      'Database Integrity',
      invalidStatusRejected,
      'Invalid status rejected by MySQL strict mode (Data truncated for column status).'
    );

    // -------------------------------------------------------------
    // 7. Invalid Priority ENUM Rejection
    // -------------------------------------------------------------
    let invalidPriorityRejected = false;
    try {
      await connection.query(`
        INSERT INTO complaints (ticket_number, student_id, category_id, title, description, hostel_block, room_number, priority)
        VALUES ('HC-TEST-ENUM-02', 5, 1, 'Invalid Priority', 'Desc', 'Block A', '102', 'super_hyper_urgent')
      `);
    } catch (e) {
      if (e.code === 'ER_WARN_DATA_TRUNCATED' || e.code === 'WARN_DATA_TRUNCATED' || e.message.includes('Data truncated')) {
        invalidPriorityRejected = true;
      }
    }
    record(
      'Invalid Priority ENUM Rejection',
      'Database Integrity',
      invalidPriorityRejected,
      'Invalid priority rejected by MySQL strict mode (Data truncated for column priority).'
    );

    // -------------------------------------------------------------
    // 8. CHECK Rating Values Outside 1–5
    // -------------------------------------------------------------
    let checkRatingHighRejected = false;
    let checkRatingLowRejected = false;

    // Test rating = 6
    try {
      await connection.query(`
        INSERT INTO feedback (complaint_id, student_id, rating, comment)
        VALUES (1, 5, 6, 'Rating above max')
      `);
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') checkRatingHighRejected = true;
    }

    // Test rating = 0
    try {
      await connection.query(`
        INSERT INTO feedback (complaint_id, student_id, rating, comment)
        VALUES (1, 5, 0, 'Rating below min')
      `);
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') checkRatingLowRejected = true;
    }

    record(
      'Rating Check Constraint (1–5)',
      'Database Integrity',
      checkRatingHighRejected && checkRatingLowRejected,
      'Both rating=0 and rating=6 rejected by CHECK constraint chk_feedback_rating.'
    );

    // -------------------------------------------------------------
    // 9. Inspect All Indexes
    // -------------------------------------------------------------
    const [indexes] = await connection.query(`
      SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE 
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = 'hostelcare_db'
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);
    const customIndexes = indexes.filter(idx => idx.INDEX_NAME !== 'PRIMARY');
    record(
      'Indexes Verification',
      'Database Quality',
      customIndexes.length >= 15,
      `Found ${customIndexes.length} secondary/unique indexes optimizing status, user, category, and date filtering.`
    );

    // -------------------------------------------------------------
    // 10. Foreign Key Delete Behavior (RESTRICT vs CASCADE)
    // -------------------------------------------------------------
    const [fkRules] = await connection.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = 'hostelcare_db'
    `);
    const cascades = fkRules.filter(r => r.DELETE_RULE === 'CASCADE');
    const restricts = fkRules.filter(r => r.DELETE_RULE === 'RESTRICT');
    record(
      'FK Delete Behavior (CASCADE/RESTRICT)',
      'Database Quality',
      cascades.length >= 4 && restricts.length >= 4,
      `Master tables protected with ${restricts.length} RESTRICT rules; child logs configured with ${cascades.length} CASCADE rules.`
    );

    // -------------------------------------------------------------
    // 11. Seed Data Consistency Check
    // -------------------------------------------------------------
    const [userCount] = await connection.query('SELECT COUNT(*) AS c FROM users');
    const [catCount] = await connection.query('SELECT COUNT(*) AS c FROM complaint_categories');
    const [compCount] = await connection.query('SELECT COUNT(*) AS c FROM complaints');
    const [histCount] = await connection.query('SELECT COUNT(*) AS c FROM complaint_status_history');
    const [feedCount] = await connection.query('SELECT COUNT(*) AS c FROM feedback');

    const seedValid = userCount[0].c === 8 && catCount[0].c === 6 && compCount[0].c === 5 && histCount[0].c >= 10 && feedCount[0].c === 2;
    record(
      'Seed Data Consistency',
      'Database Quality',
      seedValid,
      `Users: ${userCount[0].c}, Categories: ${catCount[0].c}, Complaints: ${compCount[0].c}, Audit History: ${histCount[0].c}, Feedback: ${feedCount[0].c}`
    );

  } catch (err) {
    console.error('Audit Script Error:', err);
  } finally {
    await connection.end();
  }
}

runSession2Audit();
