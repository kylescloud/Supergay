import { ethers } from 'ethers';
import { TOKENS, DEX_CONFIG } from '../src/config/constants';

// Major token pairs for discovery
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
  { name: 'sushiswap-v3', type: 'v3', config: DEX_CONFIG.sushiswapV3 },
  { name: 'pancakeswap-v3', type: 'v3', config: DEX_CONFIG.pancakeSwapV3 },
  { name: 'aerodrome', type: 'v2', config: DEX_CONFIG.aerodrome },
  { name: 'aerodrome-slipstream', type: 'v3', config: DEX_CONFIG.aerodromeSlipStream },
  { name: 'baseswap', type: 'v2', config: DEX_CONFIG.baseSwap },
];

// V2 Factory ABI
const V2_FACTORY_ABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];

// V3 Factory ABI
const V3_FACTORY_ABI = ['function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'];

// V3 Pool ABI
const V3_POOL_ABI = ['function liquidity() external view returns (uint128)'];

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
}

async function main() {
  console.log('='.repeat(80));
  console.log('DISCOVERING POOLS FROM ALL DEXs');
  console.log('='.repeat(80));

  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const discoveredPools: DiscoveredPool[] = [];

  for (const dex of DEX_LIST) {
    console.log(`\n🔍 Discovering pools for ${dex.name}...`);
    
    for (const [symbol0, symbol1] of MAJOR_PAIRS) {
      const token0 = TOKENS[symbol0 as keyof typeof TOKENS];
      const token1 = TOKENS[symbol1 as keyof typeof TOKENS];

      if (!token0 || !token1) continue;

      // Ensure token0 < token1
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
          const factory = new ethers.Contract(dex.config.factory, V2_FACTORY_ABI, provider);
          const pairAddress = await factory.getPair(address0, address1);

          if (pairAddress !== ethers.ZeroAddress) {
            discoveredPools.push({
              dex: dex.name,
              address: pairAddress,
              token0: address0,
              token0Symbol: sym0,
              token1: address1,
              token1Symbol: sym1,
              version: 'v2'
            });
            console.log(`  ✓ Found ${sym0}/${sym1} pool: ${pairAddress}`);
          }
        } else if (dex.type === 'v3') {
          const factory = new ethers.Contract(dex.config.factory, V3_FACTORY_ABI, provider);
          const feeTiers = 'feeTiers' in dex.config ? (dex.config as any).feeTiers : [100, 500, 2500, 3000, 10000];

          for (const fee of feeTiers) {
            try {
              const poolAddress = await factory.getPool(address0, address1, fee);

              if (poolAddress !== ethers.ZeroAddress) {
                // Fetch liquidity
                const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
                const liquidity = await poolContract.liquidity();

                discoveredPools.push({
                  dex: dex.name,
                  address: poolAddress,
                  token0: address0,
                  token0Symbol: sym0,
                  token1: address1,
                  token1Symbol: sym1,
                  fee,
                  version: 'v3',
                  liquidity: BigInt(liquidity)
                });
                console.log(`  ✓ Found ${sym0}/${sym1} pool (fee ${fee / 10000}%): ${poolAddress}`);
              }
            } catch (error) {
              continue;
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }

  // Save results
  const fs = require('fs');
  const data = JSON.stringify(discoveredPools, (key, value) => {
    if (typeof value === 'bigint') return value.toString();
    return value;
  }, 2);
  fs.writeFileSync('data/all-dex-pools.json', data);

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('DISCOVERY SUMMARY');
  console.log('='.repeat(80));

  const poolsByDex: Record<string, number> = {};
  for (const pool of discoveredPools) {
    poolsByDex[pool.dex] = (poolsByDex[pool.dex] || 0) + 1;
  }

  console.log('\n📊 Pools discovered by DEX:');
  for (const [dex, count] of Object.entries(poolsByDex)) {
    console.log(`  ${dex}: ${count} pools`);
  }

  console.log(`\n📈 Total pools discovered: ${discoveredPools.length}`);

  const poolsWithLiquidity = discoveredPools.filter(p => p.liquidity && p.liquidity > 0n);
  console.log(`💧 Pools with liquidity: ${poolsWithLiquidity.length}`);
}

main().catch(console.error);