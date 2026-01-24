import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager } from '../src/utils/rpcManager';

// ABI for V3 pools
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
];

// ABI for V2 pairs
const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

async function updateAllPoolStates() {
  console.log('='.repeat(80));
  console.log('UPDATING ALL POOL STATES');
  console.log('='.repeat(80));

  // Initialize RPC manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider('scanning' as any);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  await registry.load();

  const allPools = registry.getAllPools();
  console.log(`\nTotal pools in registry: ${allPools.length}`);
  console.log(`Pools needing state update: ${allPools.filter(p => !p.sqrtPriceX96 && !p.reserve0).length}`);

  let updatedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  console.log('\nUpdating pool states...\n');

  for (let i = 0; i < allPools.length; i++) {
    const pool = allPools[i];
    const progress = ((i + 1) / allPools.length * 100).toFixed(1);
    
    process.stdout.write(`\rProgress: ${progress}% (${i + 1}/${allPools.length})`);

    try {
      if (pool.dexVersion === 'V3' || pool.dexVersion === 'v3') {
        // Update V3 pool state
        const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
        
        const [slot0Result, liquidityResult] = await Promise.all([
          poolContract.slot0().catch(() => null),
          poolContract.liquidity().catch(() => null)
        ]);

        if (slot0Result && liquidityResult) {
          pool.sqrtPriceX96 = slot0Result.sqrtPriceX96;
          pool.tick = Number(slot0Result.tick);
          pool.liquidity = liquidityResult;
          pool.lastUpdated = Date.now();
          updatedCount++;
        } else {
          failedCount++;
          errors.push(`${pool.dex} ${pool.token0.symbol}/${pool.token1.symbol}: Failed to fetch state`);
        }
      } else if (pool.dexVersion === 'V2' || pool.dexVersion === 'v2') {
        // Update V2 pool state
        const pairContract = new ethers.Contract(pool.address, V2_PAIR_ABI, provider);
        
        const reserves = await pairContract.getReserves().catch(() => null);
        
        if (reserves) {
          pool.reserve0 = reserves.reserve0;
          pool.reserve1 = reserves.reserve1;
          pool.lastUpdated = Date.now();
          updatedCount++;
        } else {
          failedCount++;
          errors.push(`${pool.dex} ${pool.token0.symbol}/${pool.token1.symbol}: Failed to fetch reserves`);
        }
      }
    } catch (error) {
      failedCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.length < 100) {
        errors.push(`${pool.dex} ${pool.token0.symbol}/${pool.token1.symbol}: ${errorMsg}`);
      }
    }

    // Save progress every 50 pools
    if ((i + 1) % 50 === 0) {
      await registry.save();
      console.log(`\nSaved progress: ${i + 1} pools processed`);
    }
  }

  // Final save
  await registry.save();

  console.log('\n\n' + '='.repeat(80));
  console.log('UPDATE SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successfully updated: ${updatedCount} pools`);
  console.log(`❌ Failed to update: ${failedCount} pools`);
  console.log(`📊 Success rate: ${((updatedCount / allPools.length) * 100).toFixed(2)}%`);

  if (errors.length > 0 && errors.length <= 20) {
    console.log('\nErrors:');
    errors.forEach(error => console.log(`  - ${error}`));
  } else if (errors.length > 20) {
    console.log(`\nFirst 20 errors:`);
    errors.slice(0, 20).forEach(error => console.log(`  - ${error}`));
    console.log(`... and ${errors.length - 20} more errors`);
  }

  // Print statistics by DEX
  console.log('\n' + '='.repeat(80));
  console.log('STATISTICS BY DEX');
  console.log('='.repeat(80));
  
  const poolsByDEX = allPools.reduce((acc: Record<string, any>, pool) => {
    const dex = pool.dex;
    if (!acc[dex]) {
      acc[dex] = { total: 0, hasState: 0 };
    }
    acc[dex].total++;
    if (pool.sqrtPriceX96 || pool.reserve0) {
      acc[dex].hasState++;
    }
    return acc;
  }, {});

  for (const [dex, stats] of Object.entries(poolsByDEX).sort((a, b) => b[1].total - a[1].total)) {
    const percentage = ((stats.hasState / stats.total) * 100).toFixed(1);
    console.log(`  ${dex}: ${stats.hasState}/${stats.total} pools with state (${percentage}%)`);
  }

  return { updatedCount, failedCount, totalPools: allPools.length };
}

// Run the update
updateAllPoolStates()
  .then(result => {
    console.log('\n✅ Pool state update completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Pool state update failed:', error);
    process.exit(1);
  });