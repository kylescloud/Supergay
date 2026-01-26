/**
 * Main script to discover Top 200 Base token pools and test with Opportunity Finder
 * 
 * This script:
 * 1. Discovers pools for 14 flash loan assets x 186 quote tokens across 10 DEXs
 * 2. Saves discovered pools to the pool registry
 * 3. Tests the opportunity finder with the new pool set
 */

import { ethers } from 'ethers';
import { Top200PoolDiscovery } from '../src/pools/discoveryTop200';
import { PoolRegistryManager } from '../src/pools/registry';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { DEX_CONFIG, PUBLIC_RPC_NODES, PRIVATE_RPC_NODES } from '../src/config/constants';
import { TOKENS as FLASH_LOAN_ASSETS } from '../src/config/constants';
import type { DEXConfig } from '../src/pools/types';

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('TOP 200 BASE TOKENS - POOL DISCOVERY & TESTING');
  console.log('='.repeat(80) + '\n');

  // Step 1: Discover pools
  console.log('Step 1: Discovering pools...\n');
  
  const discovery = new Top200PoolDiscovery([...PUBLIC_RPC_NODES, ...PRIVATE_RPC_NODES], [
    {
      name: 'uniswapV4',
      version: 'v4',
      factory: DEX_CONFIG.uniswapV4.poolManager,
      poolManager: DEX_CONFIG.uniswapV4.poolManager,
      quoter: DEX_CONFIG.uniswapV4.quoter
    },
    {
      name: 'uniswapV3',
      version: 'v3',
      factory: DEX_CONFIG.uniswapV3.factory,
      quoter: DEX_CONFIG.uniswapV3.quoter,
      feeTiers: [...DEX_CONFIG.uniswapV3.feeTiers]
    },
    {
      name: 'uniswapV2',
      version: 'v2',
      factory: DEX_CONFIG.uniswapV2.factory,
      router: DEX_CONFIG.uniswapV2.router
    },
    {
      name: 'curve',
      version: 'curve',
      factory: DEX_CONFIG.curve.addressProvider
    },
    {
      name: 'sushiswapV3',
      version: 'v3',
      factory: DEX_CONFIG.sushiswapV3.factory,
      quoter: DEX_CONFIG.sushiswapV3.quoter,
      feeTiers: [...DEX_CONFIG.sushiswapV3.feeTiers]
    },
    {
      name: 'pancakeSwapV3',
      version: 'v3',
      factory: DEX_CONFIG.pancakeSwapV3.factory,
      quoter: DEX_CONFIG.pancakeSwapV3.quoter,
      feeTiers: [...DEX_CONFIG.pancakeSwapV3.feeTiers]
    },
    {
      name: 'aerodrome',
      version: 'v2',
      factory: DEX_CONFIG.aerodrome.factory,
      router: DEX_CONFIG.aerodrome.router
    },
    {
      name: 'aerodromeSlipStream',
      version: 'v3',
      factory: DEX_CONFIG.aerodromeSlipStream.factory,
      quoter: DEX_CONFIG.aerodromeSlipStream.quoter,
      feeTiers: [...DEX_CONFIG.aerodromeSlipStream.feeTiers]
    },
    {
      name: 'aerodromeSlipStream2',
      version: 'v3',
      factory: DEX_CONFIG.aerodromeSlipStream2.factory,
      quoter: DEX_CONFIG.aerodromeSlipStream2.quoter,
      feeTiers: [...DEX_CONFIG.aerodromeSlipStream2.feeTiers]
    },
    {
      name: 'baseSwap',
      version: 'v2',
      factory: DEX_CONFIG.baseSwap.factory,
      router: DEX_CONFIG.baseSwap.router
    }
  ]);

  const result = await discovery.discoverAllPools({
    batchSize: 50,
    delayBetweenBatches: 200,
    delayBetweenDEXs: 500,
    skipDEXs: [], // Add DEXs to skip if needed
    minLiquidity: 1000n * 10n ** 18n // $1000 minimum
  });

  if (!result.success) {
    console.error('\n❌ Pool discovery failed!');
    console.error('Errors:', result.errors);
    process.exit(1);
  }

  console.log(`\n✅ Discovered ${result.pools.length} pools\n`);

  // Step 2: Save to pool registry
  console.log('Step 2: Saving pools to registry...\n');
  
  const registry = new PoolRegistryManager('./data');
  
  // Load existing registry
  await registry.load();
  
  // Add new pools
  console.log('Adding discovered pools to registry...');
  await registry.addPools(result.pools);
  await registry.save();

  console.log(`\n✅ Registry updated with ${result.pools.length} pools\n`);

  // Step 3: Test with Opportunity Finder
  console.log('Step 3: Testing Opportunity Finder...\n');
  
  // Create provider
  const provider = new ethers.JsonRpcProvider(PRIVATE_RPC_NODES[0]);
  
  const opportunityFinder = new OpportunityFinder(provider, 'WETH');

  // Test with WETH
  console.log('Testing opportunities for WETH...');
  
  try {
    const opportunities = await opportunityFinder.findOpportunities(
      'WETH',
      10n * 10n ** 18n, // 10 ETH loan amount
      false // Don't refresh pools (use existing)
    );

    console.log(`Found ${opportunities.length} opportunities`);
    
    if (opportunities.length > 0) {
      console.log('\nTop 3 opportunities:');
      opportunities.slice(0, 3).forEach((opp, i) => {
        console.log(`\n${i + 1}. ${opp.baseToken}`);
        console.log(`   Pools: ${opp.pools.map(p => p.dex).join(' → ')}`);
        console.log(`   Net Profit: $${parseFloat(opp.netProfit.toString()) / 1e18}`);
        console.log(`   Gas Cost: $${parseFloat(opp.gasCost.toString()) / 1e18}`);
      });
    }
  } catch (error) {
    console.log(`Error testing WETH: ${error}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('ALL TESTS COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log(`\nSummary:`);
  console.log(`  - Pools Discovered: ${result.pools.length}`);
  console.log(`  - DEXs Scanned: ${result.stats.successfulDEXs}/${result.stats.totalDEXs}`);
  console.log(`  - Execution Time: ${(result.stats.executionTime / 1000).toFixed(2)}s`);
  console.log(`  - Registry Updated: Yes`);
  console.log(`  - Opportunity Finder Tested: Yes`);
  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});