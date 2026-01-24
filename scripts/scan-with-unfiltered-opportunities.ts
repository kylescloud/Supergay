import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { RPCManager } from '../src/utils/rpcManager';
import { TOKENS } from '../src/config/constants';

/**
 * Scan with Unfiltered Opportunities
 * 
 * This script shows all opportunities found by strategies before filtering.
 */

async function runScanWithUnfiltered() {
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider('scanning' as any);
  const opportunityFinder = new OpportunityFinder(provider, TOKENS.WETH);

  console.log('='.repeat(100));
  console.log('SCAN WITH UNFILTERED OPPORTUNITIES');
  console.log('='.repeat(100));

  await opportunityFinder.initialize();

  // Get pool registry
  const registry = (opportunityFinder as any).poolDiscovery.getRegistry();
  const allPools = registry.getAllPools();
  
  const poolsByDEX: Record<string, number> = {};
  allPools.forEach((pool: any) => {
    poolsByDEX[pool.dex] = (poolsByDEX[pool.dex] || 0) + 1;
  });

  console.log(`\n📊 Pool Registry Status:`);
  console.log(`   Total Pools: ${allPools.length}`);
  console.log('   Pools by DEX:');
  for (const [dex, count] of Object.entries(poolsByDEX).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${dex}: ${count} pools`);
  }
  console.log();

  // Build snapshot
  const currentBlock = await provider.getBlockNumber();
  const snapshot = await (opportunityFinder as any).buildSnapshotFromPoolRegistry(currentBlock);
  console.log(`Snapshot: ${snapshot.poolStates.size} pools captured\n`);

  // Get base token
  const baseToken = (opportunityFinder as any).getBaseToken('WETH');
  const loanAmount = BigInt('10000000000000000000'); // 10 ETH

  // Run each strategy separately
  const strategies = [
    'multiHopStrategy',
    'feeTierStrategy', 
    'liquidityFragmentationStrategy',
    'stableVolatileStrategy'
  ];

  for (const strategyName of strategies) {
    console.log('='.repeat(100));
    console.log(`[Strategy] ${strategyName}`);
    console.log('='.repeat(100));

    const strategy = (opportunityFinder as any)[strategyName];
    
    try {
      const opportunities = await strategy.findOpportunities(
        snapshot.poolStates,
        baseToken,
        loanAmount
      );

      console.log(`\nFound ${opportunities.length} opportunities (before filtering)\n`);

      if (opportunities.length > 0) {
        for (let i = 0; i < Math.min(opportunities.length, 5); i++) {
          const opp = opportunities[i];
          console.log(`\n${i + 1}. Opportunity Details:`);
          console.log(`   ID: ${opp.id}`);
          console.log(`   Path: ${opp.path.map((t: any) => t.symbol).join(' → ')}`);
          console.log(`   DEXs: ${opp.dexes.join(' → ')}`);
          console.log(`   Loan Amount: ${ethers.formatEther(opp.loanAmount)} ETH`);
          console.log(`   Expected Profit: ${ethers.formatEther(opp.expectedProfit)} ETH`);
          console.log(`   Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
          console.log(`   USD Value: $${opp.expectedProfitUSD.toFixed(2)}`);
          console.log(`   Flash Fee: ${ethers.formatEther(opp.flashFee)} ETH`);
          console.log(`   Gas Cost: ${ethers.formatEther(opp.gasCost)} ETH`);
          console.log(`   Score: ${opp.score.toFixed(4)}`);
          console.log(`   Entropy: ${opp.entropy.toFixed(4)}`);
        }

        if (opportunities.length > 5) {
          console.log(`\n... and ${opportunities.length - 5} more opportunities`);
        }
      }
    } catch (error) {
      console.log(`\n❌ Strategy failed:`, error instanceof Error ? error.message : error);
    }

    console.log();
  }
}

runScanWithUnfiltered()
  .then(() => {
    console.log('✅ Scan completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  });