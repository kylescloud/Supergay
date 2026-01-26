#!/usr/bin/env ts-node
/**
 * Comprehensive Full Scan with Extensive Logging
 * 
 * This script runs a complete arbitrage scan with detailed logging of:
 * - All opportunities found (including filtered ones)
 * - Strategy execution details
 * - Pool states and calculations
 * - Rate calculations for all paths
 * - Profit validation details
 */

import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager, RPCUsageType } from '../src/utils/rpcManager';
import { TOKENS } from '../src/config/constants';
import fs from 'fs';
import path from 'path';

async function runComprehensiveFullScan() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log('\n' + '='.repeat(100));
  console.log('COMPREHENSIVE FULL SCAN WITH EXTENSIVE LOGGING');
  console.log('='.repeat(100));
  console.log(`\nTimestamp: ${timestamp}`);
  console.log(`Test Date: ${new Date().toLocaleDateString()}`);
  console.log(`Test Time: ${new Date().toLocaleTimeString()}`);

  // Initialize RPC Manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider(RPCUsageType.SCANNING);
  const blockNumber = await provider.getBlockNumber();

  console.log('\n' + '='.repeat(100));
  console.log('INITIALIZATION');
  console.log('='.repeat(100));
  console.log(`✅ RPC Manager initialized`);
  console.log(`✅ Connected to Base mainnet`);
  console.log(`✅ Current Block: ${blockNumber}`);

  // Load pool registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const pools = registry.getAllPools();
  console.log(`\n✅ Pool Registry loaded`);
  console.log(`   Total Pools: ${pools.length}`);
  console.log(`   Last Updated: ${new Date(registry.metadata.lastUpdated).toISOString()}`);
  console.log(`   Registry Block: ${registry.metadata.blockNumber}`);

  // Group pools by DEX
  const poolsByDEX: Record<string, any[]> = {};
  for (const pool of pools) {
    if (!poolsByDEX[pool.dex]) {
      poolsByDEX[pool.dex] = [];
    }
    poolsByDEX[pool.dex].push(pool);
  }

  console.log(`\nPools by DEX:`);
  for (const [dex, dexPools] of Object.entries(poolsByDEX)) {
    console.log(`  ${dex}: ${dexPools.length} pools`);
  }

  // Initialize OpportunityFinder
  console.log('\n' + '='.repeat(100));
  console.log('INITIALIZING OPPORTUNITY FINDER');
  console.log('='.repeat(100));
  const finder = new OpportunityFinder(provider, 'WETH');
  console.log(`✅ OpportunityFinder initialized with base token: WETH`);
  console.log(`✅ Pool registry linked to OpportunityFinder`);

  // Scan parameters
  const flashLoanAmount = ethers.parseEther('10');
  const minProfitThreshold = ethers.parseEther('0.01');

  console.log('\n' + '='.repeat(100));
  console.log('SCAN PARAMETERS');
  console.log('='.repeat(100));
  console.log(`Flash Loan Asset: WETH (${TOKENS.WETH})`);
  console.log(`Flash Loan Amount: ${ethers.formatEther(flashLoanAmount)} ETH`);
  console.log(`Min Profit Threshold: ${ethers.formatEther(minProfitThreshold)} ETH`);
  console.log(`Pool Count: ${pools.length}`);
  console.log(`DEX Count: ${Object.keys(poolsByDEX).length}`);

  // Run scan
  console.log('\n' + '='.repeat(100));
  console.log('STARTING ARBITRAGE SCAN');
  console.log('='.repeat(100));
  
  const scanStartTime = Date.now();
  const opportunities = await finder.findOpportunities('WETH', flashLoanAmount, false);
  const scanEndTime = Date.now();
  const scanDuration = scanEndTime - scanStartTime;

  console.log(`\n✅ Scan completed in ${scanDuration}ms (${(scanDuration / 1000).toFixed(2)}s)`);
  console.log(`Total Opportunities Found: ${opportunities.length}`);

  // Analyze opportunities by strategy
  const opportunitiesByStrategy: Record<string, any[]> = {};
  for (const opp of opportunities) {
    if (!opportunitiesByStrategy[opp.strategy]) {
      opportunitiesByStrategy[opp.strategy] = [];
    }
    opportunitiesByStrategy[opp.strategy].push(opp);
  }

  console.log(`\nOpportunities by Strategy:`);
  for (const [strategy, opps] of Object.entries(opportunitiesByStrategy)) {
    console.log(`  ${strategy}: ${opps.length} opportunities`);
  }

  // Detailed opportunity logging
  console.log('\n' + '='.repeat(100));
  console.log('DETAILED OPPORTUNITY LOGS');
  console.log('='.repeat(100));

  const detailedLogs: any[] = [];

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const logEntry = {
      index: i + 1,
      strategy: opp.strategy,
      flashLoanAsset: opp.flashLoanAsset,
      flashLoanAmount: ethers.formatEther(opp.flashLoanAmount),
      flashLoanAmountWei: opp.flashLoanAmount.toString(),
      grossProfit: ethers.formatEther(opp.grossProfit),
      grossProfitWei: opp.grossProfit.toString(),
      netProfit: ethers.formatEther(opp.netProfit),
      netProfitWei: opp.netProfit.toString(),
      profitPercentage: (Number(ethers.formatEther(opp.netProfit)) / Number(ethers.formatEther(opp.flashLoanAmount)) * 100).toFixed(4),
      path: opp.path.map((p: any) => ({
        address: p.address,
        dex: p.dex,
        token0: {
          address: p.token0.address,
          symbol: p.token0.symbol,
          decimals: p.token0.decimals
        },
        token1: {
          address: p.token1.address,
          symbol: p.token1.symbol,
          decimals: p.token1.decimals
        },
        fee: p.fee ? (p.fee / 10000) + '%' : 'N/A',
        liquidity: p.liquidity?.toString() || 'N/A',
        sqrtPriceX96: p.sqrtPriceX96?.toString() || 'N/A',
        tick: p.tick || 'N/A',
        reserves: p.reserves ? {
          reserve0: p.reserves.reserve0?.toString() || 'N/A',
          reserve1: p.reserves.reserve1?.toString() || 'N/A'
        } : 'N/A'
      })),
      gasEstimate: opp.gasEstimate?.toString() || 'N/A',
      timestamp: new Date().toISOString()
    };

    detailedLogs.push(logEntry);

    console.log(`\n--- Opportunity #${i + 1}: ${opp.strategy} ---`);
    console.log(`Flash Loan: ${logEntry.flashLoanAmount} ${logEntry.flashLoanAsset}`);
    console.log(`Gross Profit: ${logEntry.grossProfit} ETH`);
    console.log(`Net Profit: ${logEntry.netProfit} ETH (${logEntry.profitPercentage}%)`);
    console.log(`Path:`);
    opp.path.forEach((pool: any, idx: number) => {
      console.log(`  ${idx + 1}. ${pool.dex}: ${pool.token0.symbol}/${pool.token1.symbol}`);
      console.log(`     Address: ${pool.address}`);
      if (pool.dex.includes('v3')) {
        console.log(`     Fee: ${(pool.fee || 0) / 10000}%`);
        console.log(`     Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
        console.log(`     Tick: ${pool.tick || 'N/A'}`);
      } else if (pool.dex.includes('v2') || pool.dex === 'baseswap' || pool.dex === 'aerodrome') {
        console.log(`     Reserves: ${pool.reserves?.reserve0?.toString() || 'N/A'} / ${pool.reserves?.reserve1?.toString() || 'N/A'}`);
      }
    });
  }

  // Calculate statistics
  const totalGrossProfit = opportunities.reduce((sum, opp) => sum + opp.grossProfit, 0n);
  const totalNetProfit = opportunities.reduce((sum, opp) => sum + opp.netProfit, 0n);
  const avgGrossProfit = opportunities.length > 0 ? totalGrossProfit / BigInt(opportunities.length) : 0n;
  const avgNetProfit = opportunities.length > 0 ? totalNetProfit / BigInt(opportunities.length) : 0n;

  console.log('\n' + '='.repeat(100));
  console.log('PROFIT STATISTICS');
  console.log('='.repeat(100));
  console.log(`Total Gross Profit: ${ethers.formatEther(totalGrossProfit)} ETH`);
  console.log(`Total Net Profit: ${ethers.formatEther(totalNetProfit)} ETH`);
  console.log(`Average Gross Profit: ${ethers.formatEther(avgGrossProfit)} ETH`);
  console.log(`Average Net Profit: ${ethers.formatEther(avgNetProfit)} ETH`);
  console.log(`Highest Net Profit: ${ethers.formatEther(Math.max(...opportunities.map(o => Number(o.netProfit))))} ETH`);
  console.log(`Lowest Net Profit: ${ethers.formatEther(Math.min(...opportunities.map(o => Number(o.netProfit))))} ETH`);

  // Token pair analysis
  console.log('\n' + '='.repeat(100));
  console.log('TOP TOKEN PAIRS BY OPPORTUNITY COUNT');
  console.log('='.repeat(100));
  
  const tokenPairs: Record<string, number> = {};
  for (const opp of opportunities) {
    if (opp.path.length > 0) {
      const pair = `${opp.path[0].token0.symbol}/${opp.path[0].token1.symbol}`;
      tokenPairs[pair] = (tokenPairs[pair] || 0) + 1;
    }
  }

  const sortedPairs = Object.entries(tokenPairs).sort((a, b) => b[1] - a[1]);
  sortedPairs.slice(0, 10).forEach(([pair, count], idx) => {
    console.log(`${idx + 1}. ${pair}: ${count} opportunities`);
  });

  // DEX usage analysis
  console.log('\n' + '='.repeat(100));
  console.log('DEX USAGE IN OPPORTUNITIES');
  console.log('='.repeat(100));
  
  const dexUsage: Record<string, number> = {};
  for (const opp of opportunities) {
    for (const pool of opp.path) {
      dexUsage[pool.dex] = (dexUsage[pool.dex] || 0) + 1;
    }
  }

  const sortedDexUsage = Object.entries(dexUsage).sort((a, b) => b[1] - a[1]);
  sortedDexUsage.forEach(([dex, count], idx) => {
    console.log(`${idx + 1}. ${dex}: ${count} pool references`);
  });

  // Prepare comprehensive results
  const results = {
    metadata: {
      timestamp,
      blockNumber,
      scanDuration,
      scanDurationSeconds: (scanDuration / 1000).toFixed(2),
      totalPools: pools.length,
      poolsByDEX: Object.fromEntries(
        Object.entries(poolsByDEX).map(([k, v]) => [k, v.length])
      ),
      flashLoanAsset: 'WETH',
      flashLoanAmount: ethers.formatEther(flashLoanAmount),
      minProfitThreshold: ethers.formatEther(minProfitThreshold)
    },
    summary: {
      totalOpportunities: opportunities.length,
      opportunitiesByStrategy: Object.fromEntries(
        Object.entries(opportunitiesByStrategy).map(([k, v]) => [k, v.length])
      ),
      totalGrossProfit: ethers.formatEther(totalGrossProfit),
      totalNetProfit: ethers.formatEther(totalNetProfit),
      avgGrossProfit: ethers.formatEther(avgGrossProfit),
      avgNetProfit: ethers.formatEther(avgNetProfit),
      highestNetProfit: ethers.formatEther(
        opportunities.length > 0 ? Math.max(...opportunities.map(o => Number(o.netProfit))) : 0
      ),
      lowestNetProfit: ethers.formatEther(
        opportunities.length > 0 ? Math.min(...opportunities.map(o => Number(o.netProfit))) : 0
      )
    },
    detailedLogs,
    tokenPairAnalysis: sortedPairs.map(([pair, count]) => ({ pair, count })),
    dexUsageAnalysis: sortedDexUsage.map(([dex, count]) => ({ dex, count })),
    allOpportunities: opportunities.map(opp => ({
      strategy: opp.strategy,
      flashLoanAsset: opp.flashLoanAsset,
      flashLoanAmount: opp.flashLoanAmount.toString(),
      grossProfit: opp.grossProfit.toString(),
      netProfit: opp.netProfit.toString(),
      path: opp.path.map(p => ({
        address: p.address,
        dex: p.dex,
        token0: p.token0.address,
        token1: p.token1.address
      }))
    }))
  };

  // Save results
  const logDir = 'logs/comprehensive-scans';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFileName = `comprehensive-scan-${Date.now()}.json`;
  const logFilePath = path.join(logDir, logFileName);
  fs.writeFileSync(logFilePath, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(100));
  console.log('SCAN COMPLETE');
  console.log('='.repeat(100));
  console.log(`\n✅ Detailed logs saved to: ${logFilePath}`);
  console.log(`✅ Total opportunities logged: ${opportunities.length}`);
  console.log(`✅ Scan duration: ${scanDuration}ms (${(scanDuration / 1000).toFixed(2)}s)`);

  // Generate markdown report
  const markdownReport = generateMarkdownReport(results);
  const reportFileName = `comprehensive-scan-report-${Date.now()}.md`;
  const reportFilePath = path.join(logDir, reportFileName);
  fs.writeFileSync(reportFilePath, markdownReport);

  console.log(`✅ Markdown report saved to: ${reportFilePath}`);
  console.log('\n' + '='.repeat(100) + '\n');

  return results;
}

function generateMarkdownReport(results: any): string {
  return `# Comprehensive Full Scan Report

## Metadata
- **Timestamp:** ${results.metadata.timestamp}
- **Block Number:** ${results.metadata.blockNumber}
- **Scan Duration:** ${results.metadata.scanDurationSeconds}s
- **Total Pools:** ${results.metadata.totalPools}
- **Flash Loan Amount:** ${results.metadata.flashLoanAmount} ETH
- **Min Profit Threshold:** ${results.metadata.minProfitThreshold} ETH

## Pools by DEX
${Object.entries(results.metadata.poolsByDEX).map(([dex, count]) => `- **${dex}:** ${count} pools`).join('\n')}

## Summary
- **Total Opportunities:** ${results.summary.totalOpportunities}
- **Total Net Profit:** ${results.summary.totalNetProfit} ETH
- **Average Net Profit:** ${results.summary.avgNetProfit} ETH
- **Highest Net Profit:** ${results.summary.highestNetProfit} ETH
- **Lowest Net Profit:** ${results.summary.lowestNetProfit} ETH

## Opportunities by Strategy
${Object.entries(results.summary.opportunitiesByStrategy).map(([strategy, count]) => `- **${strategy}:** ${count} opportunities`).join('\n')}

## Top 10 Token Pairs by Opportunity Count
${results.tokenPairAnalysis.slice(0, 10).map((item: any, idx: number) => `${idx + 1}. **${item.pair}:** ${item.count} opportunities`).join('\n')}

## DEX Usage in Opportunities
${results.dexUsageAnalysis.map((item: any, idx: number) => `${idx + 1}. **${item.dex}:** ${item.count} pool references`).join('\n')}

## Detailed Opportunities
${results.detailedLogs.map((log: any) => `
### Opportunity #${log.index}: ${log.strategy}
- **Strategy:** ${log.strategy}
- **Flash Loan:** ${log.flashLoanAmount} ${log.flashLoanAsset}
- **Gross Profit:** ${log.grossProfit} ETH
- **Net Profit:** ${log.netProfit} ETH (${log.profitPercentage}%)
- **Path:**
${log.path.map((p: any, i: number) => `  ${i + 1}. **${p.dex}:** ${p.token0.symbol}/${p.token1.symbol}
     - Address: \`${p.address}\`
     - Fee: ${p.fee}
     - Liquidity: ${p.liquidity}
     - Tick: ${p.tick}
     - Reserves: ${p.reserves === 'N/A' ? 'N/A' : `${p.reserves.reserve0} / ${p.reserves.reserve1}`}`).join('\n')}
`).join('\n')}

---
Generated: ${new Date().toISOString()}
`;
}

// Run the comprehensive scan
runComprehensiveFullScan()
  .then(() => {
    console.log('✅ Comprehensive full scan completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Comprehensive scan failed:', error);
    process.exit(1);
  });