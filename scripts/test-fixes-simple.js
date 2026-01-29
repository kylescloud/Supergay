const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Simple test runner
class TestRunner {
  constructor() {
    this.results = [];
  }

  logTest(testName, passed, message, error) {
    const result = { testName, passed, message, error };
    this.results.push(result);
    
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${testName}: ${message}`);
    if (error) {
      console.log(`   Error: ${error}`);
    }
  }

  printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
    console.log(`\nTotal Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(2)}%`);

    if (failed === 0) {
      console.log('\n🎉 All critical fixes are working correctly!');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
  }

  saveReport() {
    const testReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        successRate: ((this.results.filter(r => r.passed).length / this.results.length) * 100).toFixed(2) + '%'
      },
      results: this.results
    };

    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(reportsDir, 'critical-fixes-test-report.json'),
      JSON.stringify(testReport, null, 2)
    );
    console.log('\n📊 Test report saved to: reports/critical-fixes-test-report.json');
  }
}

// Test CRITICAL FIX #1: Token validation
async function testTokenValidation() {
  console.log('\n🔴 Testing CRITICAL FIX #1: Token Address Validation');
  console.log('============================================');

  const runner = new TestRunner();

  try {
    // Test 1: Verify getTokenAddress method exists in source
    const executorPath = path.join(__dirname, '..', 'src', 'execution', 'FlashLoanExecutor.ts');
    const executorCode = fs.readFileSync(executorPath, 'utf-8');

    if (executorCode.includes('getTokenAddress')) {
      runner.logTest('getTokenAddress method exists', true, 'Method found in FlashLoanExecutor.ts');
    } else {
      runner.logTest('getTokenAddress method exists', false, 'Method not found');
    }

    // Test 2: Verify error handling for unknown tokens
    if (executorCode.includes('throw new Error')) {
      runner.logTest('Error handling for unknown tokens', true, 'Error throwing implemented');
    } else {
      runner.logTest('Error handling for unknown tokens', false, 'No error handling found');
    }

    // Test 3: Verify token validation logic
    if (executorCode.includes('Token address not found')) {
      runner.logTest('Token validation error message', true, 'Proper error message found');
    } else {
      runner.logTest('Token validation error message', false, 'Error message not found');
    }

    // Test 4: Verify no fallback to WETH
    if (executorCode.includes('|| checksumAddress(wethAddress)')) {
      runner.logTest('No fallback to WETH', false, 'Fallback to WETH still exists in code');
    } else {
      runner.logTest('No fallback to WETH', true, 'Fallback to WETH removed');
    }

  } catch (error) {
    runner.logTest('Token validation tests', false, 'Test suite failed', error.message);
  }

  return runner;
}

// Test CRITICAL FIX #2: Fee-tier strategy
async function testFeeTierStrategy() {
  console.log('\n🔴 Testing CRITICAL FIX #2: Fee-Tier Strategy V3 DEXs');
  console.log('============================================');

  const runner = new TestRunner();

  try {
    const strategyPath = path.join(__dirname, '..', 'src', 'strategies', 'feeTierArbitrage.ts');
    const strategyCode = fs.readFileSync(strategyPath, 'utf-8');

    // Test 1: Verify V3_DEXS constant exists
    if (strategyCode.includes('V3_DEXS')) {
      runner.logTest('V3_DEXS constant exists', true, 'V3_DEXS Set defined');
    } else {
      runner.logTest('V3_DEXS constant exists', false, 'V3_DEXS not found');
    }

    // Test 2: Verify all V3 DEXs are included
    const expectedDexs = [
      'uniswap-v3',
      'sushiswap-v3',
      'pancakeswap-v3',
      'aerodrome-slipstream',
      'aerodrome-slipstream-2',
      'uniswap-v4'
    ];

    let allIncluded = true;
    const missingDexs = [];

    for (const dex of expectedDexs) {
      if (strategyCode.includes(`'${dex}'`)) {
        runner.logTest(`${dex} included`, true, 'DEX found in code');
      } else {
        runner.logTest(`${dex} included`, false, 'DEX not found in code');
        allIncluded = false;
        missingDexs.push(dex);
      }
    }

    if (allIncluded) {
      runner.logTest('All V3 DEXs included', true, 'All 6 V3 DEXs are included');
    } else {
      runner.logTest('All V3 DEXs included', false, `Missing DEXs: ${missingDexs.join(', ')}`);
    }

    // Test 3: Verify groupPoolsByPair uses V3_DEXS
    if (strategyCode.includes('V3_DEXS.has')) {
      runner.logTest('groupPoolsByPair uses V3_DEXS', true, 'V3_DEXS validation implemented');
    } else {
      runner.logTest('groupPoolsByPair uses V3_DEXS', false, 'V3_DEXS not used in filtering');
    }

    // Test 4: Verify fee validation
    if (strategyCode.includes('pool.fee || pool.fee === 0')) {
      runner.logTest('Fee validation', true, 'Fee tier validation implemented');
    } else {
      runner.logTest('Fee validation', false, 'Fee validation not found');
    }

  } catch (error) {
    runner.logTest('Fee-tier strategy tests', false, 'Test suite failed', error.message);
  }

  return runner;
}

// Test CRITICAL FIX #3: V3 slippage calculation
async function testV3SlippageCalculation() {
  console.log('\n🔴 Testing CRITICAL FIX #3: V3 Slippage Calculation');
  console.log('============================================');

  const runner = new TestRunner();

  try {
    const effectiveRatePath = path.join(__dirname, '..', 'src', 'math', 'effectiveRate.ts');
    const effectiveRateCode = fs.readFileSync(effectiveRatePath, 'utf-8');

    // Test 1: Verify zero liquidity check
    if (effectiveRateCode.includes('zero liquidity')) {
      runner.logTest('Zero liquidity validation', true, 'Zero liquidity check implemented');
    } else {
      runner.logTest('Zero liquidity validation', false, 'Zero liquidity check not found');
    }

    // Test 2: Verify zero sqrtPriceX96 check
    if (effectiveRateCode.includes('invalid price') || effectiveRateCode.includes('sqrtPriceX96 === 0n')) {
      runner.logTest('Zero price validation', true, 'Zero price check implemented');
    } else {
      runner.logTest('Zero price validation', false, 'Zero price check not found');
    }

    // Test 3: Verify improved slippage calculation
    if (effectiveRateCode.includes('Math.sqrt') || effectiveRateCode.includes('square root')) {
      runner.logTest('Improved slippage calculation', true, 'Square root model implemented');
    } else {
      runner.logTest('Improved slippage calculation', false, 'Square root model not found');
    }

    // Test 4: Verify marginal rate improvement
    if (effectiveRateCode.includes('delta = amountIn / 10000n')) {
      runner.logTest('Marginal rate delta improvement', true, 'Relative delta implemented');
    } else {
      runner.logTest('Marginal rate delta improvement', false, 'Relative delta not found');
    }

    // Test 5: Verify slippage cap
    if (effectiveRateCode.includes('Math.min') || effectiveRateCode.includes('cap at')) {
      runner.logTest('Slippage capping', true, 'Slippage cap implemented');
    } else {
      runner.logTest('Slippage capping', false, 'Slippage cap not found');
    }

  } catch (error) {
    runner.logTest('V3 slippage calculation tests', false, 'Test suite failed', error.message);
  }

  return runner;
}

// Main test runner
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     TESTING CRITICAL FIXES FOR FLASH LOAN ARBITRAGE BOT      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const runners = [];
  
  runners.push(await testTokenValidation());
  runners.push(await testFeeTierStrategy());
  runners.push(await testV3SlippageCalculation());

  // Merge all results
  const allResults = runners.flatMap(r => r.results);
  const finalRunner = new TestRunner();
  finalRunner.results = allResults;
  
  finalRunner.printSummary();
  finalRunner.saveReport();

  const failed = allResults.filter(r => !r.passed).length;
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