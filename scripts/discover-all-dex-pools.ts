import { ethers } from 'ethers';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';
import { RPCManager } from '../src/utils/rpcManager';

// All 14 Aave V3 flash loan tokens
const TOKEN_LIST = Object.entries(TOKENS);

// Major token pairs for initial discovery
const MAJOR_PAIRS = [
  ['WETH', 'USDC'],
  ['WETH', 'USDbC'],
  ['WETH', 'cbETH'],
  ['WETH', 'cbBTC'],
  ['WETH', 'wstETH'],
  ['WETH', 'weETH'],
  ['WETH', 'ezETH'],
  ['WETH', 'wrsETH'],
  ['USDC', 'USDbC'],
  ['cbETH', 'WETH'],
  ['cbBTC', 'USDbC'],
  ['cbBTC', 'USDC'],
];

// All DEXs to discover
const DEX_LIST = [
  { name: 'uniswap-v3', type: 'v3', config: DEX_CONFIG.uniswapV3 },
  { name: 'uniswap-v2', type: 'v2', config: DEX_CONFIG.uniswapV2 },
  { name: 'sushiswap-v3', type: 'v3', config: DEX_CONFIG.sushiswapV3 },
  { name: 'pancakeswap-v3', type: 'v3', config: DEX_CONFIG.pancakeSwapV3 },
  { name: 'aerodrome', type: 'v2', config: DEX_CONFIG.aerodrome },
  { name: 'aerodrome-slipstream', type: 'v3', config: DEX_CONFIG.aerodromeSlipStream },
  { name: 'baseswap', type: 'v2', config: DEX_CONFIG.baseSwap },
];

// V2 Factory ABI
const V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

// V3 Factory ABI
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

// V2 Pool ABI
const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

// V3 Pool ABI
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

// Multicall ABI
const MULTICALL_ABI = [
  'function aggregate(tuple(address target, bytes callData)[] calls) external view returns (uint256 blockNumber, bytes[] returnData)'
];

const MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

interface DiscoveredPool {
  dex: string;
  address: string;
  token0: string;
  token0Symbol: string;
  token1: string;
  token1Symbol: string;
  fee?: number;
  version: string;
  liquidity?: bigint;
  reserves?: { reserve0: bigint; reserve1: bigint };
  isValid: boolean;
}

class ComprehensivePoolDiscoverer {
  private rpcManager: RPCManager;
  private discoveredPools: DiscoveredPool[] = [];

  constructor() {
    this.rpcManager = new RPCManager();
  }

  async discoverAllPools() {
    console.log('='.repeat(80));
    console.log('COMPREHENSIVE POOL DISCOVERY FROM ALL DEXs');
    console.log('='.repeat(80));
    console.log();

    for (const dex of DEX_LIST) {
      console.log(`\n🔍 Discovering pools for ${dex.name}...`);
      await this.discoverDexpools(dex);
    }

    this.saveResults();
    this.printSummary();
  }

  async discoverDexpools(dex: { name: string; type: string; config: any }) {
    const provider = await this.rpcManager.getProvider();
    
    for (const [symbol0, symbol1] of MAJOR_PAIRS) {
      const token0 = TOKENS[symbol0 as keyof typeof TOKENS];
      const token1 = TOKENS[symbol1 as keyof typeof TOKENS];

      if (!token0 || !token1) {
        continue;
      }

      // Ensure token0 < token1 for proper ordering
      let address0 = token0;
      let address1 = token1;
      let sym0 = symbol0;
      let sym1 = symbol1;

      if (address0.toLowerCase() > address1.toLowerCase()) {
        [address0, address1] = [address1, address0];
        [sym0, sym1] = [sym1, sym0];
      }

      try {
        if (dex.type === 'v2') {
          await this.discoverV2Pool(provider, dex, address0, sym0, address1, sym1);
        } else if (dex.type === 'v3') {
          await this.discoverV3Pools(provider, dex, address0, sym0, address1, sym1);
        }
      } catch (error) {
        // Pool doesn't exist, continue
        continue;
      }
    }
  }

