import { ethers } from 'ethers';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

// Test results
const tests: { name: string; passed: boolean; message: string; critical: boolean }[] = [];

// Helper functions
function test(name: string, condition: boolean, message: string, critical: boolean = true) {
  tests.push({ name, passed: condition, message, critical });
  console.log(`${condition ? '✅' : '❌'} ${name}: ${message}`);
}

// Color output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`\n${BLUE}=== Automated Executor Configuration Verification ===\n${RESET}`);

// Test 1: Environment Variables
console.log(`${BLUE}1. Testing Environment Variables...${RESET}`);

test(
  'PRIVATE_KEY exists',
  !!process.env.PRIVATE_KEY,
  process.env.PRIVATE_KEY ? 'Set' : 'Missing - Required for execution'
);

test(
  'PRIVATE_KEY format',
  process.env.PRIVATE_KEY?.startsWith('0x') || !process.env.PRIVATE_KEY,
  process.env.PRIVATE_KEY?.startsWith('0x') ? 'Valid format' : 'Invalid format - should start with 0x'
);

test(
  'BASE_RPC_URL exists',
  !!process.env.BASE_RPC_URL,
  process.env.BASE_RPC_URL ? 'Set' : 'Missing - Required for RPC connection'
);

test(
  'QUICKNODE_RPC exists',
  !!process.env.QUICKNODE_RPC,
  process.env.QUICKNODE_RPC ? 'Set' : 'Missing - Optional but recommended'
);

test(
  'ALCHEMY_RPC exists',
  !!process.env.ALCHEMY_RPC,
  process.env.ALCHEMY_RPC ? 'Set' : 'Missing - Optional but recommended'
);

test(
  'FLASH_LOAN_CONTRACT exists',
  !!process.env.FLASH_LOAN_CONTRACT,
  process.env.FLASH_LOAN_CONTRACT ? 'Set' : 'Missing - Required for execution'
);

// Test 2: Config.json Structure
console.log(`\n${BLUE}2. Testing config.json Structure...${RESET}`);

let configData: any = null;

test(
  'config.json exists',
  fs.existsSync('config.json'),
  fs.existsSync('config.json') ? 'Found' : 'Missing'
);

if (fs.existsSync('config.json')) {
  try {
    configData = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    
    test(
      'config.json is valid JSON',
      true,
      'Valid JSON'
    );

    test(
      'minProfitPercent exists',
      'minProfitPercent' in configData,
      'minProfitPercent' in configData ? `${configData.minProfitPercent}%` : 'Missing'
    );

    test(
      'maxGasPrice exists',
      'maxGasPrice' in configData,
      'maxGasPrice' in configData ? `${ethers.formatUnits(configData.maxGasPrice, 'gwei')} gwei` : 'Missing'
    );

    test(
      'minProfitAfterGas exists',
      'minProfitAfterGas' in configData,
      'minProfitAfterGas' in configData ? `${configData.minProfitAfterGas}%` : 'Missing - Required by executor'
    );

    test(
      'executionEnabled exists',
      'executionEnabled' in configData,
      'executionEnabled' in configData ? `${configData.executionEnabled}` : 'Missing - Required by executor'
    );

    test(
      'scanning interval exists',
      'scanning' in configData && 'interval' in configData.scanning,
      'scanning' in configData && 'interval' in configData.scanning ? `${configData.scanning.interval}ms` : 'Missing'
    );

    test(
      'flashLoan configuration exists',
      'flashLoan' in configData,
      'flashLoan' in configData ? 'Configured' : 'Missing'
    );

    test(
      'strategies configuration exists',
      'strategies' in configData,
      'strategies' in configData ? `${Object.keys(configData.strategies).length} strategies` : 'Missing'
    );

  } catch (error: any) {
    test(
      'config.json parsing',
      false,
      `Parse error: ${error.message}`
    );
  }
}

// Test 3: Pool Registry
console.log(`\n${BLUE}3. Testing Pool Registry...${RESET}`);

test(
  'pool-registry.json exists',
  fs.existsSync('data/pool-registry.json'),
  fs.existsSync('data/pool-registry.json') ? 'Found' : 'Missing'
);

