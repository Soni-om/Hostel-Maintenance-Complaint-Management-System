/**
 * HostelCare — Session 20 Phase B Verification Suite
 * Automated tests for Production API Configuration, Environment Resolution,
 * Token Security Boundaries, and CSS/JS Asset Parity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const results = [];

function recordTest(id, name, passed, evidence = null, error = null) {
  results.push({ id, name, passed, evidence, error });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] Test ${id}: ${name}`);
  if (evidence) console.log(`       Evidence: ${evidence}`);
  if (error) console.error(`       Error: ${error}`);
}

async function runPhaseBVerification() {
  console.log('========================================================================');
  console.log('  HOSTELCARE — SESSION 20 PHASE B VERIFICATION SUITE');
  console.log('  Production API Configuration & Asset Parity Audit');
  console.log('========================================================================\n');

  // Test 1: Config file existence & readability
  const configJsPath = path.join(rootDir, 'frontend', 'js', 'config.js');
  const configAssetsJsPath = path.join(rootDir, 'frontend', 'assets', 'js', 'config.js');
  const configContent = fs.readFileSync(configJsPath, 'utf8');
  const configAssetsContent = fs.readFileSync(configAssetsJsPath, 'utf8');

  recordTest(
    1,
    'config.js exists in both /frontend/js and /frontend/assets/js and are byte-identical',
    configContent === configAssetsContent,
    `Length: ${configContent.length} bytes (Match: ${configContent === configAssetsContent})`
  );

  // Test 2: Simulating resolveApiOrigin in various environments
  // We extract resolveApiOrigin logic from config.js and run unit tests against mock windows
  const resolveOriginMatch = configContent.match(/function resolveApiOrigin\(\)[\s\S]*?\n\}/);
  const testResolver = new Function(
    'window',
    `
    const PRODUCTION_API_ORIGIN = 'https://backend-production-84d31806.up.railway.app';
    const LOCAL_DEV_ORIGIN = 'http://localhost:5000';
    ${resolveOriginMatch[0]}
    return resolveApiOrigin();
  `
  );

  // 2a. Node / undefined window
  const envNode = testResolver(undefined);
  recordTest(
    2,
    'resolveApiOrigin() defaults to localhost:5000 when window is undefined',
    envNode === 'http://localhost:5000',
    `Resolved: ${envNode}`
  );

  // 2b. file:// protocol
  const envFile = testResolver({ location: { protocol: 'file:', origin: 'null' } });
  recordTest(
    3,
    'resolveApiOrigin() defaults to localhost:5000 for file:// protocol',
    envFile === 'http://localhost:5000',
    `Resolved: ${envFile}`
  );

  // 2c. localhost hostname
  const envLocalhost = testResolver({ location: { protocol: 'http:', hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' } });
  recordTest(
    4,
    'resolveApiOrigin() preserves local development on localhost',
    envLocalhost === 'http://localhost:5000',
    `Resolved: ${envLocalhost}`
  );

  // 2d. 127.0.0.1 hostname
  const envLoopback = testResolver({ location: { protocol: 'http:', hostname: '127.0.0.1', port: '8080', origin: 'http://127.0.0.1:8080' } });
  recordTest(
    5,
    'resolveApiOrigin() preserves local development on 127.0.0.1',
    envLoopback === 'http://localhost:5000',
    `Resolved: ${envLoopback}`
  );

  // 2e. Vercel deployment (cloud hostname)
  const envVercel = testResolver({ location: { protocol: 'https:', hostname: 'hostelcare.vercel.app', port: '', origin: 'https://hostelcare.vercel.app' } });
  recordTest(
    6,
    'resolveApiOrigin() automatically routes Vercel frontend to production Railway backend',
    envVercel === 'https://backend-production-84d31806.up.railway.app',
    `Resolved: ${envVercel}`
  );

  // 2f. Custom remote cloud domain
  const envCustom = testResolver({ location: { protocol: 'https:', hostname: 'myhostel.university.edu', port: '', origin: 'https://myhostel.university.edu' } });
  recordTest(
    7,
    'resolveApiOrigin() automatically routes custom remote domains to Railway backend',
    envCustom === 'https://backend-production-84d31806.up.railway.app',
    `Resolved: ${envCustom}`
  );

  // 2g. Global override __API_BASE_URL__
  const envOverride = testResolver({
    __API_BASE_URL__: 'https://staging-backend.railway.app/',
    location: { protocol: 'https:', hostname: 'hostelcare.vercel.app' }
  });
  recordTest(
    8,
    'resolveApiOrigin() honors window.__API_BASE_URL__ override if explicitly defined',
    envOverride === 'https://staging-backend.railway.app',
    `Resolved: ${envOverride}`
  );

  // Test 9: api.js parity & root /api/* resolution
  const apiJsPath = path.join(rootDir, 'frontend', 'js', 'api.js');
  const apiAssetsJsPath = path.join(rootDir, 'frontend', 'assets', 'js', 'api.js');
  const apiContent = fs.readFileSync(apiJsPath, 'utf8');
  const apiAssetsContent = fs.readFileSync(apiAssetsJsPath, 'utf8');

  recordTest(
    9,
    'api.js exists in both /frontend/js and /frontend/assets/js and are byte-identical',
    apiContent === apiAssetsContent,
    `Length: ${apiContent.length} bytes (Match: ${apiContent === apiAssetsContent})`
  );

  // Test 10: isTrustedOrigin logic verification
  const isTrustedFnMatch = apiContent.match(/function isTrustedOrigin\(targetUrlStr, baseUrlStr\)[\s\S]*?\n\}/);
  const testTrusted = new Function(
    'targetUrlStr',
    'baseUrlStr',
    'window',
    `
    ${isTrustedFnMatch[0]}
    return isTrustedOrigin(targetUrlStr, baseUrlStr);
  `
  );

  const mockVercelWindow = {
    location: { origin: 'https://hostelcare.vercel.app', hostname: 'hostelcare.vercel.app' }
  };
  const railwayBaseUrl = 'https://backend-production-84d31806.up.railway.app/api/v1';

  const railwayTrusted = testTrusted(
    'https://backend-production-84d31806.up.railway.app/api/v1/complaints',
    railwayBaseUrl,
    mockVercelWindow
  );
  recordTest(
    10,
    'isTrustedOrigin() trusts configured production Railway backend origin from Vercel frontend',
    railwayTrusted === true,
    `Trusted: ${railwayTrusted}`
  );

  const maliciousTrusted = testTrusted(
    'https://malicious-attacker.com/api/steal-tokens',
    railwayBaseUrl,
    mockVercelWindow
  );
  recordTest(
    11,
    'isTrustedOrigin() rejects untrusted third-party origins (Bearer token never leaked)',
    maliciousTrusted === false,
    `Trusted: ${maliciousTrusted}`
  );

  // Test 12: CSS files synchronization verification
  const varAssets = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'css', 'variables.css'), 'utf8');
  const varCss = fs.readFileSync(path.join(rootDir, 'frontend', 'css', 'variables.css'), 'utf8');
  recordTest(12, 'variables.css files are byte-identical across folders', varAssets === varCss, `Match: ${varAssets === varCss}`);

  const mainAssets = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'css', 'main.css'), 'utf8');
  const mainCss = fs.readFileSync(path.join(rootDir, 'frontend', 'css', 'main.css'), 'utf8');
  recordTest(13, 'main.css files are byte-identical across folders', mainAssets === mainCss, `Match: ${mainAssets === mainCss}`);

  const compAssets = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'css', 'components.css'), 'utf8');
  const compCss = fs.readFileSync(path.join(rootDir, 'frontend', 'css', 'components.css'), 'utf8');
  const hasAccessibility = compAssets.includes('14. Accessibility, UI States & Responsive Polish') && compCss.includes('14. Accessibility, UI States & Responsive Polish');
  recordTest(14, 'components.css files are synchronized and include Section 14 accessibility & states', compAssets === compCss && hasAccessibility, `Synchronized: ${compAssets === compCss}, Section 14 present: ${hasAccessibility}`);

  // Test 15: JavaScript files parity (auth.js and utils.js)
  const authAssets = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'js', 'auth.js'), 'utf8');
  const authJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'auth.js'), 'utf8');
  recordTest(15, 'auth.js files are byte-identical across folders', authAssets === authJs, `Match: ${authAssets === authJs}`);

  const utilsAssets = fs.readFileSync(path.join(rootDir, 'frontend', 'assets', 'js', 'utils.js'), 'utf8');
  const utilsJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'utils.js'), 'utf8');
  recordTest(16, 'utils.js files are byte-identical across folders', utilsAssets === utilsJs, `Match: ${utilsAssets === utilsJs}`);

  // Test 17: vercel.json structure & clean routing
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  let vercelValid = false;
  let vercelData = {};
  if (fs.existsSync(vercelJsonPath)) {
    try {
      vercelData = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      const requiredSources = ['/', '/login.html', '/register.html', '/dashboard.html', '/complaints.html', '/pages/:match*', '/assets/:match*', '/css/:match*', '/js/:match*'];
      const sources = (vercelData.rewrites || []).map(r => r.source);
      const allPresent = requiredSources.every(s => sources.includes(s));
      vercelValid = Array.isArray(vercelData.rewrites) && allPresent;
    } catch {}
  }
  recordTest(
    17,
    'vercel.json is valid and contains routing rewrites for all required top-level pages, aliases, and static assets',
    vercelValid,
    `Valid: ${vercelValid}, Rewrites count: ${vercelData.rewrites?.length || 0}`
  );

  // Summary
  console.log('\n========================================================================');
  console.log('  SESSION 20 PHASE B VERIFICATION SUMMARY');
  console.log('========================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total Automated Tests : ${results.length}`);
  console.log(`Tests Passed           : ${passedCount}`);
  console.log(`Tests Failed           : ${failedCount}`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhaseBVerification().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
