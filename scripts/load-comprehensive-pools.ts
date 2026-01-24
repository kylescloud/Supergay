import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';
import fs from 'fs';

// V2 Pool ABI (minimal)
const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

// V3 Pool ABI (minimal)
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

const RPC_URL = 'https://mainnet.base.org';

async function main() {
  console.log('='.repeat(80));
  console.log('LOADING COMPREHENSIVE POOL REGISTRY');
  console.log('='.repeat(80));
  console.log();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const registry = new PoolRegistryManager();

  // Load existing registry
  await registry.load();

  // Read comprehensive pool registry
  const comprehensiveData = JSON.parse(
    fs.readFileSync('data/comprehensive-pool-registry.json', 'utf-8')
  );

  console.log(`Found ${comprehensiveData.pools.length} pools in comprehensive registry`);

  // Convert to Pool format
  const pools: any[] = [];

  for (const poolData of comprehensiveData.pools) {
    try {
      const token0Metadata = TOKEN_METADATA[poolData.token0Symbol];
      const token1Metadata = TOKEN_METADATA[poolData.token1Symbol];

      if (!token0Metadata || !token1Metadata) {
        console.log(`⚠️ Skipping ${poolData.token0Symbol}/${poolData.token1Symbol} - missing metadata`);
        continue;
      }

      const pool: any = {
        address: poolData.address,
        dex: poolData.dex,
        dexVersion: poolData.version,
        fee: poolData.fee || 0,
        token0: {
          address: poolData.token0,
          symbol: poolData.token0Symbol,
          decimals: token0Metadata.decimals,
          name: token0Metadata.name
        },
        token1: {
          address: poolData.token1,
          symbol: poolData.token1Symbol,
          decimals: token1Metadata.decimals,
          name: token1Metadata.name
        },
        isActive: true,
        lastUpdated: Date.now()
      };

      // Fetch pool state
      if (poolData.version === 'v2') {
        await fetchV2PoolState(provider, pool);
      } else if (poolData.version === 'v3') {
        await fetchV3PoolState(provider, pool);
      }

      pools.push(pool);
      console.log(`✅ Loaded ${pool.dex}: ${pool.token0.symbol}/${pool.token1.symbol} (${pool.address})`);

    } catch (error) {
      console.error(`❌ Failed to load pool ${poolData.address}: ${error}`);
    }
  }

  console.log(`\n📊 Successfully loaded ${pools.length} pools`);

  // Add to registry
  await registry.addPools(pools);

  // Save registry
  await registry.save();

  // Print summary
  registry.printSummary();
}

async function fetchV2PoolState(provider: ethers.JsonRpcProvider, pool: any): Promise<void> {
  try {
    const poolContract = new ethers.Contract(pool.address, V2_POOL_ABI, provider);
    const reserves = await poolContract.getReserves();
    
    pool.reserve0 = BigInt(reserves[0]);
    pool.reserve1 = BigInt(reserves[1]);
    pool.liquidity = 0n;
    pool.sqrtPriceX96 = 0n;
    pool.tick = 0;
  } catch (error) {
    console.log(`⚠️ Failed to fetch V2 state for ${pool.address}: ${error}`);
    pool.isActive = false;
  }
}

async function fetchV3PoolState(provider: ethers.JsonRpcProvider, pool: any): Promise<void> {
  try {
    const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
    const slot0 = await poolContract.slot0();
    const liquidity = await poolContract.liquidity();
    
    pool.sqrtPriceX96 = BigInt(slot0[0]);
    pool.tick = Number(slot0[1]);
    pool.liquidity = BigInt(liquidity);
    pool.reserve0 = 0n;
    pool.reserve1 = 0n;
  } catch (error) {
    console.log(`⚠️ Failed to fetch V3 state for ${pool.address}: ${error}`);
    pool.isActive = false;
  }
}

main().catch(console.error);