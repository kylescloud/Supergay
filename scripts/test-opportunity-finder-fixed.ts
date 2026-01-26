/**
 * Test Script for Fixed Opportunity Finder
 * 
 * Tests the OpportunityFinder with skipPoolDiscovery flag
 * Uses existing pool registry with state data
 */

import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { PoolDiscovery } from '../src/pools/discovery';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('           FIXED OPPORTUNITY FINDER TEST');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Load pool registry
  const basePoolsPath = path.join(process.cwd(), 'data', 'base-pools.json');
  
  if (!fs.existsSync(basePoolsPath)) {
    console.error('❌ Pool registry not found at:', basePoolsPath);
    console.log('Please run pool discovery first to generate the registry.');
    process.exit(1);
  }

  const registryData = JSON.parse(fs.readFileSync(basePoolsPath, 'utf-8'));
  
  // Count pools with state data
  const poolsWithState = registryData.pools.filter(
    (p: any) => p.reserve0 || p.reserve1 || p.liquidity || p.sqrtPriceX96
  );
  
  console.log(`📊 Loaded pool registry with ${registryData.pools.length} pools`);
  console.log(`   Pools with state data: ${poolsWithState.length}`);
  console.log(`   Last Updated: ${registryData.lastUpdated}\n`);

  // Initialize provider
  const rpcUrl = 'https://mainnet.base.org';
  console.log(`🔗 RPC URL: ${rpcUrl}\n`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Set up data directory
  const dataDir = path.join(process.cwd(), 'data');
  const registryPath = path.join(dataDir, 'pool-registry.json');
  console.log(`📂 Data directory: ${dataDir}`);
  console.log(`📄 Registry path: ${registryPath}`);
  console.log(`   File exists: ${fs.existsSync(registryPath)}`);
  console.log(`   Working directory: ${process.cwd()}\n`);

  // Initialize OpportunityFinder with skipPoolDiscovery flag and data directory
  console.log('🚀 Initializing OpportunityFinder with skipPoolDiscovery=true...');
  const opportunityFinder = new OpportunityFinder(provider, undefined, {
    skipPoolDiscovery: true,
    dataDir: dataDir,
  });

  await opportunityFinder.initialize();
  console.log();

  // Find opportunities
  console.log('🔍 Finding arbitrage opportunities...\n');
  const opportunities = await opportunityFinder.findOpportunities(
    'WETH',
    ethers.parseEther('10'), // 10 ETH loan
    false // Don't refresh pools
  );

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                         OPPORTUNITY RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  console.log(`📊 Total Opportunities Found: ${opportunities.length}\n`);

  if (opportunities.length === 0) {
    console.log('No profitable opportunities found.\n');
  } else {
    console.log('Top 10 Opportunities:');
    opportunities.slice(0, 10).forEach((opp, index) => {
      console.log(`\n${index + 1}. Arbitrage Opportunity`);
      console.log(`   ID: ${opp.id}`);
      console.log(`   Loan: ${ethers.formatEther(opp.loanAmount)} ETH`);
      console.log(`   Expected Profit: ${ethers.formatEther(opp.expectedProfit)} ETH`);
      console.log(`   Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
      console.log(`   Profit %: ${(Number(opp.netProfit) / Number(opp.loanAmount) * 100).toFixed(4)}%`);
      console.log(`   Gas: ${ethers.formatEther(opp.gasCost)} ETH`);
      console.log(`   Flash Fee: ${ethers.formatEther(opp.flashFee)} ETH`);
      console.log(`   Score: ${opp.score.toFixed(2)}`);
      console.log(`   Path: ${opp.path.map(t => t.symbol).join(' → ')}`);
      console.log(`   DEXes: ${opp.dexes.join(', ')}`);
    });
  }

  // Save results
  const outputDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'opportunity-finder-fixed-test-results.json');
  const outputData = {
    testDate: new Date().toISOString(),
    registry: {
      totalPools: Object.keys(registryData.pools).length,
      lastUpdated: registryData.lastUpdated,
    },
    opportunities: opportunities.map(opp => ({
      id: opp.id,
      loanAmount: opp.loanAmount.toString(),
      expectedProfit: opp.expectedProfit.toString(),
      netProfit: opp.netProfit.toString(),
      profitPercentage: (Number(opp.netProfit) / Number(opp.loanAmount) * 100).toFixed(4),
      gasCost: opp.gasCost.toString(),
      flashFee: opp.flashFee.toString(),
      score: opp.score,
      path: opp.path.map(t => t.symbol),
      dexes: opp.dexes,
    })),
    summary: {
      totalOpportunities: opportunities.length,
      topProfit: opportunities.length > 0 ? opportunities[0].netProfit.toString() : '0',
      topProfitPercentage: opportunities.length > 0 
        ? (Number(opportunities[0].netProfit) / Number(opportunities[0].loanAmount) * 100).toFixed(4)
        : '0',
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
  console.log(`\n💾 Results saved to: ${outputFile}`);

  console.log('\n✅ Test complete!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});