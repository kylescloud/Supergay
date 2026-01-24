import { ethers } from 'ethers';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';

// Base mainnet RPC
const RPC_URL = 'https://mainnet.base.org';

// All 14 Aave V3 flash loan tokens
const TOKEN_LIST = Object.entries(TOKENS);

// All 10 DEXs to discover
const DEX_LIST = [
  { name: 'uniswap-v4', type: 'v4', config: DEX_CONFIG.uniswapV4 },
  { name: 'uniswap-v3', type: 'v3', config: DEX_CONFIG.uniswapV3 },
  { name: 'uniswap-v2', type: 'v2', config: DEX_CONFIG.uniswapV2 },
  { name: 'curve', type: 'curve', config: DEX_CONFIG.curve },
  { name: 'sushiswap-v3', type: 'v3', config: DEX_CONFIG.sushiswapV3 },
  { name: 'pancakeswap-v3', type: 'v3', config: DEX_CONFIG.pancakeSwapV3 },
  { name: 'aerodrome', type: 'v2', config: DEX_CONFIG.aerodrome },
  { name: 'aerodrome-slipstream', type: 'v3', config: DEX_CONFIG.aerodromeSlipStream },
  { name: 'aerodrome-slipstream-2', type: 'v3', config: DEX_CONFIG.aerodromeSlipStream2 },
  { name: 'baseswap', type: 'v2', config: DEX_CONFIG.baseSwap },
];

// V2 Factory ABI (minimal)
const V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

// V3 Factory ABI (minimal)
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

// Curve Registry ABI (minimal)
const CURVE_REGISTRY_ABI = [
  'function find_pool_for_coins(address _coin, address _underlying_coin, int128 i) external view returns (address)'
];

interface DiscoveredPool {
  dex: string;
  token0: string;
  token0Symbol: string;
  token1: string;
  token1Symbol: string;
  poolAddress: string;
  fee?: number;
}

class PoolDiscoverer {
  private provider: ethers.JsonRpcProvider;
  private discoveredPools: DiscoveredPool[] = [];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
  }

  async discoverAllPools() {
    console.log('='.repeat(80));
    console.log('DISCOVERING POOLS FOR 14 TOKENS ACROSS 10 DEXs');
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
    const tokenPairs = this.generateTokenPairs();

    for (const { token0, token0Symbol, token1, token1Symbol } of tokenPairs) {
      try {
        if (dex.type === 'v2') {
          await this.discoverV2Pool(dex, token0, token0Symbol, token1, token1Symbol);
        } else if (dex.type === 'v3') {
          await this.discoverV3Pools(dex, token0, token0Symbol, token1, token1Symbol);
        } else if (dex.type === 'v4') {
          await this.discoverV4Pools(dex, token0, token0Symbol, token1, token1Symbol);
        } else if (dex.type === 'curve') {
          await this.discoverCurvePool(dex, token0, token0Symbol, token1, token1Symbol);
        }
      } catch (error) {
        // Pool doesn't exist or error discovering
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
      this.discoveredPools.push({
        dex: dex.name,
        token0,
        token0Symbol,
        token1,
        token1Symbol,
        poolAddress: pairAddress,
      });
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
          this.discoveredPools.push({
            dex: dex.name,
            token0,
            token0Symbol,
            token1,
            token1Symbol,
            poolAddress: poolAddress,
            fee,
          });
          console.log(`  ✓ Found ${token0Symbol}/${token1Symbol} pool (fee ${fee / 10000}%): ${poolAddress}`);
        }
      } catch (error) {
        // Pool doesn't exist for this fee tier
        continue;
      }
    }
  }

  async discoverV4Pools(
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    // Uniswap V4 uses a different architecture with Pool Manager
    // For now, we'll skip V4 pool discovery as it requires more complex logic
    console.log(`  ⊘ Skipping ${dex.name} - requires specialized V4 discovery`);
  }

  async discoverCurvePool(
    dex: { name: string; config: any },
    token0: string,
    token0Symbol: string,
    token1: string,
    token1Symbol: string
  ) {
    // Curve pools need to be discovered differently
    // For now, we'll skip as it requires registry lookup
    console.log(`  ⊘ Skipping ${dex.name} - requires specialized Curve discovery`);
  }

  generateTokenPairs(): Array<{
    token0: string;
    token0Symbol: string;
    token1: string;
    token1Symbol: string;
  }> {
    const pairs: Array<{
      token0: string;
      token0Symbol: string;
      token1: string;
      token1Symbol: string;
    }> = [];

    // Generate all unique pairs
    for (let i = 0; i < TOKEN_LIST.length; i++) {
      for (let j = i + 1; j < TOKEN_LIST.length; j++) {
        const [symbol0, address0] = TOKEN_LIST[i];
        const [symbol1, address1] = TOKEN_LIST[j];

        // Ensure token0 < token1 for proper ordering
        if (address0.toLowerCase() < address1.toLowerCase()) {
          pairs.push({
            token0: address0,
            token0Symbol: symbol0,
            token1: address1,
            token1Symbol: symbol1,
          });
        } else {
          pairs.push({
            token0: address1,
            token0Symbol: symbol1,
            token1: address0,
            token1Symbol: symbol0,
          });
        }
      }
    }

    return pairs;
  }

  saveResults() {
    const fs = require('fs');
    const data = JSON.stringify(this.discoveredPools, null, 2);
    fs.writeFileSync('data/discovered-pools.json', data);
    console.log(`\n💾 Saved ${this.discoveredPools.length} pools to data/discovered-pools.json`);
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

    // Top liquidity pairs (by number of DEXs)
    const pairCounts: Record<string, number> = {};
    for (const pool of this.discoveredPools) {
      const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
      pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    }

    console.log('\n🔥 Most common pairs (by number of DEXs):');
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
  const discoverer = new PoolDiscoverer();
  await discoverer.discoverAllPools();
}

main().catch(console.error);