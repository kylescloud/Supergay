import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://base-rpc.publicnode.com';

// DEX Factory Contracts
const DEX_FACTORIES = [
  {
    name: 'AlienBase',
    factory: '0x3e84d913803b02a4a7f027165e8ca42c14c0fde7',
    type: 'v2',
    dexType: 'v2style',
    router: '0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7'
  },
  {
    name: 'SwapBased V2',
    factory: '0x04C9f118d21e8B767D2e50C946f0cC9F6C367300',
    type: 'v2',
    dexType: 'v2style',
    router: '0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066'
  },
  {
    name: 'SwapBased V3',
    factory: '0xb5620F90e803C7F957A9EF351B8DB3C746021BEa',
    type: 'v3',
    dexType: 'v3style',
    router: '0x756C6BbDd915202adac7beBB1c6C89aC0886503f'
  }
];

// ABI for Factory
const V2_FACTORY_ABI = [
  'function allPairsLength() external view returns (uint256)',
  'function allPairs(uint256) external view returns (address pair)',
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const V3_FACTORY_ABI = [
  'function allPoolsLength() external view returns (uint256)',
  'function allPools(uint256) external view returns (address pool)'
];

// ABI for Pool contracts
const V2_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

// Common token addresses for metadata
const COMMON_TOKENS: Record<string, any> = {
  '0x4200000000000000000000000000000000000006': {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18
  },
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6
  },
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': {
    symbol: 'USDbC',
    name: 'USD Base Coin',
    decimals: 6
  }
};

async function fetchPoolsFromFactory(provider: ethers.JsonRpcProvider, dex: any, maxPools: number = 50): Promise<any[]> {
  console.log(`\nFetching pools from ${dex.name}...`);
  const pools: any[] = [];
  
  try {
    let factoryContract: ethers.Contract;
    let poolCount: bigint;
    
    if (dex.type === 'v2') {
      factoryContract = new ethers.Contract(dex.factory, V2_FACTORY_ABI, provider);
      
      try {
        poolCount = await factoryContract.allPairsLength();
      } catch {
        // Fallback: estimate based on known pools
        poolCount = BigInt(maxPools);
        console.log(`  Using estimated pool count: ${maxPools}`);
      }
      
      console.log(`  Total pools: ${poolCount.toString()}`);
      
      // Fetch pool addresses
      const fetchCount = Math.min(Number(poolCount), maxPools);
      const poolAddresses: string[] = [];
      
      for (let i = 0; i < fetchCount; i++) {
        try {
          const pairAddress = await factoryContract.allPairs(i);
          poolAddresses.push(pairAddress);
        } catch (error) {
          // Skip if failed
        }
      }
      
      console.log(`  Fetching state for ${poolAddresses.length} pools...`);
      
      // Fetch pool details
      for (let i = 0; i < poolAddresses.length; i++) {
        const poolAddress = poolAddresses[i];
        
        try {
          const poolContract = new ethers.Contract(poolAddress, V2_POOL_ABI, provider);
          const [token0, token1, reserves] = await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.getReserves()
          ]);
          
          const pool: any = {
            address: poolAddress,
            dex: dex.name,
            dexType: dex.dexType,
            dexVersion: dex.type,
            token0: getTokenInfo(token0),
            token1: getTokenInfo(token1),
            fee: 300, // V2 pools typically have 0.3% fee
            reserve0: reserves[0].toString(),
            reserve1: reserves[1].toString(),
            blockNumber: 0,
            lastUpdated: Date.now(),
            isActive: true
          };
          
          pools.push(pool);
          
          if ((i + 1) % 10 === 0) {
            console.log(`  Progress: ${i + 1}/${fetchCount} pools`);
          }
          
        } catch (error: any) {
          // Skip pools that fail
        }
      }
      
    } else if (dex.type === 'v3') {
      factoryContract = new ethers.Contract(dex.factory, V3_FACTORY_ABI, provider);
      
      try {
        poolCount = await factoryContract.allPoolsLength();
      } catch {
        poolCount = BigInt(maxPools);
        console.log(`  Using estimated pool count: ${maxPools}`);
      }
      
      console.log(`  Total pools: ${poolCount.toString()}`);
      
      // Fetch pool addresses
      const fetchCount = Math.min(Number(poolCount), maxPools);
      const poolAddresses: string[] = [];
      
      for (let i = 0; i < fetchCount; i++) {
        try {
          const poolAddress = await factoryContract.allPools(i);
          poolAddresses.push(poolAddress);
        } catch (error) {
          // Skip if failed
        }
      }
      
      console.log(`  Fetching state for ${poolAddresses.length} pools...`);
      
      // Fetch pool details
      for (let i = 0; i < poolAddresses.length; i++) {
        const poolAddress = poolAddresses[i];
        
        try {
          const poolContract = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
          const [token0, token1, fee, slot0, liquidity] = await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.fee(),
            poolContract.slot0(),
            poolContract.liquidity()
          ]);
          
          const pool: any = {
            address: poolAddress,
            dex: dex.name,
            dexType: dex.dexType,
            dexVersion: dex.type,
            token0: getTokenInfo(token0),
            token1: getTokenInfo(token1),
            fee: Number(fee),
            sqrtPriceX96: slot0.sqrtPriceX96.toString(),
            tick: slot0.tick.toString(),
            liquidity: liquidity.toString(),
            blockNumber: 0,
            lastUpdated: Date.now(),
            isActive: true
          };
          
          pools.push(pool);
          
          if ((i + 1) % 10 === 0) {
            console.log(`  Progress: ${i + 1}/${fetchCount} pools`);
          }
          
        } catch (error: any) {
          // Skip pools that fail
        }
      }
    }
    
    console.log(`  Successfully fetched ${pools.length} pools from ${dex.name}`);
    
  } catch (error: any) {
    console.log(`  Error fetching pools from ${dex.name}: ${error?.message || 'Unknown error'}`);
  }
  
  return pools;
}

