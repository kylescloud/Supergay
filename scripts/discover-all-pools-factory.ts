import { ethers } from 'ethers';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';
import { PoolRegistryManager } from '../src/pools/registry';
import * as fs from 'fs';
import * as path from 'path';

interface DiscoveredPool {
  address: string;
  token0: string;
  token1: string;
  dex: string;
  version: string;
  fee?: number;
}

// Factory ABIs for different DEX types
const FACTORY_ABIS = {
  v2: [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
    'function allPairsLength() external view returns (uint256)',
    'function allPairs(uint256) external view returns (address pair)'
  ],
  v3: [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
  ]
};

// Pool ABIs for getting token addresses
const POOL_ABIS = {
  v2: [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
  ],
  v3: [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function fee() external view returns (uint24)'
  ]
};

// RPC endpoints (use multiple for load balancing)
const RPC_ENDPOINTS = [
  'https://site1.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
  'https://site2.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357'
];

async function discoverPoolsForDEX(
  provider: ethers.JsonRpcProvider,
  dex: string,
  version: string,
  factoryAddress: string,
  feeTiers: number[] = [3000]
): Promise<DiscoveredPool[]> {
  console.log(`\n🔍 Discovering pools for ${dex} (${version})...`);
  const pools: DiscoveredPool[] = [];

  try {
    const factory = new ethers.Contract(
      factoryAddress,
      version === 'v2' ? FACTORY_ABIS.v2 : FACTORY_ABIS.v3,
      provider
    );

    // For V2: Query specific token pairs
    if (version === 'v2') {
      const tokenAddresses = Object.values(TOKENS);
      
      for (let i = 0; i < tokenAddresses.length; i++) {
        for (let j = i + 1; j < tokenAddresses.length; j++) {
          try {
            const pairAddress = await factory.getPair(tokenAddresses[i], tokenAddresses[j]);
            if (pairAddress !== ethers.ZeroAddress) {
              pools.push({
                address: pairAddress,
                token0: tokenAddresses[i],
                token1: tokenAddresses[j],
                dex: dex,
                version: version
              });
            }
          } catch (error) {
            // Pool doesn't exist, continue
          }
        }
      }
    } 
    // For V3: Query all fee tiers
    else if (version === 'v3') {
      const tokenAddresses = Object.values(TOKENS);
      
      for (const fee of feeTiers) {
        for (let i = 0; i < tokenAddresses.length; i++) {
          for (let j = i + 1; j < tokenAddresses.length; j++) {
            try {
              const poolAddress = await factory.getPool(
                tokenAddresses[i],
                tokenAddresses[j],
                fee
              );
              if (poolAddress !== ethers.ZeroAddress) {
                pools.push({
                  address: poolAddress,
                  token0: tokenAddresses[i],
                  token1: tokenAddresses[j],
                  dex: dex,
                  version: version,
                  fee: fee
                });
              }
            } catch (error) {
              // Pool doesn't exist, continue
            }
          }
        }
      }
    }

    console.log(`✅ Found ${pools.length} pools for ${dex}`);
    return pools;

  } catch (error) {
    console.error(`❌ Error discovering pools for ${dex}:`, error);
    return [];
  }
}

async function discoverAllPools(): Promise<DiscoveredPool[]> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          COMPLETE POOL DISCOVERY - FACTORY QUERIES                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();
  const allPools: DiscoveredPool[] = [];
  const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0]);

  // Define DEX configurations
  const dexConfigs = [
    { name: 'uniswap-v3', version: 'v3', address: DEX_CONFIG.uniswapV3.factory, feeTiers: [...DEX_CONFIG.uniswapV3.feeTiers] },
    { name: 'uniswap-v2', version: 'v2', address: DEX_CONFIG.uniswapV2.factory },
    { name: 'sushiswap-v3', version: 'v3', address: DEX_CONFIG.sushiswapV3.factory, feeTiers: [...DEX_CONFIG.sushiswapV3.feeTiers] },
    { name: 'pancakeswap-v3', version: 'v3', address: DEX_CONFIG.pancakeSwapV3.factory, feeTiers: [...DEX_CONFIG.pancakeSwapV3.feeTiers] },
    { name: 'aerodrome', version: 'v2', address: DEX_CONFIG.aerodrome.factory },
    { name: 'aerodrome-slipstream', version: 'v3', address: DEX_CONFIG.aerodromeSlipStream.factory, feeTiers: [...DEX_CONFIG.aerodromeSlipStream.feeTiers] },
    { name: 'aerodrome-slipstream-2', version: 'v3', address: DEX_CONFIG.aerodromeSlipStream2.factory, feeTiers: [...DEX_CONFIG.aerodromeSlipStream2.feeTiers] },
    { name: 'baseswap', version: 'v2', address: DEX_CONFIG.baseSwap.factory }
  ];

  // Discover pools for each DEX
  for (const dexConfig of dexConfigs) {
    const pools = await discoverPoolsForDEX(
      provider,
      dexConfig.name,
      dexConfig.version,
      dexConfig.address,
      dexConfig.feeTiers || [3000]
    );
    allPools.push(...pools);
  }

  // Remove duplicates
  const uniquePools = Array.from(
    new Map(allPools.map(pool => [pool.address.toLowerCase(), pool])).values()
  );

  const discoveryTime = Date.now() - startTime;

  // Print statistics
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          DISCOVERY STATISTICS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Total Pools Found:      ${allPools.length}`);
  console.log(`✅ Total Unique Pools:     ${uniquePools.length}`);
  console.log(`⏱️  Discovery Time:        ${(discoveryTime / 1000).toFixed(2)}s`);

  // Count pools per DEX
  const poolsPerDEX: Record<string, number> = {};
  for (const pool of allPools) {
    poolsPerDEX[pool.dex] = (poolsPerDEX[pool.dex] || 0) + 1;
  }

  console.log('\n🏛️  Pools per DEX:');
  for (const [dex, count] of Object.entries(poolsPerDEX).sort(([, a], [, b]) => b - a)) {
    console.log(`   ${dex.padEnd(30)}: ${count} pools`);
  }
  console.log();

  // Save to file
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'all-pools-factory.json');
  fs.writeFileSync(filePath, JSON.stringify({
    pools: uniquePools,
    stats: {
      totalPools: uniquePools.length,
      poolsPerDEX: poolsPerDEX,
      discoveryTime: discoveryTime
    }
  }, null, 2));

  console.log(`💾 Saved pools to: ${filePath}`);

  return uniquePools;
}

async function main() {
  try {
    const pools = await discoverAllPools();

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ COMPLETE POOL DISCOVERY FINISHED                      ║');
    console.log('║                   Ready for Opportunity Finder Integration                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('❌ Fatal error during pool discovery:', error);
    process.exit(1);
  }
}

main();