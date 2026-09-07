import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMockEnvironment, type MockServers } from './mock-server.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TierRunResult {
  tier: number;
  name: string;
  file: string;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

function writeOut(message: string): void {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
}

function writeErr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

async function runTier(
  tierNum: number,
  tierName: string,
  fileName: string,
  envVars: Record<string, string>,
): Promise<TierRunResult> {
  const filePath = path.join(__dirname, fileName);
  const startTime = performance.now();

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', '--test', filePath],
      {
        env: {
          ...process.env,
          ...envVars,
        },
      },
    );

    const durationMs = Math.round(performance.now() - startTime);
    return {
      tier: tierNum,
      name: tierName,
      file: fileName,
      passed: true,
      durationMs,
      stdout,
      stderr,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const durationMs = Math.round(performance.now() - startTime);
    return {
      tier: tierNum,
      name: tierName,
      file: fileName,
      passed: false,
      durationMs,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? String(err),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isMockExplicit =
    args.includes('--mock') ||
    process.env['MOCK_E2E'] === 'true' ||
    process.env['MOCK_E2E'] === '1';
  const isJson = args.includes('--json');

  let cloudfrontUrl = process.env['CLOUDFRONT_URL'];
  let albUrl = process.env['ALB_URL'];
  let originSecret =
    process.env['ORIGIN_VERIFY_SECRET'] ?? 'puk-staging-075566976700-us-east-2-origin-verify';

  // Parse command-line flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      cloudfrontUrl = args[++i];
    } else if (args[i] === '--alb' && args[i + 1]) {
      albUrl = args[++i];
    } else if (args[i] === '--secret' && args[i + 1]) {
      originSecret = args[++i];
    }
  }

  // Parse tier selection
  let selectedTiers = [1, 2, 3, 4];
  const tierArgIdx = args.findIndex((a) => a === '--tier' || a === '--tiers');
  if (tierArgIdx !== -1 && args[tierArgIdx + 1]) {
    selectedTiers = args[tierArgIdx + 1]
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 4);
  }

  let mockEnv: MockServers | undefined;
  let testEnv: Record<string, string>;

  // If mock mode is requested or no target URLs are provided, start mock environment
  if (isMockExplicit || (!cloudfrontUrl && !albUrl)) {
    if (!isJson) {
      writeOut('⚡ Starting local high-fidelity mock staging environment...');
    }
    mockEnv = await startMockEnvironment(originSecret);
    testEnv = {
      CLOUDFRONT_URL: mockEnv.cloudfrontUrl,
      CLOUDFRONT_HTTP_URL: mockEnv.cloudfrontHttpUrl,
      ALB_URL: mockEnv.albUrl,
      ORIGIN_VERIFY_SECRET: mockEnv.originVerifySecret,
      MOCK_E2E: 'true',
      SKIP_AWS_CHECKS: 'true',
    };
  } else {
    testEnv = {
      CLOUDFRONT_URL: cloudfrontUrl ?? 'http://127.0.0.1:8443',
      ALB_URL: albUrl ?? 'http://127.0.0.1:8000',
      ORIGIN_VERIFY_SECRET: originSecret,
      SKIP_AWS_CHECKS: process.env['SKIP_AWS_CHECKS'] ?? 'false',
    };
  }

  if (!isJson) {
    writeOut('\n===============================================================');
    writeOut('🚀 PUK E2E TEST SUITE RUNNER (4-TIER ARCHITECTURE)');
    writeOut('===============================================================');
    writeOut(`CloudFront HTTPS Target : ${testEnv['CLOUDFRONT_URL']}`);
    writeOut(`ALB Origin Target        : ${testEnv['ALB_URL']}`);
    writeOut(
      `Mode                     : ${mockEnv ? 'Mock Simulator' : 'Live / Staging Environment'}`,
    );
    writeOut(`Selected Tiers           : ${selectedTiers.join(', ')}`);
    writeOut('===============================================================\n');
  }

  const tiers = [
    { num: 1, name: 'Tier 1: Feature Coverage', file: 'tier1-feature-coverage.test.ts' },
    { num: 2, name: 'Tier 2: Boundary & Corner Cases', file: 'tier2-boundary-corner.test.ts' },
    { num: 3, name: 'Tier 3: Cross-Feature Combinations', file: 'tier3-cross-feature.test.ts' },
    { num: 4, name: 'Tier 4: Real-World Scenarios', file: 'tier4-real-world-scenarios.test.ts' },
  ];

  const results: TierRunResult[] = [];
  let allPassed = true;

  try {
    for (const t of tiers) {
      if (!selectedTiers.includes(t.num)) {
        continue;
      }

      if (!isJson) {
        process.stdout.write(`▶ Running ${t.name}... `);
      }

      const res = await runTier(t.num, t.name, t.file, testEnv);
      results.push(res);

      if (!res.passed) {
        allPassed = false;
        if (!isJson) {
          writeOut(`❌ FAILED (${res.durationMs}ms)`);
          writeOut('\n--- STDERR / STDOUT ---');
          writeOut(res.stdout);
          writeOut(res.stderr);
          writeOut('------------------------\n');
        }
      } else {
        if (!isJson) {
          writeOut(`✅ PASSED (${res.durationMs}ms)`);
        }
      }
    }
  } finally {
    if (mockEnv) {
      await mockEnv.close();
    }
  }

  if (isJson) {
    writeOut(JSON.stringify({ allPassed, results }, null, 2));
    process.exit(allPassed ? 0 : 1);
  }

  // Summary Table
  writeOut('\n===============================================================');
  writeOut('📊 E2E TEST EXECUTION SUMMARY');
  writeOut('===============================================================');
  for (const r of results) {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    writeOut(` ${icon} | Tier ${r.tier}: ${r.name.padEnd(35)} | ${r.durationMs}ms`);
  }
  writeOut('===============================================================');
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  writeOut(
    `Total: ${results.length} tiers executed in ${totalDuration}ms. Overall: ${allPassed ? 'ALL PASSED ✅' : 'SOME FAILED ❌'}\n`,
  );

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  writeErr(`Fatal test runner error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
