/**
 * HostelCare — Cloud & Production Database Schema Deployment Utility
 * Safely executes DDL migrations and seed data on local or cloud-hosted MySQL databases.
 *
 * Usage:
 *   node backend/database/deploySchema.js           # Deploy schema DDL only
 *   node backend/database/deploySchema.js --seed    # Deploy schema DDL and populate seed data
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { testConnection } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploySchema() {
  const shouldSeed = process.argv.includes('--seed');

  console.log('========================================================================');
  console.log('  HOSTELCARE — DATABASE SCHEMA DEPLOYMENT & MIGRATION RUNNER');
  console.log('========================================================================');

  // 1. Validate connection
  console.log('Validating database connection...');
  const health = await testConnection();
  if (!health.success) {
    console.error('❌ Connection Failed:', health.error);
    process.exit(1);
  }

  console.log(`✓ Connected to MySQL database '${health.database}' on ${health.host}:${health.port} (SSL: ${health.ssl ? 'Enabled' : 'Disabled'}, Latency: ${health.latencyMs}ms).`);

  const connection = await pool.getConnection();

  try {
    // 2. Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }

    console.log(`\nReading schema file: ${schemaPath}`);
    const rawSql = fs.readFileSync(schemaPath, 'utf8');

    // 3. Clean and parse SQL statements (strip CREATE DATABASE, USE statements to support cloud provisioned DBs)
    const statements = rawSql
      .split(/;\s*$/m)
      .map(stmt => stmt.trim())
      .filter(stmt => {
        if (!stmt) return false;
        // Skip database creation/switch in cloud managed environments
        if (/^CREATE\s+DATABASE/i.test(stmt)) return false;
        if (/^USE\s+/i.test(stmt)) return false;
        return true;
      });

    console.log(`Executing ${statements.length} DDL statements...`);

    // Disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      try {
        await connection.query(stmt);
      } catch (stmtErr) {
        console.error(`Error executing statement #${i + 1}:\n${stmt.substring(0, 100)}...`);
        throw stmtErr;
      }
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✓ All schema tables successfully created or updated.');

    // 4. Optionally seed initial data
    if (shouldSeed) {
      const seedsPath = path.join(__dirname, 'seeds.sql');
      if (fs.existsSync(seedsPath)) {
        console.log(`\nPopulating seed data from: ${seedsPath}`);
        const rawSeeds = fs.readFileSync(seedsPath, 'utf8');
        const seedStatements = rawSeeds
          .split(/;\s*$/m)
          .map(s => s.trim())
          .filter(s => {
            if (!s) return false;
            if (/^USE\s+/i.test(s)) return false;
            return true;
          });

        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const s of seedStatements) {
          if (!s) continue;
          await connection.query(s);
        }
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✓ Seed data successfully populated.');
      } else {
        console.warn('Seed file not found, skipping seed population.');
      }
    }

    // 5. Verification & Summary
    const [tables] = await connection.query(`
      SELECT table_name, table_rows 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);

    console.log('\n--- VERIFIED DEPLOYED TABLES ---');
    console.table(tables.map(t => ({
      Table: t.TABLE_NAME || t.table_name,
      EstimatedRows: t.TABLE_ROWS ?? t.table_rows
    })));

    console.log('========================================================================');
    console.log('🎉 DATABASE DEPLOYMENT COMPLETED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Fatal Schema Deployment Error:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

deploySchema();
