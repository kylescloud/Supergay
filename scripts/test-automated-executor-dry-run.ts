import { ethers } from 'ethers';
import { config } from 'dotenv';
import * as fs from 'fs';
import { PRIVATE_RPC_NODES } from '../src/config/constants.js';

config();

// Configuration
const RPC_URL = process.env.RPC_URL || PRIVATE_RPC_NODES[0];
const QUICKNODE_RPC = process.env.QUICKNODE_RPC || RPC_URL;

console.log('\n=== Testing Automated Executor (Dry Run) ===\n');
console.log(`Using RPC: ${QUICKNODE_RPC}`);

// Test RPC connection
async function testRPC() {
  try {
    const provider = new ethers.JsonRpcProvider(QUICKNODE_RPC);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ RPC connected - Current block: ${blockNumber}`);
    return true;
  } catch (error: any) {
    console.log(`❌ RPC connection failed: ${error.message}`);
    return false;
  }
}

// Test config loading
function testConfig() {
  try {
    if (fs.existsSync('config.json')) {
      const configData = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      console.log(`✅ Config loaded`);
      console.log(`   minProfitPercent: ${configData.minProfitPercent}%`);
      console.log(`   minProfitAfterGas: ${configData.minProfitAfterGas}%`);
      console.log(`   executionEnabled: ${configData.executionEnabled}`);
      console.log(`   maxGasPrice: ${ethers.formatUnits(configData.maxGasPrice, 'gwei')} gwei`);
      return true;
    }
    return false;
  } catch (error: any) {
    console.log(`❌ Config loading failed: ${error.message}`);
    return false;
  }
}

// Test pool registry
function testPoolRegistry() {
  try {
    if (fs.existsSync('data/pool-registry.json')) {
      const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
      const activePools = registry.pools.filter((p: any) => p.isActive);
      console.log(`✅ Pool registry loaded`);
      console.log(`   Total pools: ${registry.pools.length}`);
      console.log(`   Active pools: ${activePools.length}`);
      return true;
    }
    return false;
  } catch (error: any) {
    console.log(`❌ Pool registry loading failed: ${error.message}`);
    return false;
  }
}

// Create mock scanning results
function createMockResults() {
  try {
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const mockResults = {
      timestamp: Date.now(),
      opportunities: [
        {
          id: 'dry-run-opp-1',
          timestamp: Date.now(),
          strategy: 'Multi-Hop Cyclic Arbitrage',
          profitPercent: 0.5,
          path: ['WETH', 'USDC', 'DAI', 'WETH'],
          pools: ['pool-1', 'pool-2', 'pool-3'],
          estimatedGas: 200000,
          profitAfterGas: 0.35,
          status: 'detected'
        }
      ]
    };

    fs.writeFileSync(
      dataDir + '/scanning-results.json',
      JSON.stringify(mockResults, null, 2)
    );
    console.log(`✅ Mock scanning results created`);
    return true;
  } catch (error: any) {
    console.log(`❌ Mock results creation failed: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  const results: { test: string; passed: boolean }[] = [];

  console.log('\nRunning tests...\n');

  results.push({ test: 'RPC Connection', passed: await testRPC() });
  results.push({ test: 'Config Loading', passed: testConfig() });
  results.push({ test: 'Pool Registry', passed: testPoolRegistry() });
  results.push({ test: 'Mock Results', passed: createMockResults() });

  console.log('\n=== Test Results ===\n');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.test}`);
  });

  console.log(`\n${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n✅ All tests passed! The automated executor is ready to run.');
    console.log('\nNote: To run the actual executor, deploy the smart contract first');
    console.log('      and update FLASH_LOAN_CONTRACT in .env with the deployed address.');
  } else {
    console.log('\n❌ Some tests failed. Please fix the issues above.');
  }

  // Cleanup
  try {
    fs.unlinkSync('data/scanning-results.json');
    console.log('\n✅ Cleaned up mock data');
  } catch (error) {
    // Ignore
  }
}

main().catch(console.error);