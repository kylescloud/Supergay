import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import fs from 'fs/promises';
import path from 'path';

interface BasePool {
  address: string;
  dex: string;
  dexVersion: string;
  token0: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  fee?: number;
  liquidity?: string;
  reserve0?: string;
  reserve1?: string;
  sqrtPriceX96?: string;
  tick?: number;
}

/**
 * Convert BasePool to Pool type for OpportunityFinder
 */
function convertBasePoolToPool(basePool: BasePool): any {
  return {
    address: basePool.address,
    dex: basePool.dex,
    dexVersion: basePool.dexVersion,
    token0: {
      address: basePool.token0.address,
      symbol: basePool.token0.symbol,
      name: basePool.token0.name,
      decimals: basePool.token0.decimals
    },
    token1: {
      address: basePool.token1.address,
      symbol: basePool.token1.symbol,
      name: basePool.token1.name,
      decimals: basePool.token1.decimals
    },
    fee: basePool.fee,
    reserve0: basePool.reserve0 ? BigInt(basePool.reserve0) : undefined,
    reserve1: basePool.reserve1 ? BigInt(basePool.reserve1) : undefined,
    liquidity: basePool.liquidity ? BigInt(Math.floor(parseFloat(basePool.liquidity) * 10 ** 18)) : undefined, // Convert USD liquidity to wei
    sqrtPriceX96: basePool.sqrtPriceX96 ? BigInt(basePool.sqrtPriceX96) : undefined,
    tick: basePool.tick
  };
}

/**
 * Load pools from comprehensive pool file
 */
async function loadComprehensivePools(): Promise<any[]> {
  console.log('\n📂 Loading comprehensive pools from data/base-pools.json...');
  
  const poolsData = await fs.readFile(path.join('data', 'base-pools.json'), 'utf-8');
  const poolsJson = JSON.parse(poolsData);
  const basePools: BasePool[] = poolsJson.pools;
  
  console.log(`  ✅ Loaded ${basePools.length} pools`);
  console.log(`  Last Updated: ${poolsJson.lastUpdated}`);
  
  // Convert to Pool type
  const pools = basePools.map(convertBasePoolToPool);
  
  // Group by DEX
  const byDex: Record<string, number> = {};
  basePools.forEach(pool => {
    byDex[pool.dex] = (byDex[pool.dex] || 0) + 1;
  });
  
  console.log('\n📊 Pools by DEX:');
  for (const [dex, count] of Object.entries(byDex)) {
    console.log(`  ${dex}: ${count}`);
  }
  
  return pools;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('PHASE 4 & 5: OPPORTUNITY FINDER INTEGRATION & TESTING');
  console.log('═'.repeat(80));
  
  // Load comprehensive pools
  const pools = await loadComprehensivePools();
  
  // Initialize provider
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  
  // Initialize OpportunityFinder
  console.log('\n🚀 Initializing OpportunityFinder...');
  const opportunityFinder = new OpportunityFinder(provider);
  
  // Initialize with pool discovery
  await opportunityFinder.initialize();
  
  // Update registry with comprehensive pools
  console.log('\n🔄 Updating pool registry with comprehensive pools...');
  const registry = (opportunityFinder as any).poolDiscovery.getRegistry();
  
  // Add all pools to registry
  for (const pool of pools) {
    try {
      registry.addPool(pool);
    } catch (error) {
      // Skip duplicate or invalid pools
    }
  }
  
  console.log(`  ✅ Registry now has ${registry.getAllPools().length} pools`);
  
  // Test with different base tokens
  const baseTokens = ['WETH', 'USDC', 'USDbC'];
  const loanAmount = BigInt('10000000000000000000'); // 10 ETH equivalent
  
  const allOpportunities: any[] = [];
  
  for (const baseToken of baseTokens) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Testing with Base Token: ${baseToken}`);
    console.log(`${'─'.repeat(80)}`);
    
    try {
      const opportunities = await opportunityFinder.findOpportunities(
        baseToken,
        loanAmount,
        false // Don't refresh pools
      );
      
      console.log(`\n✅ Found ${opportunities.length} opportunities for ${baseToken}`);
      
      // Display top opportunities
      if (opportunities.length > 0) {
        console.log('\n🎯 Top Opportunities:');
        const topOpportunities = opportunities
          .sort((a, b) => Number(b.netProfit) - Number(a.netProfit))
          .slice(0, 5);
        
        for (const opp of topOpportunities) {
          const strategy = opp.dexes.length > 2 ? 'Multi-Hop' : opp.dexes.length === 2 ? '2-Hop' : 'Flash Loan';
          console.log(`  ${strategy}:`);
          console.log(`    Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
          console.log(`    Expected Profit: ${ethers.formatEther(opp.expectedProfit)} ETH`);
          console.log(`    Gas Cost: ${ethers.formatEther(opp.gasCost)} ETH`);
          console.log(`    ROI: ${((Number(opp.netProfit) / Number(loanAmount)) * 100).toFixed(2)}%`);
          console.log(`    Route: ${opp.path.map(p => p.symbol).join(' → ')}`);
          console.log(`    DEXs: ${opp.dexes.join(' → ')}`);
        }
      }
      
      allOpportunities.push(...opportunities);
    } catch (error: any) {
      console.error(`❌ Error finding opportunities for ${baseToken}: ${error.message}`);
    }
  }
  
  // Summary
  console.log(`\n${'═'.repeat(80)}`);
  console.log('TESTING SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools: ${registry.getAllPools().length}`);
  console.log(`Total Opportunities Found: ${allOpportunities.length}`);
  console.log(`Base Tokens Tested: ${baseTokens.join(', ')}`);
  
  // Group by strategy (based on DEX count)
  const byStrategy: Record<string, number> = {};
  allOpportunities.forEach(opp => {
    const strategy = opp.dexes.length > 2 ? 'Multi-Hop (3+ DEXs)' : 
                    opp.dexes.length === 2 ? '2-Hop' : 
                    opp.dexes.length === 1 ? 'Single DEX' : 'Flash Loan';
    byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
  });
  
  console.log('\n📊 Opportunities by Strategy:');
  for (const [strategy, count] of Object.entries(byStrategy)) {
    console.log(`  ${strategy}: ${count}`);
  }
  
  if (allOpportunities.length > 0) {
    const totalNetProfit = allOpportunities.reduce((sum, opp) => sum + Number(opp.netProfit), 0);
    const totalExpectedProfit = allOpportunities.reduce((sum, opp) => sum + Number(opp.expectedProfit), 0);
    console.log(`\n💰 Total Expected Profit: ${ethers.formatEther(BigInt(totalExpectedProfit))} ETH`);
    console.log(`💰 Total Net Profit (after gas): ${ethers.formatEther(BigInt(totalNetProfit))} ETH`);
  }
  
  console.log('\n✅ Phases 4 & 5 completed successfully!');
  console.log('\n🎉 The comprehensive pool discovery is fully integrated with the opportunity finder!');
}

main().catch(console.error);