  async discoverV2Pool(
    provider: ethers.JsonRpcProvider,
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    const factory = new ethers.Contract(dex.config.factory, V2_FACTORY_ABI, provider);
    const pairAddress = await factory.getPair(token0, token1);

    if (pairAddress !== ethers.ZeroAddress) {
      // Fetch reserves using multicall for efficiency
      const reserves = await this.fetchV2Reserves(provider, pairAddress);

      const pool: DiscoveredPool = {
        dex: dex.name,
        address: pairAddress,
        token0,
        token0Symbol,
        token1,
        token1Symbol,
        version: 'v2',
        reserves: reserves,
        isValid: true
      };

      this.discoveredPools.push(pool);
      console.log(`  ✓ Found ${token0Symbol}/${token1Symbol} pool: ${pairAddress}`);
    }
  }

  async discoverV3Pools(
    provider: ethers.JsonRpcProvider,
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    const factory = new ethers.Contract(dex.config.factory, V3_FACTORY_ABI, provider);
    const feeTiers = dex.config.feeTiers || [100, 500, 2500, 3000, 10000];

    // Batch all fee tier queries
    const poolQueries: Array<{ fee: number; address: string }> = [];
    for (const fee of feeTiers) {
      try {
        const poolAddress = await factory.getPool(token0, token1, fee);
        if (poolAddress !== ethers.ZeroAddress) {
          poolQueries.push({ fee, address: poolAddress });
        }
      } catch (error) {
        continue;
      }
    }

    // Fetch pool states in batch
    for (const query of poolQueries) {
      try {
        const liquidity = await this.fetchV3Liquidity(provider, query.address);

        const pool: DiscoveredPool = {
          dex: dex.name,
          address: query.address,
          token0,
          token0Symbol,
          token1,
          token1Symbol,
          fee: query.fee,
          version: 'v3',
          liquidity: liquidity,
          isValid: true
        };

        this.discoveredPools.push(pool);
        console.log(`  ✓ Found ${token0Symbol}/${token1Symbol} pool (fee ${query.fee / 10000}%): ${query.address}`);
      } catch (error) {
        continue;
      }
    }
  }

  async fetchV2Reserves(provider: ethers.JsonRpcProvider, poolAddress: string): Promise<{ reserve0: bigint; reserve1: bigint }> {
    try {
      const poolContract = new ethers.Contract(poolAddress, V2_POOL_ABI, provider);
      const reserves = await poolContract.getReserves();
      return {
        reserve0: BigInt(reserves[0]),
        reserve1: BigInt(reserves[1]),
      };
    } catch (error) {
      return { reserve0: 0n, reserve1: 0n };
    }
  }

  async fetchV3Liquidity(provider: ethers.JsonRpcProvider, poolAddress: string): Promise<bigint> {
    try {
      const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
      const liquidity = await poolContract.liquidity();
      return BigInt(liquidity);
    } catch (error) {
      return 0n;
    }
  }

  saveResults() {
    const fs = require('fs');
    const data = JSON.stringify(this.discoveredPools, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    fs.writeFileSync('data/all-dex-pools.json', data);
    console.log(`\n💾 Saved ${this.discoveredPools.length} pools to data/all-dex-pools.json`);
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('DISCOVERY SUMMARY');
    console.log('='.repeat(80));

    // Count pools by DEX
    const poolsByDex: Record<string, number> = {};
    for (const pool of this.discoveredPools) {
      poolsByDex[pool.dex] = (poolsByDex[pool.dex] || 0) + 1;
    }

    console.log('\n📊 Pools discovered by DEX:');
    for (const [dex, count] of Object.entries(poolsByDex)) {
      console.log(`  ${dex}: ${count} pools`);
    }

    console.log(`\n📈 Total pools discovered: ${this.discoveredPools.length}`);

    // Count pools with liquidity
    const poolsWithLiquidity = this.discoveredPools.filter(p => 
      (p.liquidity && p.liquidity > 0n) || 
      (p.reserves && (p.reserves.reserve0 > 0n || p.reserves.reserve1 > 0n))
    );
    console.log(`💧 Pools with liquidity: ${poolsWithLiquidity.length}`);

    // Count by token pairs
    const pairCounts: Record<string, number> = {};
    for (const pool of this.discoveredPools) {
      const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
      pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    }

    console.log('\n🔥 Most common pairs:');
    const sortedPairs = Object.entries(pairCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [pair, count] of sortedPairs) {
      console.log(`  ${pair}: ${count} DEXs`);
    }
  }
}

// Main execution
async function main() {
  const discoverer = new ComprehensivePoolDiscoverer();
  await discoverer.discoverAllPools();
}

main().catch(console.error);