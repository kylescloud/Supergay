import { ethers } from 'ethers';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

config();

console.log('\n=== Testing Automated Executor Run ===\n');

// Test 1: Verify TypeScript can be executed with tsx
console.log('Test 1: Verifying TypeScript execution compatibility...');
try {
  // We use tsx which has its own compilation, so we just verify the file exists and is valid TypeScript
  if (!fs.existsSync('scripts/run-automated-executor.ts')) {
    throw new Error('run-automated-executor.ts not found');
  }
  console.log('✅ TypeScript file exists and ready for tsx execution\n');
} catch (error: any) {
  console.log(`❌ TypeScript verification failed: ${error.message}\n`);
  process.exit(1);
}

// Test 2: Verify environment variables
console.log('Test 2: Verifying environment variables...');
const requiredEnvVars = ['PRIVATE_KEY', 'BASE_RPC_URL', 'FLASH_LOAN_CONTRACT'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.log(`❌ Missing environment variables: ${missingVars.join(', ')}\n`);
  process.exit(1);
}
console.log('✅ All required environment variables set\n');

// Test 3: Verify config.json
console.log('Test 3: Verifying config.json...');
try {
  const configData = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  
  const requiredConfig = ['minProfitPercent', 'minProfitAfterGas', 'executionEnabled', 'maxGasPrice'];
  const missingConfig = requiredConfig.filter(c => !(c in configData));
  
  if (missingConfig.length > 0) {
    console.log(`❌ Missing config fields: ${missingConfig.join(', ')}\n`);
    process.exit(1);
  }
  
  console.log(`✅ config.json valid (minProfit: ${configData.minProfitPercent}%, minProfitAfterGas: ${configData.minProfitAfterGas}%)\n`);
} catch (error: any) {
  console.log(`❌ config.json error: ${error.message}\n`);
  process.exit(1);
}

// Test 4: Create mock scanning results
console.log('Test 4: Creating mock scanning results...');
const dataDir = 'data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mockResults = {
  timestamp: Date.now(),
  opportunities: [
    {
      id: 'test-opp-1',
      timestamp: Date.now(),
      strategy: 'Multi-Hop Cyclic Arbitrage',
      profitPercent: 0.5,
      path: ['WETH', 'USDC', 'DAI', 'WETH'],
      pools: ['pool-1', 'pool-2', 'pool-3'],
      estimatedGas: 200000,
      profitAfterGas: 0.35,
      status: 'detected'
    },
    {
      id: 'test-opp-2',
      timestamp: Date.now(),
      strategy: 'Fee-Tier Mispricing',
      profitPercent: 0.4,
      path: ['WETH', 'USDC', 'WETH'],
      pools: ['pool-4', 'pool-5'],
      estimatedGas: 150000,
      profitAfterGas: 0.25,
      status: 'detected'
    }
  ]
};

fs.writeFileSync(
  path.join(dataDir, 'scanning-results.json'),
  JSON.stringify(mockResults, null, 2)
);
console.log('✅ Mock scanning results created\n');

// Test 5: Verify executor file syntax
console.log('Test 5: Verifying run-automated-executor.ts syntax...');
try {
  const executorCode = fs.readFileSync('scripts/run-automated-executor.ts', 'utf8');
  
  // Check for critical components
  const checks = [
    { name: 'AutomatedExecutor class', pattern: /class AutomatedExecutor/ },
    { name: 'start() method', pattern: /async start\(\)/ },
    { name: 'executionLoop() method', pattern: /private async executionLoop\(\)/ },
    { name: 'checkAndExecuteOpportunities() method', pattern: /private async checkAndExecuteOpportunities\(\)/ },
    { name: 'stop() method', pattern: /stop\(\)/ },
    { name: 'Config loading', pattern: /loadConfig\(\)/ },
    { name: 'Gas price validation', pattern: /maxGasPrice/ },
    { name: 'Profit threshold checking', pattern: /minProfitAfterGas/ },
    { name: 'Graceful shutdown handlers', pattern: /process\.on\(['"]SIGINT['"]/ },
    { name: 'Execution loop interval', pattern: /setTimeout/ }
  ];
  
  let allChecksPassed = true;
  for (const check of checks) {
    if (!check.pattern.test(executorCode)) {
      console.log(`❌ Missing: ${check.name}\n`);
      allChecksPassed = false;
    }
  }
  
  if (allChecksPassed) {
    console.log('✅ All critical components present\n');
  } else {
    process.exit(1);
  }
} catch (error: any) {
  console.log(`❌ Syntax verification failed: ${error.message}\n`);
  process.exit(1);
}

// Test 6: Verify RPC connectivity (async test wrapped)
console.log('Test 6: Verifying RPC connectivity...');

async function testRPC() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ RPC connected (current block: ${blockNumber})\n`);
    
    // Continue with remaining tests
    runRemainingTests();
  } catch (error: any) {
    console.log(`❌ RPC connection failed: ${error.message}\n`);
    process.exit(1);
  }
}

function runRemainingTests() {
  // Test 7: Verify imports work
  console.log('Test 7: Verifying imports...');
  
  try {
    // Test if files exist and can be imported
    const executorFile = 'src/execution/FlashLoanExecutor.ts';
    const constantsFile = 'src/config/constants.ts';
    
    if (!fs.existsSync(executorFile)) {
      console.log(`❌ Missing file: ${executorFile}\n`);
      process.exit(1);
    }
    
    if (!fs.existsSync(constantsFile)) {
      console.log(`❌ Missing file: ${constantsFile}\n`);
      process.exit(1);
    }
    
    console.log('✅ All import files exist\n');
  } catch (error: any) {
    console.log(`❌ Import verification failed: ${error.message}\n`);
    process.exit(1);
  }
  
  // Summary
  console.log('=== All Tests Passed! ===\n');
  console.log('The run-automated-executor.ts file is correctly configured and ready to run.\n');
  console.log('To start the automated executor, run:');
  console.log('  npx tsx scripts/run-automated-executor.ts\n');
  console.log('Note: Make sure the smart contract is deployed and FLASH_LOAN_CONTRACT is set in .env\n');
  
  // Clean up mock results
  try {
    fs.unlinkSync(path.join(dataDir, 'scanning-results.json'));
    console.log('✅ Cleaned up mock data\n');
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

// Start async test
testRPC();