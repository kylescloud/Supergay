import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// ABIs
const UNISWAP_V2_FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
];

const UNISWAP_V3_FACTORY_ABI = [
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

console.log('\n=== Discovering V2 and V3 Pools Using Event Logs ===\n');

// DEX Configuration with verified addresses
const DEXS_TO_DISCOVER = [
  // V2 DEXs
  { 
    name: 'Uniswap V2', 
    identifier: 'uniswap-v2', 
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    version: 'v2',
    startBlock: 1371680 // Base mainnet launch
  },
  { 
    name: 'BaseSwap', 
    identifier: 'baseswap', 
    factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
    version: 'v2',
    startBlock: 1371680
  },
  
  // V3 DEXs
  { 
    name: 'Uniswap V3', 
    identifier: 'uniswap-v3', 
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    version: 'v3',
    startBlock: 1371680
  },
  { 
    name: 'SushiSwap V3', 
    identifier: 'sushiswap-v3', 
    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    version: 'v3',
    startBlock: 1371680
  },
  { 
    name: 'PancakeSwap V3', 
    identifier: 'pancakeswap-v3', 
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    version: 'v3',
    startBlock: 1371680
  },
];

/**
 * Get token info with caching
 */
const tokenCache = new Map<string, any>();

async function getTokenInfo(address: string): Promise<{ symbol: string; name: string; decimals: number } | null> {
  const key = address.toLowerCase();
  
  if (tokenCache.has(key)) {
    return tokenCache.get(key);
  }
  
  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals()
    ]);
    const info = { symbol, name, decimals };
    tokenCache.set(key, info);
    return info;
  } catch (error) {
    tokenCache.set(key, null);
    return null;
  }
}

/**
 * Discover V2 pools from events
 */
async function discoverV2PoolsFromEvents(dexName: string, identifier: string, factoryAddress: string, startBlock: number): Promise<Pool[]> {
  console.log(`\n📊 Discovering ${dexName} pools from events...`);
  
  const pools: Pool[] = [];
  const factory = new ethers.Contract(factoryAddress, UNISWAP_V2_FACTORY_ABI, provider);
  
  try {
    const currentBlock = await provider.getBlockNumber();
    const blocksToScan = 10000; // Scan last 10k blocks (~8 hours on Base)
    const fromBlock = Math.max(startBlock, currentBlock - blocksToScan);
    
    console.log(`  Scanning blocks ${fromBlock} to ${currentBlock}...`);
    
    const filter = factory.filters.PairCreated();
    const events = await factory.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`  Found ${events.length} PairCreated events`);
    
    for (const event of events.slice(-100)) { // Get last 100 pools
      try {
        const pairAddress = event.args![2];
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
    console.log(`  ❌ Error: ${error.message}`);
  }
  
  return pools;
}

/**
 * Discover V3 pools from events
 */
async function discoverV3PoolsFromEvents(dexName: string, identifier: string, factoryAddress: string, startBlock: number): Promise<Pool[]> {
  console.log(`\n📊 Discovering ${dexName} pools from events...`);
  
  const pools: Pool[] = [];
  const factory = new ethers.Contract(factoryAddress, UNISWAP_V3_FACTORY_ABI, provider);
  
  try {
    const currentBlock = await provider.getBlockNumber();
    const blocksToScan = 10000;
    const fromBlock = Math.max(startBlock, currentBlock - blocksToScan);
    
    console.log(`  Scanning blocks ${fromBlock} to ${currentBlock}...`);
    
    const filter = factory.filters.PoolCreated();
    const events = await factory.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`  Found ${events.length} PoolCreated events`);
    
    for (const event of events.slice(-100)) { // Get last 100 pools
      try {
        const poolAddress = event.args![4];
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
        
        if (pools.length % 10 === 0) {
          console.log(`  Discovered ${pools.length} pools...`);
        }
      } catch (error) {
        // Skip failed pools
      }
    }
    
    console.log(`  ✅ Found ${pools.length} ${dexName} pools`);
  } catch (error: any) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  
  return pools;
}

/**
 * Main discovery function
 */
async function discoverAllPools() {
  const allPools: Pool[] = [];
  
  for (const dex of DEXS_TO_DISCOVER) {
    try {
      let pools: Pool[] = [];
      
      if (dex.version === 'v2') {
        pools = await discoverV2PoolsFromEvents(dex.name, dex.identifier, dex.factory, dex.startBlock);
      } else if (dex.version === 'v3') {
        pools = await discoverV3PoolsFromEvents(dex.name, dex.identifier, dex.factory, dex.startBlock);
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
  let newPoolsAdded = 0;
  allPools.forEach(pool => {
    const key = pool.address.toLowerCase();
    if (!poolMap.has(key)) {
      newPoolsAdded++;
    }
    poolMap.set(key, pool);
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
  console.log(`New pools added: ${newPoolsAdded}`);
  console.log(`Total pools in registry: ${finalPools.length}`);
  
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
  
  // Group by version
  const byVersion = new Map<string, number>();
  finalPools.forEach(pool => {
    byVersion.set(pool.version, (byVersion.get(pool.version) || 0) + 1);
  });
  
  console.log('\nPools by Version:');
  Array.from(byVersion.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([version, count]) => {
      console.log(`  ${version}: ${count} pools`);
    });
  
  console.log(`\n✅ Registry saved to: ${registryPath}`);
}

// Run discovery
discoverAllPools().catch(console.error);