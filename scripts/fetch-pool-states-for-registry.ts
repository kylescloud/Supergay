import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKEN_METADATA } from '../src/config/constants';

// ABIs
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

async function fetchPoolState(
  provider: ethers.Provider,
  pool: any
): Promise<any> {
  try {
    if (pool.dexVersion === 'v3') {
      const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
      const [slot0, liquidity] = await Promise.all([
        poolContract.slot0(),
        poolContract.liquidity()
      ]);
      
      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: Number(slot0.tick),
        liquidity
      };
    } else if (pool.dexVersion === 'v2') {
      const poolContract = new ethers.Contract(pool.address, V2_PAIR_ABI, provider);
      const reserves = await poolContract.getReserves();
      
      return {
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1
      };
    }
  } catch (error: any) {
    console.error(`  ❌ Error fetching state for ${pool.address}: ${error.message}`);
    return null;
  }
  
  return null;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('FETCHING POOL STATES FOR REGISTRY');
  console.log('═'.repeat(80));
  
  // Initialize provider
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  
  // Load registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const pools = await registry.getPools({});
  console.log(`\n📊 Total pools in registry: ${pools.length}`);
  
  // Group by DEX
  const byDex: Record<string, any[]> = {};
  pools.forEach(pool => {
    if (!byDex[pool.dex]) byDex[pool.dex] = [];
    byDex[pool.dex].push(pool);
  });
  
  console.log('\n📊 Pools by DEX:');
  for (const [dex, poolList] of Object.entries(byDex)) {
    console.log(`  ${dex}: ${poolList.length}`);
  }
  
  // Fetch states
  console.log('\n🔄 Fetching pool states...');
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const pool of pools) {
    // Skip if already has state data
    if ((pool.dexVersion === 'v3' && pool.sqrtPriceX96 && pool.liquidity) ||
        (pool.dexVersion === 'v2' && pool.reserve0 && pool.reserve1)) {
      skipped++;
      continue;
    }
    
    const state = await fetchPoolState(provider, pool);
    
    if (state) {
      await registry.updatePoolStates([{...pool, ...state}]);
      success++;
    } else {
      failed++;
    }
    
    // Progress indicator
    if ((success + failed) % 10 === 0) {
      console.log(`  Progress: ${success + failed}/${pools.length} (✅${success} ❌${failed} ⏭️${skipped})`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('FETCH SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools: ${pools.length}`);
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️ Skipped (already has state): ${skipped}`);
  
  // Save registry
  await registry.save();
  console.log(`\n✅ Registry saved to: data/pool-registry.json`);
  
  console.log('\n✅ Pool state fetching completed!');
}

main().catch(console.error);