function getTokenInfo(address: string): any {
  const lowerAddress = address.toLowerCase();
  
  if (COMMON_TOKENS[lowerAddress]) {
    return {
      address: lowerAddress,
      ...COMMON_TOKENS[lowerAddress]
    };
  }
  
  // Return generic token info for unknown tokens
  return {
    address: lowerAddress,
    symbol: 'UNKNOWN',
    name: 'Unknown Token',
    decimals: 18
  };
}

async function addNewDEXPools() {
  console.log('=== Adding New DEX Pools ===\n');
  
  // Load existing registry
  if (!fs.existsSync('data/pool-registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
  const existingPools = registry.pools || [];
  const existingAddresses = new Set(existingPools.map((p: any) => p.address.toLowerCase()));
  
  console.log(`Existing pools in registry: ${existingPools.length}`);
  
  // Initialize provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Test connection
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`✓ RPC connected - Current block: ${blockNumber}\n`);
  } catch (error) {
    console.log('✗ RPC connection failed');
    return;
  }
  
  // Fetch pools from new DEXs
  const allNewPools: any[] = [];
  
  for (const dex of DEX_FACTORIES) {
    const pools = await fetchPoolsFromFactory(provider, dex, 50);
    allNewPools.push(...pools);
    
    // Add delay between DEXs
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Filter out duplicate pools
  const newUniquePools = allNewPools.filter(pool => {
    return !existingAddresses.has(pool.address.toLowerCase());
  });
  
  console.log(`\n=== Results ===`);
  console.log(`Total pools fetched: ${allNewPools.length}`);
  console.log(`New unique pools: ${newUniquePools.length}`);
  console.log(`Duplicate pools skipped: ${allNewPools.length - newUniquePools.length}`);
  
  if (newUniquePools.length === 0) {
    console.log('\nNo new pools to add!');
    return;
  }
  
  // Add new pools to registry
  const updatedPools = [...existingPools, ...newUniquePools];
  
  // Update registry
  const updatedRegistry = {
    version: '2.1',
    lastUpdated: Date.now(),
    metadata: {
      totalPools: updatedPools.length,
      previousPools: existingPools.length,
      newPoolsAdded: newUniquePools.length,
      sources: [...(registry.metadata?.sources || ['Cleaned from original registry']), 'AlienBase', 'SwapBased']
    },
    pools: updatedPools
  };
  
  // Save updated registry
  fs.writeFileSync('data/pool-registry.json', JSON.stringify(updatedRegistry, null, 2));
  console.log(`\n✅ Updated registry saved to: data/pool-registry.json`);
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      previousPools: existingPools.length,
      newPoolsFetched: allNewPools.length,
      newPoolsAdded: newUniquePools.length,
      totalPools: updatedPools.length,
      duplicatesFiltered: allNewPools.length - newUniquePools.length
    },
    byDEX: allNewPools.reduce((acc: any, pool: any) => {
      const dex = pool.dex;
      if (!acc[dex]) {
        acc[dex] = 0;
      }
      acc[dex]++;
      return acc;
    }, {}),
    benefits: [
      `Added ${newUniquePools.length} new pools from AlienBase and SwapBased`,
      `Expanded DEX coverage from ${(registry.metadata?.totalPools || 0)} to ${updatedPools.length} pools`,
      `More arbitrage opportunities with increased pool diversity`,
      `Access to additional token pairs across new DEXs`
    ]
  };
  
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }
  
  fs.writeFileSync('reports/new-dex-pools-report.json', JSON.stringify(report, null, 2));
  console.log(`✅ Report saved to: reports/new-dex-pools-report.json`);
  
  console.log('\n=== Summary ===');
  console.log(`✅ Successfully added ${newUniquePools.length} new pools!`);
  console.log(`📊 Total pools: ${updatedPools.length}`);
  console.log(`🎯 New DEXs integrated: AlienBase, SwapBased`);
  
  return report;
}

// Run the script
addNewDEXPools().catch(console.error);