import { ethers } from 'ethers';
import { FlashLoanExecutor } from '../src/execution/FlashLoanExecutor';
import fs from 'fs';

// Test scenarios for all 4 arbitrage strategies
const testScenarios = [
  {
    name: 'Multi-Hop Cyclic Arbitrage (4 DEXs)',
    strategy: 'Multi-Hop Cyclic Arbitrage',
    opportunity: {
      id: 'test-multi-hop-001',
      timestamp: Date.now(),
      strategy: 'Multi-Hop Cyclic Arbitrage',
      profitPercent: 0.15,
      path: ['WETH', 'USDC', 'DAI', 'WETH'],
      pools: [
        '0x4200000000000000000000000000000000000006',
        '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913',
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb'
      ],
      estimatedGas: 300000,
      profitAfterGas: 0.1,
      status: 'detected' as const,
      dexTypes: ['UniswapV3', 'UniswapV2', 'SushiSwapV3'],
      dexIdentifiers: ['UniswapV3', 'UniswapV2', 'SushiSwapV3'],
      poolFees: [500, 3000, 2500]
    }
  },
  {
    name: 'Fee-Tier Mispricing (Same DEX, Different Fees)',
    strategy: 'Fee-Tier Mispricing Arbitrage',
    opportunity: {
      id: 'test-fee-tier-001',
      timestamp: Date.now(),
      strategy: 'Fee-Tier Mispricing Arbitrage',
      profitPercent: 0.2,
      path: ['WETH', 'USDC', 'WETH'],
      pools: [
        '0x4200000000000000000000000000000000000006',
        '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913'
      ],
      estimatedGas: 200000,
      profitAfterGas: 0.15,
      status: 'detected' as const,
      dexTypes: ['UniswapV3', 'UniswapV3'],
      dexIdentifiers: ['UniswapV3', 'UniswapV3'],
      poolFees: [100, 3000]
    }
  },
  {
    name: 'Liquidity Fragmentation (Different DEXs)',
    strategy: 'Liquidity Fragmentation Arbitrage',
    opportunity: {
      id: 'test-fragmentation-001',
      timestamp: Date.now(),
      strategy: 'Liquidity Fragmentation Arbitrage',
      profitPercent: 0.12,
      path: ['WETH', 'USDC', 'WETH'],
      pools: [
        '0x4200000000000000000000000000000000000006',
        '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913'
      ],
      estimatedGas: 250000,
      profitAfterGas: 0.08,
      status: 'detected' as const,
      dexTypes: ['AerodromeV2', 'PancakeSwapV3'],
      dexIdentifiers: ['Aerodrome', 'PancakeSwap V3'],
      poolFees: [3000, 500]
    }
  },
  {
    name: 'Stable-Volatile Curve (3 DEXs)',
    strategy: 'Stable ↔ Volatile Curve Arbitrage',
    opportunity: {
      id: 'test-stable-volatile-001',
      timestamp: Date.now(),
      strategy: 'Stable ↔ Volatile Curve Arbitrage',
      profitPercent: 0.25,
      path: ['USDC', 'DAI', 'WETH', 'USDC'],
      pools: [
        '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913',
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
        '0x4200000000000000000000000000000000000006'
      ],
      estimatedGas: 350000,
      profitAfterGas: 0.2,
      status: 'detected' as const,
      dexTypes: ['Curve', 'AerodromeV3', 'UniswapV3'],
      dexIdentifiers: ['Curve', 'Aerodrome SlipStream', 'UniswapV3'],
      poolFees: [0, 3000, 3000]
    }
  }
];