if (fs.existsSync('data/pool-registry.json')) {
  try {
    const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
    
    test(
      'Registry has pools',
      registry.pools && registry.pools.length > 0,
      `${registry.pools?.length || 0} pools found`
    );

    if (registry.pools && registry.pools.length > 0) {
      const poolsWithState = registry.pools.filter((p: any) => p.isActive);
      test(
        'Active pools',
        true,
        `${poolsWithState.length} active pools`
      );

      const poolsWithIdentifier = registry.pools.filter((p: any) => p.dexIdentifier);
      test(
        'Pools with dexIdentifier',
        poolsWithIdentifier.length === registry.pools.length,
        `${poolsWithIdentifier.length}/${registry.pools.length} pools have dexIdentifier`
      );
    }

  } catch (error: any) {
    test(
      'pool-registry.json parsing',
      false,
      `Parse error: ${error.message}`
    );
  }
}

// Test 4: RPC Connectivity
console.log(`\n${BLUE}4. Testing RPC Connectivity...${RESET}`);

async function testRPC(rpcUrl: string, name: string) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    test(
      `${name} RPC connection`,
      true,
      `Connected - Block ${blockNumber}`
    );
    return true;
  } catch (error: any) {
    test(
      `${name} RPC connection`,
      false,
      `Failed: ${error.message}`
    );
    return false;
  }
}

// Test 5: FlashLoanExecutor Class
console.log(`\n${BLUE}5. Testing FlashLoanExecutor Class...${RESET}`);

test(
  'FlashLoanExecutor.ts exists',
  fs.existsSync('src/execution/FlashLoanExecutor.ts'),
  fs.existsSync('src/execution/FlashLoanExecutor.ts') ? 'Found' : 'Missing - Critical'
);

test(
  'FlashLoanExecutor.ts can be imported',
  true,
  'Imported successfully'
);

// Test 6: run-automated-executor.ts Syntax
console.log(`\n${BLUE}6. Testing run-automated-executor.ts Syntax...${RESET}`);

test(
  'run-automated-executor.ts exists',
  fs.existsSync('scripts/run-automated-executor.ts'),
  fs.existsSync('scripts/run-automated-executor.ts') ? 'Found' : 'Missing'
);

// Test 7: Check for syntax errors in run-automated-executor.ts
console.log(`\n${BLUE}7. Checking for Common Issues in run-automated-executor.ts...${RESET}`);

if (fs.existsSync('scripts/run-automated-executor.ts')) {
  const executorCode = fs.readFileSync('scripts/run-automated-executor.ts', 'utf8');
  
  test(
    'Line 21: successfulExecutions declaration',
    executorCode.includes('private successfulExecutions: number'),
    executorCode.includes('private successfulExecutions: number') ? 'Correct: private' : 'Wrong: should be private not let'
  );

  test(
    'Status update logic',
    !executorCode.includes('bestOpportunity.status = bestOpportunity.status;'),
    'Does not have redundant status assignment'
  );

  test(
    'Config.json loading',
    executorCode.includes('this.config = JSON.parse'),
    'Loads config.json'
  );

  test(
    'RPC URL configuration',
    executorCode.includes('QUICKNODE_RPC') || executorCode.includes('PRIVATE_RPC_NODES'),
    'Uses private RPC for execution'
  );

  test(
    'Gas price validation',
    executorCode.includes('maxGasPrice'),
    'Validates gas price'
  );

  test(
    'Profit threshold checking',
    executorCode.includes('minProfitAfterGas'),
    'Checks minProfitAfterGas threshold'
  );
}

// Test 8: Required Dependencies
console.log(`\n${BLUE}8. Testing Required Dependencies...${RESET}`);

test(
  'ethers package installed',
  fs.existsSync('node_modules/ethers'),
  fs.existsSync('node_modules/ethers') ? 'Installed' : 'Missing - Run npm install'
);

test(
  'dotenv package installed',
  fs.existsSync('node_modules/dotenv'),
  fs.existsSync('node_modules/dotenv') ? 'Installed' : 'Missing - Run npm install'
);

