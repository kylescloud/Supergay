import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKENS, TOKEN_METADATA, MORALIS_RPC_NODES } from '../src/config/constants';

interface DiscoveredPool {
  address: string;
  token0: string;
  token1: string;
  dex: string;
  version: string;
  fee?: number;
}

interface FactoryData {
  pools: DiscoveredPool[];
  stats: any;
}

// Pool ABIs for getting state
const POOL_ABIS = {
  v2: [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
  ],
  v3: [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function fee() external view returns (uint24)'
  ]
};

async function getTokenInfo(provider: ethers.JsonRpcProvider, tokenAddress: string) {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function symbol() external view returns (string)',
        'function decimals() external view returns (uint8)',
        'function name() external view returns (string)'
      ],
      provider
    );

    const [symbol, decimals, name] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.name()
    ]);

    return { symbol, decimals: Number(decimals), name };
  } catch (error) {
    // Fallback to known tokens
    for (const [symbol, address] of Object.entries(TOKENS)) {
      if (address.toLowerCase() === tokenAddress.toLowerCase()) {
        const metadata = TOKEN_METADATA[symbol];
        return {
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          name: metadata.name
        };
      }
    }
    return { symbol: 'UNKNOWN', decimals: 18, name: 'Unknown Token' };
  }
}

async function getPoolState(
  poolAddress: string,
  version: string,
  provider: ethers.JsonRpcProvider
): Promise<any> {
  try {
    const abi = version === 'v2' ? POOL_ABIS.v2 : POOL_ABIS.v3;
    const pool = new ethers.Contract(poolAddress, abi, provider);

    if (version === 'v2') {
      const reserves = await pool.getReserves();
      return {
        reserve0: reserves.reserve0.toString(),
        reserve1: reserves.reserve1.toString(),
        timestamp: Date.now()
      };
    } else {
      const [slot0, liquidity] = await Promise.all([
        pool.slot0(),
        pool.liquidity()
      ]);
      return {
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tick: Number(slot0.tick),
        liquidity: liquidity.toString(),
        timestamp: Date.now()
      };
    }
  } catch (error) {
    console.error(`❌ Error fetching state for ${poolAddress}:`, error);
    return null;
  }
}

async function loadPoolsToRegistry(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              LOADING FACTORY-DISCOVERED POOLS TO REGISTRY                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Load factory-discovered pools
  const dataPath = path.join(__dirname, '..', 'data', 'all-pools-factory.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ Factory pools file not found. Run pools:discover:factory first.');
    process.exit(1);
  }

  const data: FactoryData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const pools: DiscoveredPool[] = data.pools;
  console.log(`\n📊 Loaded ${pools.length} pools from factory discovery`);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  const provider = new ethers.JsonRpcProvider(MORALIS_RPC_NODES[0]);

  let successCount = 0;
  let failCount = 0;
  let stateFetchSuccess = 0;

  for (const pool of pools) {
    try {
      console.log(`\n🔄 Processing pool: ${pool.dex} (${pool.version})`);
      console.log(`   Address: ${pool.address}`);
      console.log(`   Token0: ${pool.token0}`);
      console.log(`   Token1: ${pool.token1}`);
      console.log(`   Fee: ${pool.fee || 'N/A'}`);

      // Get token info
      const token0Info = await getTokenInfo(provider, pool.token0);
      const token1Info = await getTokenInfo(provider, pool.token1);

      // Add pool to registry
      const poolData = {
        address: pool.address,
        dex: pool.dex,
        dexVersion: pool.version,
        token0: {
          address: pool.token0,
          symbol: token0Info.symbol,
          decimals: token0Info.decimals,
          name: token0Info.name
        },
        token1: {
          address: pool.token1,
          symbol: token1Info.symbol,
          decimals: token1Info.decimals,
          name: token1Info.name
        },
        fee: pool.fee || (pool.version === 'v2' ? 3000 : 3000),
        isActive: true,
        lastUpdated: Date.now()
      };

      // Collect pools for batch add
      await registry.addPools([poolData]);

      // Fetch current state
      const state = await getPoolState(pool.address, pool.version, provider);
      
      if (state) {
        await registry.updatePoolStates([{ address: pool.address, ...state }]);
        console.log(`   ✅ Pool state updated`);
        stateFetchSuccess++;
      } else {
        console.log(`   ⚠️  Failed to fetch state (pool added without state)`);
        failCount++;
      }

      successCount++;

    } catch (error) {
      console.error(`   ❌ Error processing pool ${pool.address}:`, error);
      failCount++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Save registry
  await registry.save();
  console.log(`\n💾 Registry saved to: data/pool-registry.json`);

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          SUMMARY                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Successfully loaded: ${successCount} pools`);
  console.log(`📊 State fetched: ${stateFetchSuccess} pools`);
  console.log(`❌ Failed to fetch state: ${failCount} pools`);
  console.log(`📊 Total pools in registry: ${registry.getAllPools().length}`);

  // Count pools per DEX
  const allPools = registry.getAllPools();
  const poolsPerDEX: Record<string, number> = {};
  for (const pool of allPools) {
    poolsPerDEX[pool.dex] = (poolsPerDEX[pool.dex] || 0) + 1;
  }

  console.log('\n🏛️  Pools per DEX in Registry:');
  for (const [dex, count] of Object.entries(poolsPerDEX).sort(([, a], [, b]) => b - a)) {
    console.log(`   ${dex.padEnd(30)}: ${count} pools`);
  }
  console.log();

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           ✅ ALL POOLS LOADED INTO REGISTRY - READY FOR SCANNING            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
}

async function main() {
  try {
    await loadPoolsToRegistry();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();