async function runComprehensiveTest() {
  console.log('🔬 Comprehensive Arbitrage Execution Test');
  console.log('='.repeat(70));
  console.log();
  
  const testResults: any[] = [];
  let passedTests = 0;
  let failedTests = 0;
  
  try {
    // Load config
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    console.log('✅ Config loaded');
    console.log(`   Min Profit: ${config.minProfitPercent}%`);
    console.log();
    
    // Create executor instance
    console.log('🔧 Creating FlashLoanExecutor...');
    const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const contractAddress = '0x0000000000000000000000000000000000000001';
    const executor = new FlashLoanExecutor(privateKey, contractAddress);
    console.log('✅ FlashLoanExecutor created');
    console.log();
    
    // Test each scenario
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n${'='.repeat(70)}`);
      console.log(`TEST ${i + 1}: ${scenario.name}`);
      console.log('='.repeat(70));
      
      const result = await testScenario(scenario, executor);
      testResults.push(result);
      
      if (result.passed) {
        passedTests++;
        console.log(`\n✅ TEST PASSED`);
      } else {
        failedTests++;
        console.log(`\n❌ TEST FAILED`);
        console.log(`   Issues: ${result.issues.join(', ')}`);
      }
    }
    
    // Print summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testScenarios.length}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / testScenarios.length) * 100).toFixed(1)}%`);
    console.log();
    
    if (failedTests === 0) {
      console.log('🎉 ALL TESTS PASSED! System is production-ready.');
    } else {
      console.log('⚠️  Some tests failed. Review the issues above.');
    }
    
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Test suite failed with error:');
    console.error(error);
  }
}

async function testScenario(scenario: any, executor: any) {
  const result: any = {
    name: scenario.name,
    strategy: scenario.strategy,
    passed: true,
    issues: [],
    details: {}
  };
  
  try {
    // Build flash loan parameters
    const flashLoanParams = (executor as any).buildFlashLoanParams(scenario.opportunity);
    result.details.flashLoanParams = flashLoanParams;
    
    console.log('\n📊 Flash Loan Parameters:');
    console.log(`   Asset: ${flashLoanParams.asset}`);
    console.log(`   Amount: ${ethers.formatEther(flashLoanParams.amount)} tokens`);
    console.log(`   Swaps: ${flashLoanParams.swapParams.swaps.length}`);
    console.log(`   DEX Path: ${flashLoanParams.swapParams.dexPath}`);
    console.log(`   Min Profit: ${ethers.formatEther(flashLoanParams.swapParams.minProfitAmount)} tokens`);
    
    // Verify swaps
    console.log('\n📝 Swap Verification:');
    const swapVerification = verifySwaps(flashLoanParams.swapParams.swaps, scenario.opportunity);
    result.details.swapVerification = swapVerification;
    
    if (!swapVerification.passed) {
      result.passed = false;
      result.issues.push(...swapVerification.issues);
    }
    
    // Display swap details
    flashLoanParams.swapParams.swaps.forEach((swap: any, index: number) => {
      console.log(`\n   Swap ${index + 1}:`);
      console.log(`   ├─ DEX Type: ${swap.dexType} (${getDexTypeName(swap.dexType)})`);
      console.log(`   ├─ Token In: ${swap.tokenIn}`);
      console.log(`   ├─ Token Out: ${swap.tokenOut}`);
      console.log(`   ├─ Amount: ${ethers.formatEther(swap.amount)}`);
      console.log(`   ├─ Min Amount: ${ethers.formatEther(swap.minAmount)} (slippage: ${calculateSlippage(swap.amount, swap.minAmount).toFixed(3)}%)`);
      console.log(`   ├─ Router: ${swap.dexRouter}`);
      console.log(`   ├─ Fee: ${swap.fee / 10000}%`);
      console.log(`   └─ Swap Data: ${swap.swapData}`);
    });
    
    // Verify flash loan asset
    const assetVerification = verifyFlashLoanAsset(flashLoanParams, scenario.opportunity);
    result.details.assetVerification = assetVerification;
    
    if (!assetVerification.passed) {
      result.passed = false;
      result.issues.push(...assetVerification.issues);
    }
    
    console.log(`\n✅ Flash Loan Asset: ${assetVerification.passed ? 'Correct' : 'Incorrect'}`);
    
    // Test encoding
    console.log('\n🔐 Testing SwapParams Encoding...');
    const encodingTest = testEncoding(flashLoanParams.swapParams);
    result.details.encodingTest = encodingTest;
    
    if (!encodingTest.passed) {
      result.passed = false;
      result.issues.push(...encodingTest.issues);
    }
    
    console.log(`   Encoding: ${encodingTest.passed ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Encoded Length: ${encodingTest.encodedLength} bytes`);
    
    // Verify DEX type mapping
    const dexTypeVerification = verifyDexTypeMapping(flashLoanParams.swapParams.swaps, scenario.opportunity.dexTypes);
    result.details.dexTypeVerification = dexTypeVerification;
    
    if (!dexTypeVerification.passed) {
      result.passed = false;
      result.issues.push(...dexTypeVerification.issues);
    }
    
    console.log(`\n✅ DEX Type Mapping: ${dexTypeVerification.passed ? 'Correct' : 'Incorrect'}`);
    
    // Verify fee tiers
    const feeVerification = verifyFeeTiers(flashLoanParams.swapParams.swaps, scenario.opportunity.poolFees);
    result.details.feeVerification = feeVerification;
    
    if (!feeVerification.passed) {
      result.passed = false;
      result.issues.push(...feeVerification.issues);
    }
    
    console.log(`✅ Fee Tiers: ${feeVerification.passed ? 'Correct' : 'Incorrect'}`);
    
    // Verify slippage protection
    const slippageVerification = verifySlippageProtection(flashLoanParams.swapParams.swaps);
    result.details.slippageVerification = slippageVerification;
    
    if (!slippageVerification.passed) {
      result.passed = false;
      result.issues.push(...slippageVerification.issues);
    }
    
    console.log(`✅ Slippage Protection: ${slippageVerification.passed ? 'Correct' : 'Incorrect'}`);
    
  } catch (error) {
    result.passed = false;
    result.issues.push(`Error: ${error}`);
    console.error(`\n❌ Error testing scenario: ${error}`);
  }
  
  return result;
}

