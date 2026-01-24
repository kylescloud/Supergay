import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { MORALIS_RPC_NODES } from '../src/config/constants';
import { Token } from '../src/types';

interface MoralisPool {
  address: string;
  dex: string;
  dexType: string;
  dexVersion: string;
  token0: Token;
  token1: Token;
  feeTier?: number;
  liquidityUSD: number;
  volume24hUSD: number;
  priceUSD: string;
  pairLabel: string;
  isActive: boolean;
  timestamp: number;
}

interface MoralisData {
  pools: MoralisPool[];
  stats: any;
}

// ABI for getting pool state
const POOL_ABIS = {
  v2: [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
  ],
  v3: [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)'
  ]
};

async function fetchPoolState(
  poolAddress: string,
  version: string,
  provider: ethers.JsonRpcProvider
): Promise<any> {
  try {
    const contract = new ethers.Contract(poolAddress, POOL_ABIS[version], provider);

    if (version === 'v2') {
      const reserves = await contract.getReserves();
      return {
        reserve0: reserves.reserve0.toString(),
        reserve1: reserves.reserve1.toString()
      };
    } else if (version === 'v3') {
      const [slot0, liquidity] = await Promise.all([
        contract.slot0(),
        contract.liquidity()
      ]);
      return {
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tick: Number(slot0.tick),
        liquidity: liquidity.toString()
      };
    }
  } catch (error) {
    console.error(`❌ Error fetching state for ${poolAddress}:`, error);
    return null;
  }

  return null;
}

async function loadMoralisPoolsToRegistry(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              LOADING MORALIS POOLS TO REGISTRY                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Load Moralis data
  const dataPath = path.join(__dirname, '..', 'data', 'moralis-pools.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ Moralis pools file not found. Run discover-pools-moralis.ts first.');
    process.exit(1);
  }

  const moralisData: MoralisData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`\n📊 Loaded ${moralisData.pools.length} pools from Moralis data`);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  const provider = new ethers.JsonRpcProvider(MORALIS_RPC_NODES[0]);

  let successCount = 0;
  let failCount = 0;

  for (const pool of moralisData.pools) {
    try {
      console.log(`\n🔄 Processing pool: ${pool.token0.symbol}/${pool.token1.symbol} on ${pool.dex}`);

      // Map DEX names to our internal names
      let dexName = pool.dexType;
      if (pool.dexType === 'unknown') {
        // Try to map from exchange name
        if (pool.dex.toLowerCase().includes('uniswap')) dexName = 'uniswapV3';
        else if (pool.dex.toLowerCase().includes('sushiswap')) dexName = 'sushiswapV3';
        else if (pool.dex.toLowerCase().includes('pancakeswap')) dexName = 'pancakeSwapV3';
        else if (pool.dex.toLowerCase().includes('aerodrome')) dexName = 'aerodrome';
        else if (pool.dex.toLowerCase().includes('baseswap')) dexName = 'baseSwap';
      }

      // Convert fee tier from basis points to our format
      let fee = 3000; // Default 0.3%
      if (pool.feeTier) {
        fee = pool.feeTier;
      }

      // Add pool to registry
      registry.addPool({
        address: pool.address,
        token0: pool.token0,
        token1: pool.token1,
        dex: dexName,
        version: pool.dexVersion,
        fee: fee,
        isActive: pool.isActive
      });

      // Fetch current state
      const state = await fetchPoolState(pool.address, pool.dexVersion, provider);
      
      if (state) {
        registry.updatePoolState(pool.address, state);
        console.log(`   ✅ Pool state updated`);
        successCount++;
      } else {
        console.log(`   ⚠️  Failed to fetch state, adding without state`);
        failCount++;
      }

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
  console.log(`❌ Failed to fetch state: ${failCount} pools`);
  console.log(`📊 Total pools in registry: ${registry.getAllPools().length}`);
  console.log('\n╚══════════════════════════════════════════════════════════════════════════════╝');
}

async function main() {
  try {
    await loadMoralisPoolsToRegistry();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();