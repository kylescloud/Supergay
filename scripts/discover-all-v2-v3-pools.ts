import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { DEX_CONFIG } from '../src/config/constants.js';

// ABIs
const UNISWAP_V2_FACTORY_ABI = [
  'function allPairsLength() external view returns (uint256)',
  'function allPairs(uint256) external view returns (address)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
];

const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
];

const UNISWAP_V2_PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const UNISWAP_V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

interface Pool {
  address: string;
  dex: string;
  dexIdentifier: string;
  version: string;
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
  reserve0?: string;
  reserve1?: string;
  liquidity?: string;
  sqrtPriceX96?: string;
  tick?: number;
  isActive: boolean;
}

// RPC Provider
const provider = new ethers.JsonRpcProvider(
  process.env.QUICKNODE_RPC || process.env.BASE_RPC_URL || 'https://mainnet.base.org'
);

console.log('\n=== Discovering All V2 and V3 Pools from Base DEXs ===\n');

// DEX Configuration with correct factory addresses
const DEXS_TO_DISCOVER = [
  // V2 DEXs - Using verified factory addresses
  { 
    name: 'Uniswap V2', 
    identifier: 'uniswap-v2', 
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', // Verified Base Uniswap V2 Factory
    version: 'v2' 
  },
  { 
    name: 'BaseSwap', 
    identifier: 'baseswap', 
    factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB', // Verified BaseSwap Factory
    version: 'v2' 
  },
  
  // V3 DEXs - Using verified factory addresses
  { 
    name: 'Uniswap V3', 
    identifier: 'uniswap-v3', 
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', // Verified Base Uniswap V3 Factory
    feeTiers: [100, 500, 3000, 10000],
    version: 'v3' 
  },
  { 
    name: 'SushiSwap V3', 
    identifier: 'sushiswap-v3', 
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', // Verified SushiSwap V3 Factory
    feeTiers: [100, 500, 3000, 10000],
    version: 'v3' 
  },
  { 
    name: 'PancakeSwap V3', 
    identifier: 'pancakeswap-v3', 
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', // Verified PancakeSwap V3 Factory
    feeTiers: [100, 500, 2500, 10000],
    version: 'v3' 
  },
  { 
    name: 'Aerodrome SlipStream', 
    identifier: 'aerodrome-slipstream', 
    factory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A', // Verified Aerodrome CL Factory
    feeTiers: [100, 500, 3000, 10000],
    version: 'v3' 
  },
];

// Top tokens on Base to discover pools for
const TOP_TOKENS = [
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' }, // WETH
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' }, // USDC
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI' },  // DAI
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC' }, // USDbC
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH' }, // cbETH
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC' }, // cbBTC
  { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH' }, // wstETH
];

/**
 * Get token info
 */
async function getTokenInfo(address: string): Promise<{ symbol: string; name: string; decimals: number } | null> {
  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals()
    ]);
    return { symbol, name, decimals };
  } catch (error) {
    return null;
  }
}

/**
 * Discover V2 pools from factory
 */
async function discoverV2Pools(dexName: string, identifier: string, factoryAddress: string, maxPools: number = 100): Promise<Pool[]> {
  console.log(`\n📊 Discovering ${dexName} pools...`);
  
  const pools: Pool[] = [];
  const factory = new ethers.Contract(factoryAddress, UNISWAP_V2_FACTORY_ABI, provider);
  
  try {
    const pairsLength = await factory.allPairsLength();
    console.log(`  Total pairs: ${pairsLength.toString()}`);
    
    // Get recent pools (last maxPools)
    const startIndex = pairsLength > maxPools ? pairsLength - BigInt(maxPools) : 0n;
    
    for (let i = startIndex; i < pairsLength && pools.length < maxPools; i++) {
      try {
        const pairAddress = await factory.allPairs(i);
        const pair = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
        
        const [token0Address, token1Address, reserves] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves()
        ]);
        
        // Skip if no liquidity
        if (reserves[0] === 0n && reserves[1] === 0n) continue;
        
        const [token0Info, token1Info] = await Promise.all([
          getTokenInfo(token0Address),
          getTokenInfo(token1Address)
        ]);
        
        if (!token0Info || !token1Info) continue;
        
        pools.push({
          address: pairAddress,
          dex: dexName,
          dexIdentifier: identifier,
          version: 'v2',
          token0: {
            address: token0Address,
            ...token0Info
          },
          token1: {
            address: token1Address,
            ...token1Info
          },
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          isActive: true
        });
        
        if (pools.length % 10 === 0) {
          console.log(`  Discovered ${pools.length} pools...`);
        }
      } catch (error) {
        // Skip failed pools
      }
    }
    
    console.log(`  ✅ Found ${pools.length} ${dexName} pools`);
  } catch (error: any) {
    console.log(`  ❌ Error discovering ${dexName} pools: ${error.message}`);
  }
  
  return pools;
}