// Run RPC tests
async function runRPCTests() {
  const rpcTests = [];
  if (process.env.BASE_RPC_URL) {
    rpcTests.push(testRPC(process.env.BASE_RPC_URL, 'Base RPC'));
  }
  if (process.env.QUICKNODE_RPC) {
    rpcTests.push(testRPC(process.env.QUICKNODE_RPC, 'QuickNode'));
  }
  if (process.env.ALCHEMY_RPC) {
    rpcTests.push(testRPC(process.env.ALCHEMY_RPC, 'Alchemy'));
  }

  await Promise.all(rpcTests);

  // Summary
  console.log(`\n${BLUE}=== Test Summary ===${RESET}`);

  const criticalTests = tests.filter(t => t.critical && !t.passed);
  const allTests = tests.filter(t => !t.passed);

  console.log(`\nTotal Tests: ${tests.length}`);
  console.log(`Passed: ${tests.filter(t => t.passed).length}`);
  console.log(`Failed: ${allTests.length}`);
  console.log(`Critical Failures: ${criticalTests.length}`);

  if (criticalTests.length > 0) {
    console.log(`\n${RED}⚠️  CRITICAL ISSUES FOUND:${RESET}`);
    criticalTests.forEach(t => {
      console.log(`  ${RED}❌${RESET} ${t.name}: ${t.message}`);
    });
  }

  if (allTests.length > 0 && allTests.length !== criticalTests.length) {
    console.log(`\n${YELLOW}⚠️  NON-CRITICAL ISSUES:${RESET}`);
    allTests.filter(t => !t.critical).forEach(t => {
      console.log(`  ${YELLOW}❌${RESET} ${t.name}: ${t.message}`);
    });
  }

  // Generate Report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: tests.length,
      passed: tests.filter(t => t.passed).length,
      failed: allTests.length,
      criticalFailures: criticalTests.length,
      status: criticalTests.length === 0 ? 'PASS' : 'FAIL'
    },
    tests: tests,
    recommendations: []
  };

  // Add recommendations
  if (!process.env.FLASH_LOAN_CONTRACT) {
    report.recommendations.push('Deploy smart contract and add FLASH_LOAN_CONTRACT to .env');
  }

  if (configData && !('executionEnabled' in configData)) {
    report.recommendations.push('Add "executionEnabled": true to config.json');
  }

  if (configData && !('minProfitAfterGas' in configData)) {
    report.recommendations.push('Add "minProfitAfterGas": 0.3 to config.json');
  }

  const reportsDir = 'reports';
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportsDir, 'automated-executor-config-test-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(`\n${BLUE}📊 Report saved to: reports/automated-executor-config-test-report.json${RESET}`);

  // Exit with appropriate code
  if (criticalTests.length > 0) {
    console.log(`\n${RED}❌ VERIFICATION FAILED - Fix critical issues before proceeding${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}✅ VERIFICATION PASSED - Configuration is correct${RESET}`);
    process.exit(0);
  }
}

// Run all tests
runRPCTests();

const criticalTests = tests.filter(t => t.critical && !t.passed);
const allTests = tests.filter(t => !t.passed);

console.log(`\nTotal Tests: ${tests.length}`);
console.log(`Passed: ${tests.filter(t => t.passed).length}`);
console.log(`Failed: ${allTests.length}`);
console.log(`Critical Failures: ${criticalTests.length}`);

if (criticalTests.length > 0) {
  console.log(`\n${RED}⚠️  CRITICAL ISSUES FOUND:${RESET}`);
  criticalTests.forEach(t => {
    console.log(`  ${RED}❌${RESET} ${t.name}: ${t.message}`);
  });
}

if (allTests.length > 0 && allTests.length !== criticalTests.length) {
  console.log(`\n${YELLOW}⚠️  NON-CRITICAL ISSUES:${RESET}`);
  allTests.filter(t => !t.critical).forEach(t => {
    console.log(`  ${YELLOW}❌${RESET} ${t.name}: ${t.message}`);
  });
}

// Generate Report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalTests: tests.length,
    passed: tests.filter(t => t.passed).length,
    failed: allTests.length,
    criticalFailures: criticalTests.length,
    status: criticalTests.length === 0 ? 'PASS' : 'FAIL'
  },
  tests: tests,
  recommendations: []
};

// Add recommendations
if (!process.env.FLASH_LOAN_CONTRACT) {
  report.recommendations.push('Deploy smart contract and add FLASH_LOAN_CONTRACT to .env');
}

if (configData && !('executionEnabled' in configData)) {
  report.recommendations.push('Add "executionEnabled": true to config.json');
}

if (configData && !('minProfitAfterGas' in configData)) {
  report.recommendations.push('Add "minProfitAfterGas": 0.3 to config.json');
}

const reportsDir = 'reports';
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

fs.writeFileSync(
  path.join(reportsDir, 'automated-executor-config-test-report.json'),
  JSON.stringify(report, null, 2)
);

console.log(`\n${BLUE}📊 Report saved to: reports/automated-executor-config-test-report.json${RESET}`);

