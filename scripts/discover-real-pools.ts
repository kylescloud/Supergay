import { ethers } from 'ethers';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';

// Base mainnet RPC
const RPC_URL = 'https://mainnet.base.org';

// All 14 Aave V3 flash loan tokens
const TOKEN_LIST = Object.entries(TOKENS);

// Focus on major token pairs for better liquidity
const MAJOR_PAIRS = [
  ['WETH', 'USDC'],
  ['WETH', 'USDbC'],
  ['WETH', 'cbETH'],
  ['WETH', 'cbBTC'],
  ['WETH', 'wstETH'],
  ['USDC', 'USDbC'],
  ['cbETH', 'WETH'],
  ['cbBTC', 'USDbC'],
];

// DEXs to discover
const DEX_LIST = [
  { name: 'uniswap-v3', type: 'v3', config: DEX_CONFIG.uniswapV3 },
  { name: 'uniswap-v2', type: 'v2', config: DEX_CONFIG.uniswapV2 },
  { name: 'aerodrome', type: 'v2', config: DEX_CONFIG.aerodrome },
  { name: 'aerodrome-slipstream', type: 'v3', config: DEX_CONFIG.aerodromeSlipStream },
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
}

class PoolDiscoverer {
  private provider: ethers.JsonRpcProvider;
  private discoveredPools: DiscoveredPool[] = [];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
  }

  async discoverAllPools() {
    console.log('='.repeat(80));
    console.log('DISCOVERING REAL POOLS FROM FACTORY CONTRACTS');
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
          await this.discoverV2Pool(dex, address0, sym0, address1, sym1);
        } else if (dex.type === 'v3') {
          await this.discoverV3Pools(dex, address0, sym0, address1, sym1);
        }
      } catch (error) {
        // Pool doesn't exist
        continue;
      }
    }
  }

  async discoverV2Pool(
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    const factory = new ethers.Contract(dex.config.factory, V2_FACTORY_ABI, this.provider);
    const pairAddress = await factory.getPair(token0, token1);

    if (pairAddress !== ethers.ZeroAddress) {
      // Fetch reserves
      const pairContract = new ethers.Contract(pairAddress, V2_POOL_ABI, this.provider);
      const reserves = await pairContract.getReserves();

      const pool: DiscoveredPool = {
        dex: dex.name,
        address: pairAddress,
        token0,
        token0Symbol,
        token1,
        token1Symbol,
        version: 'v2',
        reserves: {
          reserve0: BigInt(reserves[0]),
          reserve1: BigInt(reserves[1]),
        }
      };

      this.discoveredPools.push(pool);
      console.log(`  ✓ Found ${token0Symbol}/${token1Symbol} pool: ${pairAddress}`);
    }
  }

  async discoverV3Pools(
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    const factory = new ethers.Contract(dex.config.factory, V3_FACTORY_ABI, this.provider);
    const feeTiers = dex.config.feeTiers || [100, 500, 2500, 3000, 10000];

    for (const fee of feeTiers) {
      try {
        const poolAddress = await factory.getPool(token0, token1, fee);

        if (poolAddress !== ethers.ZeroAddress) {
          // Fetch pool state
          const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, this.provider);
          const slot0 = await poolContract.slot0();
          const liquidity = await poolContract.liquidity();

          const pool: DiscoveredPool = {
            dex: dex.name,
            address: poolAddress,
            token0,
            token0Symbol,
            token1,
            token1Symbol,
            fee,
            version: 'v3',
            liquidity: BigInt(liquidity),
          };

          this.discoveredPools.push(pool);
          console.log(`  ✓ Found ${token0Symbol}/${token1Symbol} pool (fee ${fee / 10000}%): ${poolAddress}`);
        }
      } catch (error) {
        // Pool doesn't exist for this fee tier
        continue;
      }
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
    fs.writeFileSync('data/real-pools.json', data);
    console.log(`\n💾 Saved ${this.discoveredPools.length} pools to data/real-pools.json`);
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

    // Top liquidity pools
    const liquidityPools = this.discoveredPools.filter(p => p.liquidity || (p.reserves && (p.reserves.reserve0 > 0n || p.reserves.reserve1 > 0n)));
    console.log(`\n💧 Pools with liquidity: ${liquidityPools.length}`);
  }
}

// Main execution
async function main() {
  const discoverer = new PoolDiscoverer();
  await discoverer.discoverAllPools();
}

main().catch(console.error);