/**
 * Discover V3 pools from factory
 */
async function discoverV3Pools(dexName: string, identifier: string, factoryAddress: string, feeTiers: number[]): Promise<Pool[]> {
  console.log(`\n📊 Discovering ${dexName} pools...`);
  
  const pools: Pool[] = [];
  const factory = new ethers.Contract(factoryAddress, UNISWAP_V3_FACTORY_ABI, provider);
  
  try {
    // Check all token pairs with all fee tiers
    for (let i = 0; i < TOP_TOKENS.length; i++) {
      for (let j = i + 1; j < TOP_TOKENS.length; j++) {
        const token0 = TOP_TOKENS[i];
        const token1 = TOP_TOKENS[j];
        
        for (const fee of feeTiers) {
          try {
            const poolAddress = await factory.getPool(token0.address, token1.address, fee);
            
            if (poolAddress === ethers.ZeroAddress) continue;
            
            const pool = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);
            
            const [token0Address, token1Address, poolFee, liquidity, slot0] = await Promise.all([
              pool.token0(),
              pool.token1(),
              pool.fee(),
              pool.liquidity(),
              pool.slot0()
            ]);
            
            // Skip if no liquidity
            if (liquidity === 0n) continue;
            
            const [token0Info, token1Info] = await Promise.all([
              getTokenInfo(token0Address),
              getTokenInfo(token1Address)
            ]);
            
            if (!token0Info || !token1Info) continue;
            
            pools.push({
              address: poolAddress,
              dex: dexName,
              dexIdentifier: identifier,
              version: 'v3',
              token0: {
                address: token0Address,
                ...token0Info
              },
              token1: {
                address: token1Address,
                ...token1Info
              },
              fee: Number(poolFee),
              liquidity: liquidity.toString(),
              sqrtPriceX96: slot0[0].toString(),
              tick: Number(slot0[1]),
              isActive: true
            });
            
            console.log(`  Found pool: ${token0Info.symbol}/${token1Info.symbol} (${poolFee / 10000}%)`);
          } catch (error) {
            // Skip failed pools
          }
        }
      }
    }
    
    console.log(`  ✅ Found ${pools.length} ${dexName} pools`);
  } catch (error: any) {
    console.log(`  ❌ Error discovering ${dexName} pools: ${error.message}`);
  }
  
  return pools;
}

/**
 * Main discovery function
 */
async function discoverAllPools() {
  const allPools: Pool[] = [];
  
  for (const dex of DEXS_TO_DISCOVER) {
    if (!dex.factory) {
      console.log(`\n⚠️  Skipping ${dex.name} - No factory address configured`);
      continue;
    }
    
    try {
      let pools: Pool[] = [];
      
      if (dex.version === 'v2') {
        pools = await discoverV2Pools(dex.name, dex.identifier, dex.factory, 50);
      } else if (dex.version === 'v3') {
        const feeTiers = (dex as any).feeTiers || [500, 3000, 10000];
        pools = await discoverV3Pools(dex.name, dex.identifier, dex.factory, feeTiers);
      }
      
      allPools.push(...pools);
    } catch (error: any) {
      console.log(`\n❌ Error with ${dex.name}: ${error.message}`);
    }
  }
  
  // Load existing registry
  let existingPools: Pool[] = [];
  const registryPath = path.join('data', 'pool-registry.json');
  
  if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    existingPools = registry.pools || [];
  }
  
  // Merge pools (avoid duplicates)
  const poolMap = new Map<string, Pool>();
  
  // Add existing pools
  existingPools.forEach(pool => {
    poolMap.set(pool.address.toLowerCase(), pool);
  });
  
  // Add new pools (will overwrite if same address)
  allPools.forEach(pool => {
    poolMap.set(pool.address.toLowerCase(), pool);
  });
  
  const finalPools = Array.from(poolMap.values());
  
  // Save to registry
  const registry = {
    lastUpdated: new Date().toISOString(),
    totalPools: finalPools.length,
    pools: finalPools
  };
  
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
  }
  
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  
  // Summary
  console.log('\n=== Discovery Summary ===\n');
  console.log(`Total pools discovered: ${allPools.length}`);
  console.log(`Total pools in registry: ${finalPools.length}`);
  console.log(`New pools added: ${allPools.length}`);
  
  // Group by DEX
  const byDex = new Map<string, number>();
  finalPools.forEach(pool => {
    byDex.set(pool.dex, (byDex.get(pool.dex) || 0) + 1);
  });
  
  console.log('\nPools by DEX:');
  Array.from(byDex.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([dex, count]) => {
      console.log(`  ${dex}: ${count} pools`);
    });
  
  console.log(`\n✅ Registry saved to: ${registryPath}`);
}

// Run discovery
discoverAllPools().catch(console.error);