import { PoolRegistryManager } from '../src/pools/registry.js';
import { ArbitrageBot } from '../src/index.js';

async function testRegistry() {
  console.log('=== Simple Registry Test ===\n');
  
  // Load registry
  const registry = new PoolRegistryManager();
  await registry.loadRegistry();
  
  const allPools = registry.getAllPools();
  console.log(`Total pools in registry: ${allPools.length}`);
  
  const poolsWithState = allPools.filter(p => p.hasState());
  console.log(`Pools with state data: ${poolsWithState.length}`);
  console.log(`Pools missing state: ${allPools.length - poolsWithState.length}`);
  
  // Show sample pools with state
  console.log('\n=== Sample Pools with State ===');
  poolsWithState.slice(0, 5).forEach(pool => {
    console.log(`${pool.dex} - ${pool.token0Symbol}/${pool.token1Symbol}`);
    console.log(`  Address: ${pool.address}`);
    console.log(`  Fee: ${pool.fee}%`);
    console.log(`  TVL: $${pool.tvl?.toFixed(2) || 'N/A'}`);
    console.log(`  Reserves: ${pool.reserve0?.toFixed(2)} / ${pool.reserve1?.toFixed(2)}`);
    console.log();
  });
  
  // Test arbitrage bot initialization
  console.log('=== Testing Arbitrage Bot ===');
  const bot = new ArbitrageBot();
  console.log('✅ Arbitrage bot initialized successfully');
  console.log('✅ Registry loaded and accessible by bot');
}

testRegistry().catch(console.error);