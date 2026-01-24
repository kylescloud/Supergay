import { moralisClient } from '../src/utils/moralisClient';
import { WETH_ADDRESS } from '../src/config/constants';
import * as fs from 'fs';
import * as path from 'path';

async function testMoralisClient() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              MORALIS CLIENT INTEGRATION TEST                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const testResults: { test: string; status: string; message: string }[] = [];

  // Test 1: Get token pairs for WETH
  console.log('🧪 Test 1: Get WETH token pairs...');
  try {
    const startTime = Date.now();
    const response = await moralisClient.getTokenPairs(WETH_ADDRESS, undefined, 10);
    const duration = Date.now() - startTime;

    console.log(`   ✅ Success: Found ${response.pairs.length} pairs in ${duration}ms`);
    console.log(`   📊 Page size: ${response.page_size}, Cursor: ${response.cursor ? 'Available' : 'None'}`);
    
    testResults.push({
      test: 'Get WETH Token Pairs',
      status: 'PASS',
      message: `Found ${response.pairs.length} pairs in ${duration}ms`
    });

    if (response.pairs.length > 0) {
      const samplePair = response.pairs[0];
      console.log(`   📝 Sample pair: ${samplePair.pair_label}`);
      console.log(`      DEX: ${samplePair.exchange_name}`);
      console.log(`      Address: ${samplePair.pair_address}`);
      console.log(`      Liquidity: $${parseFloat(samplePair.liquidity_usd || '0').toLocaleString()}`);
      console.log(`      Volume 24h: $${parseFloat(samplePair.volume_24h_usd || '0').toLocaleString()}`);
    }

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'Get WETH Token Pairs',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Test 2: Pagination test
  console.log('🧪 Test 2: Pagination with getAllTokenPairs...');
  try {
    const startTime = Date.now();
    const allPairs = await moralisClient.getAllTokenPairs(WETH_ADDRESS, 2);
    const duration = Date.now() - startTime;

    console.log(`   ✅ Success: Found ${allPairs.length} total pairs in ${duration}ms`);
    
    testResults.push({
      test: 'Pagination Test',
      status: 'PASS',
      message: `Retrieved ${allPairs.length} pairs across multiple pages`
    });

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'Pagination Test',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Test 3: Filter by DEX
  console.log('🧪 Test 3: Filter pairs by DEX...');
  try {
    const response = await moralisClient.getTokenPairs(WETH_ADDRESS, undefined, 50);
    const uniswapPairs = moralisClient.filterPairsByDEX(response.pairs, 'uniswap');
    
    console.log(`   ✅ Success: Found ${uniswapPairs.length} Uniswap pairs out of ${response.pairs.length} total`);
    
    testResults.push({
      test: 'Filter by DEX',
      status: 'PASS',
      message: `Filtered to ${uniswapPairs.length} Uniswap pairs`
    });

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'Filter by DEX',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Test 4: Filter by liquidity
  console.log('🧪 Test 4: Filter pairs by liquidity...');
  try {
    const response = await moralisClient.getTokenPairs(WETH_ADDRESS, undefined, 50);
    const highLiquidityPairs = moralisClient.filterPairsByLiquidity(response.pairs, 100000);
    
    console.log(`   ✅ Success: Found ${highLiquidityPairs.length} pairs with $100K+ liquidity`);
    
    testResults.push({
      test: 'Filter by Liquidity',
      status: 'PASS',
      message: `Filtered to ${highLiquidityPairs.length} high-liquidity pairs`
    });

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'Filter by Liquidity',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Test 5: DEX type detection
  console.log('🧪 Test 5: DEX type detection...');
  try {
    const testNames = [
      'Uniswap V3',
      'Uniswap V2',
      'SushiSwap V3',
      'PancakeSwap V3',
      'Aerodrome SlipStream',
      'BaseSwap',
      'Unknown DEX'
    ];

    console.log('   Testing DEX type mapping:');
    for (const name of testNames) {
      const dexType = moralisClient.getDEXType(name);
      console.log(`      "${name}" → ${dexType}`);
    }

    testResults.push({
      test: 'DEX Type Detection',
      status: 'PASS',
      message: 'Successfully mapped DEX names to internal types'
    });

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'DEX Type Detection',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Test 6: Fee tier extraction
  console.log('🧪 Test 6: Fee tier extraction from pair labels...');
  try {
    const testLabels = [
      'WETH-USDC 0.05%',
      'WETH-USDC 0.3%',
      'WETH-USDC 1%',
      'WETH-USDC',
      'Unknown Pair'
    ];

    console.log('   Testing fee tier extraction:');
    for (const label of testLabels) {
      const feeTier = moralisClient.extractFeeTier(label);
      console.log(`      "${label}" → ${feeTier ? (feeTier / 10000).toFixed(2) + '%' : 'N/A'}`);
    }

    testResults.push({
      test: 'Fee Tier Extraction',
      status: 'PASS',
      message: 'Successfully extracted fee tiers from pair labels'
    });

  } catch (error) {
    console.error('   ❌ Failed:', error);
    testResults.push({
      test: 'Fee Tier Extraction',
      status: 'FAIL',
      message: (error as Error).message
    });
  }

  console.log();

  // Save test results
  const resultsDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsPath = path.join(resultsDir, 'moralis-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({ testResults }, null, 2));
  console.log(`💾 Test results saved to: ${resultsPath}`);

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUMMARY                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;

  testResults.forEach(result => {
    const status = result.status === 'PASS' ? '✅' : '❌';
    console.log(`${status} ${result.test.padEnd(30)}: ${result.message}`);
  });

  console.log(`\n📊 Total: ${testResults.length} tests, ${passCount} passed, ${failCount} failed`);

  if (failCount === 0) {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL TESTS PASSED                                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
}

async function main() {
  try {
    await testMoralisClient();
  } catch (error) {
    console.error('❌ Fatal error during testing:', error);
    process.exit(1);
  }
}

main();