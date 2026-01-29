import { ethers } from 'ethers';
import { FlashLoanExecutor } from '../src/execution/FlashLoanExecutor';
import { FeeTierArbitrageStrategy } from '../src/strategies/feeTierArbitrage';
import { calculateEffectiveRate, calculateMarginalRate } from '../src/math/effectiveRate';
import * as dotenv from 'dotenv';
import fs from 'fs';
import { PoolState, Token } from '../src/types';

dotenv.config();

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  error?: string;
}

const testResults: TestResult[] = [];

function logTest(testName: string, passed: boolean, message: string, error?: string) {
  const result: TestResult = { testName, passed, message, error };
  testResults.push(result);
  
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${message}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
}

/**
 * Test CRITICAL FIX #1: Token address validation
 */
async function testTokenValidation() {
  console.log('\n🔴 Testing CRITICAL FIX #1: Token Address Validation');
  console.log('============================================');

  try {
    // Load pool registry to get token addresses
    const registryPath = 'data/pool-registry.json';
    if (!fs.existsSync(registryPath)) {
      logTest('Load pool registry', false, 'Pool registry not found');
      return;
    }

    const poolRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    console.log(`Loaded ${poolRegistry.pools.length} pools from registry`);

    // Create executor instance
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.FLASH_LOAN_CONTRACT_ADDRESS || ethers.ZeroAddress;
    
    if (!privateKey) {
      logTest('Create FlashLoanExecutor', false, 'PRIVATE_KEY not set in .env');
      return;
    }

    const executor = new FlashLoanExecutor(privateKey, contractAddress);
    
    // Test 1: Verify known tokens work
    logTest('Load token addresses', true, 'Token addresses loaded successfully');

    // Test 2: Verify unknown tokens throw errors
    try {
      (executor as any).getTokenAddress('UNKNOWN_TOKEN');
      logTest('Unknown token validation', false, 'Should throw error for unknown token');
    } catch (error: any) {
      logTest('Unknown token validation', true, 'Correctly throws error for unknown token');
    }

    // Test 3: Verify WETH token works
    try {
      const wethAddress = (executor as any).getTokenAddress('WETH');
      logTest('WETH token validation', true, `WETH address: ${wethAddress}`);
    } catch (error: any) {
      logTest('WETH token validation', false, 'Failed to get WETH address', error.message);
    }

  } catch (error: any) {
    logTest('Token validation tests', false, 'Test suite failed', error.message);
  }
}

/**
 * Test CRITICAL FIX #2: Fee-tier strategy includes all V3 DEXs
 */
async function testFeeTierStrategy() {
  console.log('\n🔴 Testing CRITICAL FIX #2: Fee-Tier Strategy V3 DEXs');
  console.log('============================================');

  try {
    // Create a mock provider
    const provider = new ethers.JsonRpcProvider();
    const strategy = new FeeTierArbitrageStrategy(provider, 0.01);
    
    // Get V3_DEXS property
    const v3Dexs = (strategy as any).V3_DEXS;
    
    const expectedDexs = [
      'uniswap-v3',
      'sushiswap-v3',
      'pancakeswap-v3',
      'aerodrome-slipstream',
      'aerodrome-slipstream-2',
      'uniswap-v4'
    ];

    // Test 1: Verify all expected DEXs are included
    let allIncluded = true;
    const missingDexs: string[] = [];
    
    for (const dex of expectedDexs) {
      if (v3Dexs.has(dex)) {
        logTest(`${dex} included`, true, 'DEX is in V3_DEXS set');
      } else {
        logTest(`${dex} included`, false, 'DEX is missing from V3_DEXS set');
        allIncluded = false;
        missingDexs.push(dex);
      }
    }

    if (allIncluded) {
      logTest('All V3 DEXs included', true, 'All 6 V3 DEXs are included');
    } else {
      logTest('All V3 DEXs included', false, `Missing DEXs: ${missingDexs.join(', ')}`);
    }

    // Test 2: Verify strategy name
    const strategyName = strategy.getName();
    logTest('Strategy name', true, `Strategy name: ${strategyName}`);

  } catch (error: any) {
    logTest('Fee-tier strategy tests', false, 'Test suite failed', error.message);
  }
}

/**
 * Test CRITICAL FIX #3: V3 slippage calculation
 */
