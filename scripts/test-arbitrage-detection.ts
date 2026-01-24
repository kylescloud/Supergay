import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG, FLASH_LOAN_PREMIUM, GAS_LIMITS, GAS_PRICES } from '../src/config/constants';
import fs from 'fs';

// Base mainnet RPC
const RPC_URL = 'https://mainnet.base.org';

// V3 Pool ABI for state updates
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

interface TestResult {
  flashLoanAmount: number;
  tokenSymbol: string;
  opportunitiesFound: number;
  scanTime: number;
  errors: string[];
}

async function main() {
  console.log('='.repeat(80));
  console.log('ARBITRAGE DETECTION TESTING');
  console.log('='.repeat(80));
  console.log();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const registry = new PoolRegistryManager();

  // Load existing registry
  console.log('📂 Loading pool registry...');
  await registry.load();

  // Load discovered pools
  console.log('📂 Loading discovered pools...');
  const discoveredPools = JSON.parse(fs.readFileSync('data/all-dex-pools.json', 'utf-8'));
  console.log(`   Found ${discoveredPools.length} pools in discovery file`);

  // Convert discovered pools to Pool format
  const pools: any[] = [];
  for (const poolData of discoveredPools) {
    try {
      const token0Metadata = TOKEN_METADATA[poolData.token0Symbol];
      const token1Metadata = TOKEN_METADATA[poolData.token1Symbol];

      if (!token0Metadata || !token1Metadata) {
        console.log(`⚠️ Skipping ${poolData.token0Symbol}/${poolData.token1Symbol} - missing metadata`);
        continue;
      }

      const pool: any = {
        address: poolData.address,
        dex: poolData.dex,
        dexVersion: poolData.version,
        fee: poolData.fee || 0,
        token0: {
          address: poolData.token0,
          symbol: poolData.token0Symbol,
          decimals: token0Metadata.decimals,
          name: token0Metadata.name
        },
        token1: {
          address: poolData.token1,
          symbol: poolData.token1Symbol,
          decimals: token1Metadata.decimals,
          name: token1Metadata.name
        },
        isActive: true,
        lastUpdated: Date.now()
      };

      // Update pool state
      if (poolData.version === 'v3') {
        await updateV3PoolState(provider, pool);
      }

      pools.push(pool);
      console.log(`✅ Loaded ${pool.dex}: ${pool.token0.symbol}/${pool.token1.symbol} (${pool.address})`);

    } catch (error) {
      console.error(`❌ Failed to load pool ${poolData.address}: ${error}`);
    }
  }

  console.log(`\n📊 Successfully loaded ${pools.length} pools`);

  // Add to registry
  await registry.addPools(pools);
  await registry.save();

  // Print registry summary
  registry.printSummary();

  // Initialize opportunity finder
  console.log('\n🔍 Initializing opportunity finder...');
  const opportunityFinder = new OpportunityFinder(provider, 'WETH');

  // Test with different flash loan amounts
  const testAmounts = [
    { amount: 1, symbol: 'WETH' },
    { amount: 5, symbol: 'WETH' },
    { amount: 10, symbol: 'WETH' },
  ];

  const results: TestResult[] = [];

  for (const { amount, symbol } of testAmounts) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TESTING WITH ${amount} ${symbol} FLASH LOAN`);
    console.log('='.repeat(80));

    try {
      const startTime = Date.now();
      
      // Find opportunities
      const opportunities = await opportunityFinder.findOpportunities(
        symbol,
        BigInt(amount * 10 ** 18)
      );

      const scanTime = Date.now() - startTime;

      const result: TestResult = {
        flashLoanAmount: amount,
        tokenSymbol: symbol,
        opportunitiesFound: opportunities.length,
        scanTime,
        errors: []
      };

      // Print results
      console.log(`\n📊 Scan Results:`);
      console.log(`   Scan Time: ${scanTime}ms`);
      console.log(`   Opportunities Found: ${opportunities.length}`);

      if (opportunities.length > 0) {
        console.log(`\n💰 Opportunities:`);
        for (let i = 0; i < opportunities.length; i++) {
          const opp = opportunities[i];
          console.log(`\n   ${i + 1}. Opportunity ID: ${opp.id}`);
          console.log(`      Path: ${opp.path.map(t => t.symbol).join(' → ')}`);
          console.log(`      DEXs: ${opp.dexes.join(', ')}`);
          console.log(`      Expected Profit: ${formatBigNumber(opp.expectedProfit)} ETH`);
          console.log(`      Expected Profit USD: $${opp.expectedProfitUSD.toFixed(2)}`);
          console.log(`      Flash Fee: ${formatBigNumber(opp.flashFee)} ETH`);
          console.log(`      Gas Cost: ${formatBigNumber(opp.gasCost)} ETH`);
          console.log(`      Net Profit: ${formatBigNumber(opp.netProfit)} ETH`);
          console.log(`      ROI: ${((Number(opp.netProfit) / (amount * 10 ** 18)) * 100).toFixed(4)}%`);
          console.log(`      Score: ${opp.score.toFixed(4)}`);
          console.log(`      Entropy: ${opp.entropy.toFixed(4)}`);
          console.log(`      Block: ${opp.blockNumber}`);
        }
      } else {
        console.log(`\n❌ No opportunities found`);
        console.log(`   This is expected with limited pool coverage`);
        console.log(`   More pools needed for arbitrage opportunities`);
      }

      results.push(result);

    } catch (error) {
      console.error(`❌ Error during test: ${error}`);
      results.push({
        flashLoanAmount: amount,
        tokenSymbol: symbol,
        opportunitiesFound: 0,
        scanTime: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  // Generate test report
  generateTestReport(results);

  console.log('\n' + '='.repeat(80));
  console.log('TESTING COMPLETE');
  console.log('='.repeat(80));
}

async function updateV3PoolState(provider: ethers.JsonRpcProvider, pool: any): Promise<void> {
  try {
    const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
    const slot0 = await poolContract.slot0();
    const liquidity = await poolContract.liquidity();
    
    pool.sqrtPriceX96 = BigInt(slot0[0]);
    pool.tick = Number(slot0[1]);
    pool.liquidity = BigInt(liquidity);
  } catch (error) {
    console.log(`⚠️ Failed to update V3 state for ${pool.address}: ${error}`);
    pool.isActive = false;
  }
}

function formatBigNumber(value: bigint): string {
  const num = Number(value) / 10 ** 18;
  return num.toFixed(6);
}

function generateTestReport(results: TestResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('TEST REPORT');
  console.log('='.repeat(80));

  console.log('\n📊 Summary:');
  let totalOpportunities = 0;
  let totalScanTime = 0;
  let totalErrors = 0;

  for (const result of results) {
    totalOpportunities += result.opportunitiesFound;
    totalScanTime += result.scanTime;
    totalErrors += result.errors.length;

    console.log(`\nFlash Loan: ${result.flashLoanAmount} ${result.tokenSymbol}`);
    console.log(`  Opportunities: ${result.opportunitiesFound}`);
    console.log(`  Scan Time: ${result.scanTime}ms`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  console.log(`\n📈 Overall Statistics:`);
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Total Opportunities: ${totalOpportunities}`);
  console.log(`  Average Scan Time: ${(totalScanTime / results.length).toFixed(2)}ms`);
  console.log(`  Total Errors: ${totalErrors}`);

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalTests: results.length,
      totalOpportunities,
      averageScanTime: totalScanTime / results.length,
      totalErrors
    }
  };

  fs.writeFileSync('data/arbitrage-test-report.json', JSON.stringify(report, null, 2));
  console.log(`\n💾 Test report saved to data/arbitrage-test-report.json`);
}

main().catch(console.error);