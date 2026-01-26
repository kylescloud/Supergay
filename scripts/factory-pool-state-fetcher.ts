import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { DEX_DISCOVERY_CONFIG } from '../src/config/dexDiscoveryConfig';
import { PUBLIC_RPC_NODES, PRIVATE_RPC_NODES } from '../src/config/constants';

interface PoolStateResult {
  address: string;
  dex: string;
  dexVersion: string;
  success: boolean;
  reserves?: { reserve0: bigint; reserve1: bigint };
  liquidity?: bigint;
  sqrtPriceX96?: bigint;
  tick?: number;
  error?: string;
}

/**
 * Factory-based pool state fetcher
 * Fetches current state data directly from pool contracts
 */
async function fetchPoolState(
  poolAddress: string,
  dex: string,
  dexVersion: string,
  provider: ethers.Provider
): Promise<PoolStateResult> {
  const result: PoolStateResult = {
    address: poolAddress,
    dex,
    dexVersion,
    success: false
  };

  try {
    const poolCode = await provider.getCode(poolAddress);
    if (poolCode === '0x' || poolCode === '0x0') {
      result.error = 'Pool does not exist';
      return result;
    }

    if (dexVersion === 'v2') {
      // V2 pool - fetch reserves
      const poolAbi = [
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
      ];
      const pool = new ethers.Contract(poolAddress, poolAbi, provider);
      const reserves = await pool.getReserves();
      result.reserves = {
        reserve0: BigInt(reserves[0]),
        reserve1: BigInt(reserves[1])
      };
    } else if (dexVersion === 'v3') {
      // V3 pool - fetch slot0 and liquidity
      const poolAbi = [
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function liquidity() external view returns (uint128)'
      ];
      const pool = new ethers.Contract(poolAddress, poolAbi, provider);
      
      const slot0 = await pool.slot0();
      result.sqrtPriceX96 = BigInt(slot0[0]);
      result.tick = Number(slot0[1]);
      
      const liquidity = await pool.liquidity();
      result.liquidity = BigInt(liquidity);
    }

    result.success = true;
  } catch (error: any) {
    result.error = error.message || 'Unknown error';
  }

  return result;
}

/**
 * Batch fetch pool states with rate limiting
 */
async function batchFetchPoolStates(
  pools: any[],
  batchSize: number = 50,
  delayMs: number = 200
): Promise<PoolStateResult[]> {
  const results: PoolStateResult[] = [];
  
  // Use private RPC if available, otherwise use public
  const rpcUrl = PRIVATE_RPC_NODES[0] || PUBLIC_RPC_NODES[0];
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    console.log(`\nFetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pools.length / batchSize)} (${batch.length} pools)...`);

    const batchPromises = batch.map(pool => 
      fetchPoolState(pool.address, pool.dex, pool.dexVersion, provider)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Print summary for this batch
    const successCount = batchResults.filter(r => r.success).length;
    console.log(`  Batch complete: ${successCount}/${batch.length} successful`);

    // Delay to avoid rate limiting
    if (i + batchSize < pools.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Update pool registry with fetched state data
 */
function updateRegistryWithStates(
  registry: PoolRegistryManager,
  results: PoolStateResult[]
): { updated: number; failed: number } {
  let updated = 0;
  let failed = 0;

  const allPools = registry.getAllPools();
  const poolMap = new Map(allPools.map(p => [p.address.toLowerCase(), p]));

  results.forEach(result => {
    if (result.success) {
      const pool = poolMap.get(result.address.toLowerCase());
      if (pool) {
        if (result.reserves) {
          pool.reserve0 = result.reserves.reserve0;
          pool.reserve1 = result.reserves.reserve1;
          updated++;
        }
        if (result.liquidity) {
          pool.liquidity = result.liquidity;
          updated++;
        }
        if (result.sqrtPriceX96) {
          pool.sqrtPriceX96 = result.sqrtPriceX96;
          pool.tick = result.tick;
          updated++;
        }
        pool.lastUpdated = Date.now();
      }
    } else {
      failed++;
    }
  });

  return { updated, failed };
}

async function main() {
  console.log('=== Factory-Based Pool State Fetcher ===\n');

  // Load registry
  const registry = new PoolRegistryManager('./data');
  await registry.load();

  const allPools = registry.getAllPools();
  console.log(`Loaded ${allPools.length} pools from registry`);

  // Filter pools that need state updates
  const poolsNeedingUpdate = allPools.filter(pool => {
    const needsReserves = pool.dexVersion === 'v2' && (!pool.reserve0 || !pool.reserve1);
    const needsV3State = pool.dexVersion === 'v3' && (!pool.liquidity || !pool.sqrtPriceX96);
    return needsReserves || needsV3State;
  });

  console.log(`Found ${poolsNeedingUpdate.length} pools needing state updates`);
  console.log(`  V2 pools needing reserves: ${poolsNeedingUpdate.filter(p => p.dexVersion === 'v2').length}`);
  console.log(`  V3 pools needing state: ${poolsNeedingUpdate.filter(p => p.dexVersion === 'v3').length}`);

  // Fetch pool states
  console.log('\nFetching pool states from blockchain...');
  const results = await batchFetchPoolStates(poolsNeedingUpdate, 50, 200);

  // Update registry
  console.log('\nUpdating registry with fetched states...');
  const { updated, failed } = updateRegistryWithStates(registry, results);

  console.log(`\n=== Results ===`);
  console.log(`Successfully updated: ${updated} state fields`);
  console.log(`Failed to fetch: ${failed} pools`);

  // Save updated registry
  await registry.save();
  console.log('\nRegistry saved successfully');

  // Print summary
  const finalPools = registry.getAllPools();
  const withReserves = finalPools.filter(p => p.reserve0 && p.reserve1).length;
  const withLiquidity = finalPools.filter(p => p.liquidity && typeof p.liquidity !== 'string').length;
  const withSqrtPrice = finalPools.filter(p => p.sqrtPriceX96).length;
  const withState = finalPools.filter(p => 
    (p.reserve0 && p.reserve1) || (p.sqrtPriceX96 && p.liquidity)
  ).length;

  console.log(`\n=== Final Registry Statistics ===`);
  console.log(`Total pools: ${finalPools.length}`);
  console.log(`Pools with reserves (V2): ${withReserves}`);
  console.log(`Pools with liquidity (V3): ${withLiquidity}`);
  console.log(`Pools with sqrtPriceX96 (V3): ${withSqrtPrice}`);
  console.log(`Pools with state data: ${withState} (${((withState / finalPools.length) * 100).toFixed(1)}%)`);

  // Print error summary
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    console.log(`\n=== Error Summary ===`);
    const errorCounts = errors.reduce((acc, e) => {
      acc[e.error || 'Unknown'] = (acc[e.error || 'Unknown'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
  }
}

main().catch(console.error);