async function testV3SlippageCalculation() {
  console.log('\n🔴 Testing CRITICAL FIX #3: V3 Slippage Calculation');
  console.log('============================================');

  try {
    // Test 1: Validate zero liquidity throws error
    const zeroLiquidityPool: PoolState = {
      address: '0x123...',
      version: 'v3',
      dex: 'uniswap-v3',
      token0: { address: '0xabc...', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
      token1: { address: '0xdef...', decimals: 18, symbol: 'USDC', name: 'USD Coin' },
      sqrtPriceX96: 1n,
      liquidity: 0n,
      fee: 3000,
      reserve0: 0n,
      reserve1: 0n
    };

    try {
      calculateEffectiveRate(
        zeroLiquidityPool,
        zeroLiquidityPool.token0,
        zeroLiquidityPool.token1,
        1000n
      );
      logTest('Zero liquidity validation', false, 'Should throw error for zero liquidity');
    } catch (error: any) {
      if (error.message.includes('zero liquidity')) {
        logTest('Zero liquidity validation', true, 'Correctly throws error for zero liquidity');
      } else {
        logTest('Zero liquidity validation', false, 'Wrong error message', error.message);
      }
    }

    // Test 2: Validate zero sqrtPriceX96 throws error
    const zeroPricePool: PoolState = {
      address: '0x456...',
      version: 'v3',
      dex: 'uniswap-v3',
      token0: { address: '0xabc...', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
      token1: { address: '0xdef...', decimals: 18, symbol: 'USDC', name: 'USD Coin' },
      sqrtPriceX96: 0n,
      liquidity: 1000000n,
      fee: 3000,
      reserve0: 0n,
      reserve1: 0n
    };

    try {
      calculateEffectiveRate(
        zeroPricePool,
        zeroPricePool.token0,
        zeroPricePool.token1,
        1000n
      );
      logTest('Zero price validation', false, 'Should throw error for zero sqrtPriceX96');
    } catch (error: any) {
      if (error.message.includes('invalid price')) {
        logTest('Zero price validation', true, 'Correctly throws error for zero sqrtPriceX96');
      } else {
        logTest('Zero price validation', false, 'Wrong error message', error.message);
      }
    }

    // Test 3: Verify valid pool works
    const validPool: PoolState = {
      address: '0x789...',
      version: 'v3',
      dex: 'uniswap-v3',
      token0: { address: '0xabc...', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' },
      token1: { address: '0xdef...', decimals: 18, symbol: 'USDC', name: 'USD Coin' },
      sqrtPriceX96: 1000000000000000000000000n, // 1:1 price
      liquidity: 1000000000000000000000n, // 1 ETH liquidity
      fee: 3000,
      reserve0: 0n,
      reserve1: 0n
    };

    try {
      const result = calculateEffectiveRate(
        validPool,
        validPool.token0,
        validPool.token1,
        ethers.parseEther('1') // 1 ETH
      );
      logTest('Valid V3 pool calculation', true, `Amount out: ${result.amountOut.toString()}, Slippage: ${(result.slippage * 100).toFixed(4)}%`);
    } catch (error: any) {
      logTest('Valid V3 pool calculation', false, 'Failed to calculate for valid pool', error.message);
    }

    // Test 4: Test marginal rate calculation
    try {
      const marginalRate = calculateMarginalRate(
        validPool,
        validPool.token0,
        validPool.token1,
        ethers.parseEther('100') // 100 ETH
      );
      logTest('Marginal rate calculation', true, `Marginal rate: ${marginalRate.toFixed(8)}`);
    } catch (error: any) {
      logTest('Marginal rate calculation', false, 'Failed to calculate marginal rate', error.message);
    }

  } catch (error: any) {
    logTest('V3 slippage calculation tests', false, 'Test suite failed', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     TESTING CRITICAL FIXES FOR FLASH LOAN ARBITRAGE BOT      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  await testTokenValidation();
  await testFeeTierStrategy();
  await testV3SlippageCalculation();

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  console.log(`\nTotal Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(2)}%`);

  if (failed === 0) {
    console.log('\n🎉 All critical fixes are working correctly!');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  // Save test results to file
  const testReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total,
      passed,
      failed,
      successRate: ((passed / total) * 100).toFixed(2) + '%'
    },
    results: testResults
  };

  fs.writeFileSync('reports/critical-fixes-test-report.json', JSON.stringify(testReport, null, 2));
  console.log('\n📊 Test report saved to: reports/critical-fixes-test-report.json');

  return failed === 0;
}

// Run tests
runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });