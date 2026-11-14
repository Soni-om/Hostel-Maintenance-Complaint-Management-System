/**
 * HostelCare — Database Backup & Disaster Recovery Utility
 * Exports database structure and table data to timestamped SQL dump files.
 *
 * Usage:
 *   node backend/database/backupDatabase.js
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { testConnection } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupDatabase() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — AUTOMATED DATABASE BACKUP RUNNER');
  console.log('========================================================================');

  const health = await testConnection();
  if (!health.success) {
    console.error('❌ Database Connection Failed:', health.error);
    process.exit(1);
  }

  console.log(`✓ Connected to MySQL database '${health.database}' on ${health.host}:${health.port}`);

  const connection = await pool.getConnection();

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hostelcare_backup_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    let sqlDump = `-- ============================================================================\n`;
    sqlDump += `-- HOSTELCARE DATABASE BACKUP ARCHIVE\n`;
    sqlDump += `-- Database: ${health.database}\n`;
    sqlDump += `-- Host: ${health.host}:${health.port}\n`;
    sqlDump += `-- Generated: ${new Date().toISOString()}\n`;
    sqlDump += `-- ============================================================================\n\n`;
    sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    // Ordered list of tables to ensure referential safety
    const tableOrder = [
      'hostel_blocks',
      'users',
      'complaint_categories',
      'complaints',
      'complaint_assignments',
      'complaint_status_history',
      'complaint_attachments',
      'feedback'
    ];

    const stats = [];

    for (const table of tableOrder) {
      // 1. Get CREATE TABLE statement
      const [[createResult]] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      const createTableSql = createResult['Create Table'] || createResult['Create View'];

      sqlDump += `-- ----------------------------------------------------------------------------\n`;
      sqlDump += `-- Table: ${table}\n`;
      sqlDump += `-- ----------------------------------------------------------------------------\n`;
      sqlDump += `DROP TABLE IF EXISTS \`${table}\`;\n`;
      sqlDump += `${createTableSql};\n\n`;

      // 2. Get table rows
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      stats.push({ Table: table, Rows: rows.length });

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        sqlDump += `INSERT INTO \`${table}\` (${columns}) VALUES\n`;

        const rowValues = rows.map(row => {
          const values = Object.values(row).map(val => {
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return val;
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
            if (typeof val === 'boolean') return val ? 1 : 0;
            // Escape string
            const escaped = String(val).replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, char => {
              switch (char) {
                case '\0': return '\\0';
                case '\x08': return '\\b';
                case '\x09': return '\\t';
                case '\x1a': return '\\z';
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '"':
                case "'":
                case '\\':
                case '%': return '\\' + char;
                default: return char;
              }
            });
            return `'${escaped}'`;
          }).join(', ');
          return `  (${values})`;
        }).join(',\n');

        sqlDump += `${rowValues};\n\n`;
      }
    }

    sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    sqlDump += `-- Backup complete: ${tableOrder.length} tables backed up.\n`;

    fs.writeFileSync(filepath, sqlDump, 'utf8');

    const fileSizeBytes = fs.statSync(filepath).size;
    const fileSizeKb = (fileSizeBytes / 1024).toFixed(2);

    console.log(`\n--- BACKED UP TABLES & RECORDS ---`);
    console.table(stats);

    console.log(`✓ Backup successfully generated:`);
    console.log(`  File : ${filename}`);
    console.log(`  Path : ${filepath}`);
    console.log(`  Size : ${fileSizeKb} KB (${fileSizeBytes} bytes)`);

    console.log('========================================================================');
    console.log('🎉 DATABASE BACKUP COMPLETED SUCCESSFULLY!');
    console.log('========================================================================\n');

    return filepath;
  } catch (err) {
    console.error('Fatal Database Backup Error:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

backupDatabase();
