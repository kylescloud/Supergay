import { ethers } from 'ethers';
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

// ABIs
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

/**
 * Fetch V3 pool state
 */
async function fetchV3PoolState(
  provider: ethers.Provider,
  pool: BasePool
): Promise<Partial<BasePool> | null> {
  try {
    const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
    
    const [slot0, liquidity] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity()
    ]);
    
    return {
      liquidity: liquidity.toString(),
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      tick: Number(slot0.tick)
    };
  } catch (error: any) {
    console.error(`    ❌ Error fetching V3 state for ${pool.token0.symbol}/${pool.token1.symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch V2 pool state
 */
async function fetchV2PoolState(
  provider: ethers.Provider,
  pool: BasePool
): Promise<Partial<BasePool> | null> {
  try {
    const poolContract = new ethers.Contract(pool.address, V2_PAIR_ABI, provider);
    const reserves = await poolContract.getReserves();
    
    return {
      reserve0: reserves.reserve0.toString(),
      reserve1: reserves.reserve1.toString()
    };
  } catch (error: any) {
    console.error(`    ❌ Error fetching V2 state for ${pool.token0.symbol}/${pool.token1.symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch pool state with retry logic
 */
async function fetchPoolStateWithRetry(
  provider: ethers.Provider,
  pool: BasePool,
  maxRetries: number = 3
): Promise<Partial<BasePool> | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const state = pool.dexVersion === 'v3' 
        ? await fetchV3PoolState(provider, pool)
        : await fetchV2PoolState(provider, pool);
      
      if (state) return state;
      
      if (attempt < maxRetries) {
        console.log(`    ⏳ Retry ${attempt}/${maxRetries} for ${pool.token0.symbol}/${pool.token1.symbol}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error: any) {
      if (attempt === maxRetries) {
        console.error(`    ❌ Failed after ${maxRetries} attempts for ${pool.token0.symbol}/${pool.token1.symbol}`);
      }
    }
  }
  return null;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('PHASE 3: COMPREHENSIVE POOL STATE FETCHING');
  console.log('═'.repeat(80));
  
  // Load pools
  console.log('\n📂 Loading pools from data/base-pools.json...');
  const poolsData = await fs.readFile(path.join('data', 'base-pools.json'), 'utf-8');
  const poolsJson = JSON.parse(poolsData);
  const pools: BasePool[] = poolsJson.pools;
  console.log(`  ✅ Loaded ${pools.length} pools`);
  
  // Initialize provider with fallback RPCs
  const rpcUrls = [
    'https://mainnet.base.org',
    'https://base.publicnode.com',
    'https://base.meowrpc.com'
  ];
  
  let provider: ethers.Provider | null = null;
  let rpcIndex = 0;
  
  for (let i = 0; i < rpcUrls.length; i++) {
    try {
      provider = new ethers.JsonRpcProvider(rpcUrls[i]);
      await provider.getBlockNumber();
      rpcIndex = i;
      console.log(`  ✅ Connected to RPC: ${rpcUrls[i]}`);
      break;
    } catch (error) {
      console.log(`  ⚠️ Failed to connect to ${rpcUrls[i]}, trying next...`);
    }
  }
  
  if (!provider) {
    throw new Error('Failed to connect to any RPC');
  }
  
  // Fetch pool states
  console.log('\n🔄 Fetching pool states...');
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  const batchSize = 20;
  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(pools.length / batchSize);
    
    console.log(`\n  Processing batch ${batchNum}/${totalBatches}...`);
    
    for (const pool of batch) {
      // Skip if already has state data
      const hasV3State = pool.dexVersion === 'v3' && pool.sqrtPriceX96 && pool.liquidity;
      const hasV2State = pool.dexVersion === 'v2' && pool.reserve0 && pool.reserve1;
      
      if (hasV3State || hasV2State) {
        skipped++;
        continue;
      }
      
      const state = await fetchPoolStateWithRetry(provider, pool);
      
      if (state) {
        Object.assign(pool, state);
        success++;
        console.log(`    ✅ ${pool.dex} ${pool.token0.symbol}/${pool.token1.symbol}`);
      } else {
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Delay between batches
    if (batchNum < totalBatches) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Update and save pools
  console.log(`\n${'═'.repeat(80)}`);
  console.log('FETCH SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools: ${pools.length}`);
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️ Skipped (already has state): ${skipped}`);
  
  // Update metadata
  poolsJson.lastUpdated = new Date().toISOString();
  poolsJson.pools = pools;
  
  // Save updated pools
  await fs.writeFile(
    path.join('data', 'base-pools.json'),
    JSON.stringify(poolsJson, null, 2)
  );
  
  console.log(`\n✅ Updated pools saved to: data/base-pools.json`);
  
  // Statistics
  const v3WithState = pools.filter(p => p.dexVersion === 'v3' && p.sqrtPriceX96 && p.liquidity).length;
  const v2WithState = pools.filter(p => p.dexVersion === 'v2' && p.reserve0 && p.reserve1).length;
  
  console.log('\n📊 Pool State Statistics:');
  console.log(`  V3 pools with state: ${v3WithState}`);
  console.log(`  V2 pools with state: ${v2WithState}`);
  console.log(`  Total pools with state: ${v3WithState + v2WithState}`);
  
  console.log('\n✅ Phase 3 completed: Pool state fetching finished!');
}

main().catch(console.error);