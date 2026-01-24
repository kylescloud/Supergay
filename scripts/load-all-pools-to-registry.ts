import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { MORALIS_RPC_NODES } from '../src/config/constants';
import { Token } from '../src/types';

interface RegistryPool {
  address: string;
  token0: Token;
  token1: Token;
  dex: string;
  version: string;
  fee: number;
  isActive: boolean;
}

interface MoralisData {
  pools: RegistryPool[];
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
  ],
  v4: [
    'function getState() external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'
  ]
};

async function fetchPoolState(
  poolAddress: string,
  version: string,
  dex: string,
  provider: ethers.JsonRpcProvider
): Promise<any> {
  try {
    // Use different ABI based on version and DEX
    let abi: any;
    
    if (dex === 'uniswap-v4') {
      abi = POOL_ABIS.v4;
    } else if (version === 'v2') {
      abi = POOL_ABIS.v2;
    } else {
      abi = POOL_ABIS.v3;
    }

    const contract = new ethers.Contract(poolAddress, abi, provider);

    if (version === 'v2') {
      const reserves = await contract.getReserves();
      return {
        reserve0: reserves.reserve0.toString(),
        reserve1: reserves.reserve1.toString(),
        timestamp: Date.now()
      };
    } else if (dex === 'uniswap-v4') {
      const state = await contract.getState();
      return {
        sqrtPriceX96: state.sqrtPriceX96.toString(),
        tick: Number(state.tick),
        protocolFee: Number(state.protocolFee),
        lpFee: Number(state.lpFee),
        timestamp: Date.now()
      };
    } else {
      const [slot0, liquidity] = await Promise.all([
        contract.slot0(),
        contract.liquidity()
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

async function loadAllPoolsToRegistry(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              LOADING ALL MORALIS POOLS TO REGISTRY                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Load Moralis data
  const dataPath = path.join(__dirname, '..', 'data', 'pool-registry-moralis.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ Moralis pools file not found. Run discover-all-pools-moralis.ts first.');
    process.exit(1);
  }

  const pools: RegistryPool[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`\n📊 Loaded ${pools.length} pools from Moralis data`);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  const provider = new ethers.JsonRpcProvider(MORALIS_RPC_NODES[0]);

  let successCount = 0;
  let failCount = 0;
  let stateFetchSuccess = 0;

  for (const pool of pools) {
    try {
      console.log(`\n🔄 Processing pool: ${pool.token0.symbol}/${pool.token1.symbol} on ${pool.dex}`);
      console.log(`   Address: ${pool.address}`);
      console.log(`   Version: ${pool.version}, Fee: ${pool.fee}`);

      // Add pool to registry
      registry.addPool({
        address: pool.address,
        token0: pool.token0,
        token1: pool.token1,
        dex: pool.dex,
        version: pool.version,
        fee: pool.fee,
        isActive: pool.isActive
      });

      // Fetch current state
      const state = await fetchPoolState(pool.address, pool.version, pool.dex, provider);
      
      if (state) {
        registry.updatePoolState(pool.address, state);
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

    // Rate limiting - faster for batch loading
    await new Promise(resolve => setTimeout(resolve, 100));
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
    await loadAllPoolsToRegistry();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();