function verifySwaps(swaps: any[], opportunity: any) {
  const result: any = { passed: true, issues: [] };
  
  // Check number of swaps
  if (swaps.length !== opportunity.pools.length) {
    result.passed = false;
    result.issues.push(`Swap count mismatch: expected ${opportunity.pools.length}, got ${swaps.length}`);
  }
  
  // Check token flow
  const path = opportunity.path;
  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    
    // Token In should match path[i]
    if (swap.tokenIn.toLowerCase() !== getTokenAddress(path[i]).toLowerCase()) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: Token In mismatch`);
    }
    
    // Token Out should match path[i+1]
    if (swap.tokenOut.toLowerCase() !== getTokenAddress(path[i + 1]).toLowerCase()) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: Token Out mismatch`);
    }
    
    // Check router address
    const expectedRouter = getRouterAddress(opportunity.dexIdentifiers[i]);
    if (swap.dexRouter.toLowerCase() !== expectedRouter.toLowerCase()) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: Router mismatch`);
    }
  }
  
  return result;
}

function verifyFlashLoanAsset(params: any, opportunity: any) {
  const result: any = { passed: true, issues: [] };
  
  const path = opportunity.path;
  const expectedAsset = path.includes('USDC') ? 
    '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913' : 
    '0x4200000000000000000000000000000000000006';
  
  if (params.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
    result.passed = false;
    result.issues.push(`Flash loan asset incorrect`);
  }
  
  return result;
}

function verifyDexTypeMapping(swaps: any[], dexTypes: string[]) {
  const result: any = { passed: true, issues: [] };
  
  const expectedMappings: Record<string, number> = {
    'UniswapV2': 0,
    'UniswapV3': 1,
    'UniswapV4': 2,
    'Curve': 3,
    'AerodromeV2': 4,
    'AerodromeV3': 5,
    'SushiSwapV3': 6,
    'PancakeSwapV3': 7,
    'BaseSwap': 8,
    'Hydrex': 9
  };
  
  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    const dexType = dexTypes[i];
    const expectedType = expectedMappings[dexType] || expectedMappings['UniswapV2'];
    
    if (swap.dexType !== expectedType) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: DEX type mismatch (expected ${expectedType}, got ${swap.dexType})`);
    }
  }
  
  return result;
}

