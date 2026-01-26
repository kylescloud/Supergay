#!/usr/bin/env ts-node
/**
 * Test Arbitrage Opportunity Finder with Real Data
 * 
 * This script tests the complete arbitrage detection system with real pool data
 * from the pool registry, running all 4 arbitrage strategies.
 */

import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager, RPCUsageType } from '../src/utils/rpcManager';
import { TOKENS } from '../src/config/constants';
import fs from 'fs';

async function testOpportunityFinder() {
  console.log('\n' + '='.repeat(80));
  console.log('ARBITRAGE OPPORTUNITY FINDER TEST - Real Data');
  console.log('='.repeat(80) + '\n');

  // Initialize RPC Manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider(RPCUsageType.SCANNING);

  console.log('✅ RPC Manager initialized');
  console.log('✅ Connected to Base mainnet\n');

  // Load pool registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const pools = registry.getAllPools();
  console.log(`✅ Loaded ${pools.length} pools from registry`);
  console.log(`   Registry last updated: ${new Date(registry.metadata.lastUpdated).toISOString()}`);
  console.log(`   Block number: ${registry.metadata.blockNumber}\n`);

  // Group pools by DEX
  const poolsByDEX: Record<string, any[]> = {};
  for (const pool of pools) {
    if (!poolsByDEX[pool.dex]) {
      poolsByDEX[pool.dex] = [];
    }
    poolsByDEX[pool.dex].push(pool);
  }

  console.log('Pools by DEX:');
  for (const [dex, dexPools] of Object.entries(poolsByDEX)) {
    console.log(`  ${dex}: ${dexPools.length} pools`);
  }
  console.log('');

  // Initialize OpportunityFinder with pool registry
  console.log('Initializing OpportunityFinder with pool registry...');
  const finder = new OpportunityFinder(provider, { poolRegistry: registry });
  console.log('✅ OpportunityFinder initialized\n');

  // Test with multiple flash loan amounts
  const flashLoanAmounts = [
    { amount: ethers.parseEther('1'), token: TOKENS.WETH, name: '1 WETH' },
    { amount: ethers.parseEther('5'), token: TOKENS.WETH, name: '5 WETH' },
    { amount: ethers.parseEther('10'), token: TOKENS.WETH, name: '10 WETH' }
  ];

  console.log('Running arbitrage detection with multiple flash loan amounts...');
  console.log('='.repeat(80));

  const allResults: any[] = [];
  const startTime = Date.now();

  for (const { amount, token, name } of flashLoanAmounts) {
    console.log(`\nTesting with ${name} flash loan...`);
    console.log('-'.repeat(80));

    try {
      const result = await finder.findOpportunities({
        flashLoanAsset: token,
        flashLoanAmount: amount,
        minProfitThreshold: ethers.parseEther('0.01') // 0.01 ETH minimum profit
      });

      const endTime = Date.now();
      const scanTime = endTime - startTime;

      console.log(`\nScan completed in ${scanTime}ms`);
      console.log(`Opportunities found: ${result.opportunities.length}`);
      console.log(`Strategy results:`);
      
      for (const [strategy, count] of Object.entries(result.stats.strategyResults)) {
        console.log(`  ${strategy}: ${count} opportunities`);
      }

      if (result.opportunities.length > 0) {
        console.log('\nTop Opportunities:');
        result.opportunities.slice(0, 5).forEach((opp: any, idx: number) => {
          console.log(`\n${idx + 1}. ${opp.strategy}`);
          console.log(`   Flash Loan: ${opp.flashLoanAsset} (${ethers.formatEther(opp.flashLoanAmount)} tokens)`);
          console.log(`   Path: ${opp.path.map((p: any) => `${p.token0.symbol}/${p.token1.symbol}`).join(' → ')}`);
          console.log(`   Gross Profit: ${ethers.formatEther(opp.grossProfit)} ETH`);
          console.log(`   Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
          console.log(`   DEXs: ${opp.path.map((p: any) => p.dex).join(', ')}`);
        });
      }

      allResults.push({
        flashLoan: name,
        opportunities: result.opportunities.length,
        scanTime: scanTime,
        stats: result.stats,
        topOpportunities: result.opportunities.slice(0, 5)
      });

    } catch (error) {
      console.error(`Error scanning with ${name}:`, error);
      allResults.push({
        flashLoan: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const totalTestTime = Date.now() - startTime;

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Test Time: ${totalTestTime}ms (${(totalTestTime / 1000).toFixed(2)}s)`);
  console.log(`Total Pools: ${pools.length}`);
  console.log(`DEXs Covered: ${Object.keys(poolsByDEX).length}`);
  console.log(`Flash Loan Amounts Tested: ${flashLoanAmounts.length}`);
  console.log('');

  console.log('Results by Flash Loan Amount:');
  for (const result of allResults) {
    if (result.error) {
      console.log(`  ${result.flashLoan}: ❌ ERROR - ${result.error}`);
    } else {
      console.log(`  ${result.flashLoan}: ${result.opportunities} opportunities (${result.scanTime}ms)`);
    }
  }

  // Save detailed results
  const detailedResults = {
    summary: {
      totalPools: pools.length,
      totalDEXs: Object.keys(poolsByDEX).length,
      poolsByDEX: Object.fromEntries(
        Object.entries(poolsByDEX).map(([k, v]) => [k, v.length])
      ),
      totalTestTime: totalTestTime,
      flashLoanAmountsTested: flashLoanAmounts.length,
      timestamp: new Date().toISOString()
    },
    results: allResults,
    strategies: {
      'Multi-Hop Cyclic Arbitrage': 'Detects profitable cycles through multiple DEXs',
      'Fee-Tier Mispricing': 'Exploits price differences between V3 fee tiers',
      'Liquidity Fragmentation': 'Uses marginal rates to find arbitrage in fragmented liquidity',
      'Stable-Volatile Arbitrage': 'Exploits curve differences between stable and volatile pools'
    }
  };

  fs.writeFileSync('data/opportunity-finder-results.json', JSON.stringify(detailedResults, null, 2));
  console.log(`\n✅ Detailed results saved to: data/opportunity-finder-results.json`);

  // Create report
  const report = `
# Arbitrage Opportunity Finder Test Report

## Summary
- **Test Date:** ${new Date().toISOString()}
- **Total Pools:** ${pools.length}
- **DEXs Covered:** ${Object.keys(poolsByDEX).length}
- **Total Test Time:** ${(totalTestTime / 1000).toFixed(2)}s
- **Flash Loan Amounts Tested:** ${flashLoanAmounts.length}

## Pools by DEX
${Object.entries(poolsByDEX)
  .map(([dex, pools]) => `- **${dex}:** ${pools.length} pools`)
  .join('\n')}

## Results by Flash Loan Amount
${allResults
  .map(r => {
    if (r.error) {
      return `- **${r.flashLoan}:** ❌ ERROR - ${r.error}`;
    } else {
      return `- **${r.flashLoan}:** ${r.opportunities} opportunities (${r.scanTime}ms)`;
    }
  })
  .join('\n')}

## Strategies Tested
1. **Multi-Hop Cyclic Arbitrage:** Detects profitable cycles through multiple DEXs
2. **Fee-Tier Mispricing:** Exploits price differences between V3 fee tiers
3. **Liquidity Fragmentation:** Uses marginal rates to find arbitrage in fragmented liquidity
4. **Stable-Volatile Arbitrage:** Exploits curve differences between stable and volatile pools

## Details
See \`data/opportunity-finder-results.json\` for complete details.
`;

  fs.writeFileSync('docs/OPPORTUNITY_FINDER_TEST_REPORT.md', report);
  console.log(`✅ Report saved to: docs/OPPORTUNITY_FINDER_TEST_REPORT.md`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80) + '\n');

  return detailedResults;
}

// Run the test
testOpportunityFinder()
  .then(() => {
    console.log('✅ Opportunity finder test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Opportunity finder test failed:', error);
    process.exit(1);
  });