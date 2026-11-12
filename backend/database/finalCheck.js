import 'dotenv/config';
import mysql from 'mysql2/promise';

async function verify() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'hostelcare_db'
  });

  console.log('=== CHECK 1: SQL MODE & ENUM REJECTION PROOF ===');
  const [modes] = await conn.query('SELECT @@SESSION.sql_mode AS session_mode, @@GLOBAL.sql_mode AS global_mode');
  console.log('Session SQL Mode:', modes[0].session_mode);
  console.log('Global SQL Mode: ', modes[0].global_mode);
  const isStrict = modes[0].session_mode.includes('STRICT_TRANS_TABLES') || modes[0].session_mode.includes('STRICT_ALL_TABLES');
  console.log('Is Strict Mode Active:', isStrict);

  const [countBefore] = await conn.query('SELECT COUNT(*) AS c FROM complaints');
  console.log('Complaints count before invalid ENUM attempt:', countBefore[0].c);

  let errorCaught = null;
  try {
    await conn.query(`
      INSERT INTO complaints (ticket_number, student_id, category_id, title, description, block_id, hostel_block, room_number, status)
      VALUES ('HC-INVALID-ENUM-TEST', 5, 1, 'Enum Test', 'Desc', 1, 'Block A', '101', 'non_existent_status')
    `);
  } catch (err) {
    errorCaught = { code: err.code, message: err.message };
  }
  console.log('Attempt Result: Error caught ->', errorCaught ? `${errorCaught.code}: ${errorCaught.message}` : 'NO ERROR');

  const [countAfter] = await conn.query('SELECT COUNT(*) AS c FROM complaints');
  console.log('Complaints count after invalid ENUM attempt:', countAfter[0].c);
  console.log('Confirmed: ZERO rows inserted ->', countBefore[0].c === countAfter[0].c);

  console.log('\n=== CHECK 4: BLOCK_ID AND HOSTEL_BLOCK CONSISTENCY ===');
  // Check users consistency
  const [userInconsistencies] = await conn.query(`
    SELECT u.id, u.name, u.block_id, u.hostel_block, b.block_name, b.block_code
    FROM users u
    LEFT JOIN hostel_blocks b ON b.id = u.block_id
    WHERE u.block_id IS NOT NULL AND (b.id IS NULL OR (u.hostel_block NOT LIKE CONCAT('%', b.block_code, '%') AND b.block_name NOT LIKE CONCAT('%', u.hostel_block, '%')))
  `);
  console.log('Inconsistent Users count:', userInconsistencies.length);

  // Check complaints consistency
  const [complaintInconsistencies] = await conn.query(`
    SELECT c.id, c.ticket_number, c.block_id, c.hostel_block, b.block_name, b.block_code
    FROM complaints c
    LEFT JOIN hostel_blocks b ON b.id = c.block_id
    WHERE c.block_id IS NOT NULL AND (b.id IS NULL OR (c.hostel_block NOT LIKE CONCAT('%', b.block_code, '%') AND b.block_name NOT LIKE CONCAT('%', c.hostel_block, '%')))
  `);
  console.log('Inconsistent Complaints count:', complaintInconsistencies.length);

  // Show live matched block table
  const [blockCheck] = await conn.query(`
    SELECT 'user' AS source, u.id, u.name AS label, u.block_id, b.block_name AS master_block_name, u.hostel_block AS cached_block_text
    FROM users u
    JOIN hostel_blocks b ON b.id = u.block_id
    UNION ALL
    SELECT 'complaint' AS source, c.id, c.ticket_number AS label, c.block_id, b.block_name AS master_block_name, c.hostel_block AS cached_block_text
    FROM complaints c
    JOIN hostel_blocks b ON b.id = c.block_id
    ORDER BY source, id
  `);
  console.table(blockCheck);

  await conn.end();
}

verify();