function verifyFeeTiers(swaps: any[], poolFees: number[]) {
  const result: any = { passed: true, issues: [] };
  
  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    const expectedFee = poolFees[i] || 3000;
    
    if (swap.fee !== expectedFee) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: Fee mismatch (expected ${expectedFee}, got ${swap.fee})`);
    }
  }
  
  return result;
}

function verifySlippageProtection(swaps: any[]) {
  const result: any = { passed: true, issues: [] };
  
  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    const slippage = calculateSlippage(swap.amount, swap.minAmount);
    
    // Slippage should be between 0.01% and 0.3%
    if (slippage < 0.01 || slippage > 0.3) {
      result.passed = false;
      result.issues.push(`Swap ${i + 1}: Invalid slippage (${slippage.toFixed(3)}%)`);
    }
  }
  
  return result;
}

function testEncoding(swapParams: any) {
  const result: any = { passed: true, issues: [], encodedLength: 0 };
  
  try {
    const swapsArray = swapParams.swaps.map((swap: any) => [
      swap.dexType,
      swap.tokenIn,
      swap.tokenOut,
      swap.amount,
      swap.minAmount,
      swap.dexRouter,
      swap.fee,
      swap.swapData
    ]);
    
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(uint8,address,address,uint256,uint256,address,uint24,bytes)[]',
        'uint256',
        'string'
      ],
      [
        swapsArray,
        swapParams.minProfitAmount,
        swapParams.dexPath
      ]
    );
    
    result.encodedLength = encoded.length;
    
    // Test decoding
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      [
        'tuple(uint8,address,address,uint256,uint256,address,uint24,bytes)[]',
        'uint256',
        'string'
      ],
      encoded
    );
    
    const decodedSwaps = decoded[0];
    const decodedMinProfit = decoded[1];
    const decodedDexPath = decoded[2];
    
    if (decodedSwaps.length !== swapParams.swaps.length) {
      result.passed = false;
      result.issues.push('Decoding failed: swap count mismatch');
    }
    
    if (decodedMinProfit !== swapParams.minProfitAmount) {
      result.passed = false;
      result.issues.push('Decoding failed: min profit mismatch');
    }
    
    if (decodedDexPath !== swapParams.dexPath) {
      result.passed = false;
      result.issues.push('Decoding failed: dex path mismatch');
    }
    
  } catch (error) {
    result.passed = false;
    result.issues.push(`Encoding error: ${error}`);
  }
  
  return result;
}

function getTokenAddress(symbol: string): string {
  const addresses: Record<string, string> = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fcd6edE6E08F4C7C32d4F71B54bda02913',
    'USDbC': '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca',
    'DAI': '0x50c5725949a6f0c72e6c4a641f24049a917db0cb'
  };
  return addresses[symbol] || '';
}

function getRouterAddress(dexIdentifier: string): string {
  const routers: Record<string, string> = {
    'UniswapV2': '0x4752ba5dbc23f44d87826276bf6fd6b1c1252c36',
    'UniswapV3': '0x33128a8fc17869897dce68ed026d694621f6fdfd',
    'UniswapV4': '0x33128a8fc17869897dce68ed026d694621f6fdfd',
    'Curve': '0x445fe580ef8d70ff569ab36e80c647af338db351',
    'Aerodrome': '0xcfe90b3e7d4c8b2d11c5115d6240226f2f5fd937',
    'AerodromeV2': '0xcfe90b3e7d4c8b2d11c5115d6240226f2f5fd937',
    'AerodromeV3': '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
    'Aerodrome SlipStream': '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
    'SushiSwapV3': '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506',
    'SushiSwap V3': '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506',
    'PancakeSwapV3': '0x1b81d678ffb9c0263b24a97847620c99d213eb14',
    'PancakeSwap V3': '0x1b81d678ffb9c0263b24a97847620c99d213eb14',
    'BaseSwap': '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    'Hydrex': '0x8c1a3cf8f83074169fe5d7ad50b978e1cd6b37c7'
  };
  return routers[dexIdentifier] || routers['UniswapV2'];
}

function getDexTypeName(dexType: number): string {
  const types: Record<number, string> = {
    0: 'UniswapV2',
    1: 'UniswapV3',
    2: 'UniswapV4',
    3: 'Curve',
    4: 'AerodromeV2',
    5: 'AerodromeV3',
    6: 'SushiSwapV3',
    7: 'PancakeSwapV3',
    8: 'BaseSwap',
    9: 'Hydrex'
  };
  return types[dexType] || 'Unknown';
}

function calculateSlippage(amount: bigint, minAmount: bigint): number {
  const amountNum = Number(amount);
  const minAmountNum = Number(minAmount);
  return ((amountNum - minAmountNum) / amountNum) * 100;
}

// Run the comprehensive test
runComprehensiveTest();