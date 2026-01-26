import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { PRIVATE_RPC_NODES, PUBLIC_RPC_NODES } from '../src/config/constants';

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

const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

/**
 * Fetch pool state with retries
 */
async function fetchPoolStateWithRetry(
  poolAddress: string,
  dex: string,
  dexVersion: string,
  provider: ethers.Provider,
  maxRetries: number = 2
): Promise<PoolStateResult> {
  const result: PoolStateResult = {
    address: poolAddress,
    dex,
    dexVersion,
    success: false
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const poolCode = await provider.getCode(poolAddress);
      if (poolCode === '0x' || poolCode === '0x0') {
        result.error = 'Pool does not exist';
        return result;
      }

      if (dexVersion === 'v2') {
        const pool = new ethers.Contract(poolAddress, V2_POOL_ABI, provider);
        const reserves = await pool.getReserves();
        result.reserves = {
          reserve0: BigInt(reserves[0]),
          reserve1: BigInt(reserves[1])
        };
      } else if (dexVersion === 'v3') {
        const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
        const slot0 = await pool.slot0();
        result.sqrtPriceX96 = BigInt(slot0[0]);
        result.tick = Number(slot0[1]);
        const liquidity = await pool.liquidity();
        result.liquidity = BigInt(liquidity);
      }

      result.success = true;
      return result;
    } catch (error: any) {
      result.error = error.message || 'Unknown error';
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  return result;
}

/**
 * Process pools in parallel with multiple RPC nodes
 */
async function processPoolsInParallel(
  pools: any[],
  concurrency: number = 20,
  rpcNodes: string[] = []
): Promise<PoolStateResult[]> {
  const results: PoolStateResult[] = [];
  const nodeIndex = { value: 0 };
  
  // Use provided RPCs or fallback to defaults
  const nodes = rpcNodes.length > 0 ? rpcNodes : PRIVATE_RPC_NODES;
  if (nodes.length === 0) {
    nodes.push(...PUBLIC_RPC_NODES);
  }

  const providers = nodes.map(url => new ethers.JsonRpcProvider(url));

  for (let i = 0; i < pools.length; i += concurrency) {
    const batch = pools.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(pools.length / concurrency);
    
    console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} pools)...`);

    const batchPromises = batch.map(pool => {
      const provider = providers[nodeIndex.value % providers.length];
      nodeIndex.value++;
      return fetchPoolStateWithRetry(pool.address, pool.dex, pool.dexVersion, provider);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    const successCount = batchResults.filter(r => r.success).length;
    console.log(`  Batch ${batchNum}: ${successCount}/${batch.length} successful (${((successCount/batch.length)*100).toFixed(1)}%)`);

    // Small delay to avoid overwhelming RPCs
    if (i + concurrency < pools.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return results;
}

/**
 * Update registry with fetched states
 */
function updateRegistryWithStates(
  registry: PoolRegistryManager,
  results: PoolStateResult[]
): { updated: number; failed: number; v2Updated: number; v3Updated: number } {
  let updated = 0;
  let failed = 0;
  let v2Updated = 0;
  let v3Updated = 0;

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
          v2Updated++;
        }
        if (result.liquidity) {
          pool.liquidity = result.liquidity;
          updated++;
        }
        if (result.sqrtPriceX96) {
          pool.sqrtPriceX96 = result.sqrtPriceX96;
          pool.tick = result.tick;
          updated++;
          v3Updated++;
        }
        pool.lastUpdated = Date.now();
      }
    } else {
      failed++;
    }
  });

  return { updated, failed, v2Updated, v3Updated };
}

async function main() {
  console.log('=== Optimized Factory-Based Pool State Fetcher ===\n');

  // Load registry
  const registry = new PoolRegistryManager('./data');
  await registry.load();

  const allPools = registry.getAllPools();
  console.log(`Loaded ${allPools.length} pools from registry`);

  // Filter pools needing updates
  const poolsNeedingUpdate = allPools.filter(pool => {
    const needsReserves = pool.dexVersion === 'v2' && (!pool.reserve0 || !pool.reserve1);
    const needsV3State = pool.dexVersion === 'v3' && (!pool.liquidity || !pool.sqrtPriceX96);
    return needsReserves || needsV3State;
  });

  console.log(`Found ${poolsNeedingUpdate.length} pools needing state updates`);
  console.log(`  V2 pools: ${poolsNeedingUpdate.filter(p => p.dexVersion === 'v2').length}`);
  console.log(`  V3 pools: ${poolsNeedingUpdate.filter(p => p.dexVersion === 'v3').length}`);

  const startTime = Date.now();

  // Process pools with parallel fetching
  console.log('\nFetching pool states (parallel processing)...');
  const results = await processPoolsInParallel(poolsNeedingUpdate, 20, [...PRIVATE_RPC_NODES]);

  const fetchTime = (Date.now() - startTime) / 1000;
  console.log(`\nFetched ${results.length} pools in ${fetchTime.toFixed(2)} seconds`);

  // Update registry
  console.log('\nUpdating registry...');
  const { updated, failed, v2Updated, v3Updated } = updateRegistryWithStates(registry, results);

  console.log(`\n=== Update Results ===`);
  console.log(`Total state fields updated: ${updated}`);
  console.log(`  V2 reserves updated: ${v2Updated} pools`);
  console.log(`  V3 state updated: ${v3Updated} pools`);
  console.log(`Failed to fetch: ${failed} pools`);
  console.log(`Success rate: ${(((results.length - failed) / results.length) * 100).toFixed(1)}%`);

  // Save registry
  await registry.save();
  console.log('\nRegistry saved successfully');

  // Final statistics
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

  // Error summary
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    console.log(`\n=== Top Errors ===`);
    const errorCounts = errors.reduce((acc, e) => {
      const errorMsg = e.error || 'Unknown';
      acc[errorMsg] = (acc[errorMsg] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([error, count]) => {
        console.log(`  ${error.substring(0, 80)}: ${count}`);
      });
  }

  console.log(`\n✅ Pool state fetching complete!`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
}

main().catch(console.error);