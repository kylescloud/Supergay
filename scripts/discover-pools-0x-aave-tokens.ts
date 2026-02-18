import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// RPC Provider
const provider = new ethers.JsonRpcProvider(
  process.env.QUICKNODE_RPC || process.env.BASE_RPC_URL || 'https://mainnet.base.org'
);

console.log('\n=== Discovering Pools via 0x API (Aave V3 Borrowable Tokens) ===\n');

// Aave V3 Flash Loan Borrowable Tokens on Base
const AAVE_V3_BORROWABLE_TOKENS = [
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether' },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH' },
  { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0' },
  { address: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A', symbol: 'weETH', name: 'Wrapped eETH' },
  { address: '0x2416092f143378750bb29b79eD961ab195CcEea5', symbol: 'ezETH', name: 'Renzo Restaked ETH' },
  { address: '0xEDfa23602D0EC14714057867A78d01e94176BEA0', symbol: 'wrsETH', name: 'Wrapped Kelp DAO Restaked ETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin' },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', name: 'USD Base Coin' },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin' },
  { address: '0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1', symbol: 'GHO', name: 'Gho Token' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', name: 'Coinbase Wrapped BTC' },
  { address: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', symbol: 'tBTC', name: 'tBTC v2' },
  { address: '0x5d3a4F62124498092Ce665f865E0b38fF6F5c3b9', symbol: 'LBTC', name: 'Lombard Staked BTC' },
  { address: '0xA88594D404727625A9437C3f886C7643872296AE', symbol: 'WELL', name: 'WELL' },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome Finance' },
  { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', symbol: 'EURC', name: 'Euro Coin' },
];

// Additional high-volume tokens to pair with
const ADDITIONAL_TOKENS = [
  { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', name: 'Brett' },
  { address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', symbol: 'HIGHER', name: 'Higher' },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', name: 'Degen' },
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

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

const UNISWAP_V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const UNISWAP_V3_POOL_ABI = [
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)'
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
  
  // Check if it's in our known tokens first
  const knownToken = [...AAVE_V3_BORROWABLE_TOKENS, ...ADDITIONAL_TOKENS].find(
    t => t.address.toLowerCase() === key
  );
  
  if (knownToken) {
    const info = { symbol: knownToken.symbol, name: knownToken.name, decimals: 18 };
    tokenCache.set(key, info);
    return info;
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
 * Fetch swap sources from 0x API for a token pair
 */
async function fetchSwapSources(sellToken: string, buyToken: string): Promise<any[]> {
  try {
    const url = `https://base.api.0x.org/swap/v1/sources?sellToken=${sellToken}&buyToken=${buyToken}`;
    
    const response = await axios.get(url, {
      headers: {
        '0x-api-key': process.env.ZEROX_API_KEY || ''
      },
      timeout: 10000
    });
    
    return response.data.sources || [];
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log('  ⚠️  Rate limited, waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchSwapSources(sellToken, buyToken);
    }
    return [];
  }
}

/**
 * Fetch price quote from 0x API to get pool addresses
 */
async function fetchPriceQuote(sellToken: string, buyToken: string, sellAmount: string): Promise<any> {
  try {
    const url = `https://base.api.0x.org/swap/v1/price?sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmount}`;
    
    const response = await axios.get(url, {
      headers: {
        '0x-api-key': process.env.ZEROX_API_KEY || ''
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log('  ⚠️  Rate limited, waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchPriceQuote(sellToken, buyToken, sellAmount);
    }
    return null;
  }
}

/**
 * Get pool state (V2 or V3)
 */
async function getPoolState(poolAddress: string, version: string): Promise<any> {
  try {
    if (version === 'v2') {
      const pair = new ethers.Contract(poolAddress, UNISWAP_V2_PAIR_ABI, provider);
      const [reserves, token0, token1] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
        pair.token1()
      ]);
      
      return {
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        token0,
        token1
      };
    } else if (version === 'v3') {
      const pool = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);
      const [liquidity, slot0, token0, token1, fee] = await Promise.all([
        pool.liquidity(),
        pool.slot0(),
        pool.token0(),
        pool.token1(),
        pool.fee()
      ]);
      
      return {
        liquidity: liquidity.toString(),
        sqrtPriceX96: slot0[0].toString(),
        tick: Number(slot0[1]),
        token0,
        token1,
        fee: Number(fee)
      };
    }
  } catch (error) {
    return null;
  }
}

/**
 * Map DEX name to identifier and version
 */
function mapDexInfo(dexName: string): { identifier: string; version: string } {
  const dexMap: Record<string, { identifier: string; version: string }> = {
    'Uniswap': { identifier: 'uniswap-v2', version: 'v2' },
    'Uniswap_V2': { identifier: 'uniswap-v2', version: 'v2' },
    'Uniswap_V3': { identifier: 'uniswap-v3', version: 'v3' },
    'SushiSwap': { identifier: 'sushiswap-v3', version: 'v3' },
    'PancakeSwap': { identifier: 'pancakeswap-v3', version: 'v3' },
    'PancakeSwap_V3': { identifier: 'pancakeswap-v3', version: 'v3' },
    'Aerodrome': { identifier: 'aerodrome', version: 'v2' },
    'BaseSwap': { identifier: 'baseswap', version: 'v2' },
    'Curve': { identifier: 'curve', version: 'curve' },
    'Curve_V2': { identifier: 'curve', version: 'curve' },
  };
  
  return dexMap[dexName] || { identifier: dexName.toLowerCase(), version: 'v2' };
}

/**
 * Discover pools for a specific token pair
 */
async function discoverPoolsForPair(token0: any, token1: any): Promise<Pool[]> {
  const pools: Pool[] = [];
  
  try {
    // Fetch price quote to get routing information
    const sellAmount = ethers.parseUnits('1', token0.decimals || 18).toString();
    const quote = await fetchPriceQuote(token0.address, token1.address, sellAmount);
    
    if (!quote || !quote.sources) {
      return pools;
    }
    
    // Extract pool addresses from sources
    for (const source of quote.sources) {
      if (!source.proportion || source.proportion === '0') continue;
      
      const dexInfo = mapDexInfo(source.name);
      
      // Try to extract pool address from the source
      // 0x API doesn't directly provide pool addresses, so we need to query the blockchain
      // For now, we'll use the sources information to know which DEXs have liquidity
      
      console.log(`  Found liquidity on ${source.name}: ${(parseFloat(source.proportion) * 100).toFixed(2)}%`);
    }
    
  } catch (error: any) {
    // Skip failed pairs
  }
  
  return pools;
}

/**
 * Discover all pools via 0x API
 */
async function discoverAllPools() {
  console.log('Discovering pools for Aave V3 borrowable tokens...\n');
  
  const allPools: Pool[] = [];
  const poolAddresses = new Set<string>();
  
  // Combine all tokens
  const allTokens = [...AAVE_V3_BORROWABLE_TOKENS, ...ADDITIONAL_TOKENS];
  
  let pairsChecked = 0;
  const totalPairs = AAVE_V3_BORROWABLE_TOKENS.length * allTokens.length;
  
  // Check all pairs with Aave tokens
  for (const aaveToken of AAVE_V3_BORROWABLE_TOKENS) {
    console.log(`\n📊 Checking pairs for ${aaveToken.symbol}...`);
    
    for (const otherToken of allTokens) {
      if (aaveToken.address.toLowerCase() === otherToken.address.toLowerCase()) continue;
      
      pairsChecked++;
      console.log(`  [${pairsChecked}/${totalPairs}] ${aaveToken.symbol}/${otherToken.symbol}`);
      
      const pools = await discoverPoolsForPair(aaveToken, otherToken);
      
      for (const pool of pools) {
        if (!poolAddresses.has(pool.address.toLowerCase())) {
          poolAddresses.add(pool.address.toLowerCase());
          allPools.push(pool);
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Load existing registry
  let existingPools: Pool[] = [];
  const registryPath = path.join('data', 'pool-registry.json');
  
  if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    existingPools = registry.pools || [];
  }
  
  // Merge pools
  const poolMap = new Map<string, Pool>();
  
  existingPools.forEach(pool => {
    poolMap.set(pool.address.toLowerCase(), pool);
  });
  
  let newPoolsAdded = 0;
  allPools.forEach(pool => {
    const key = pool.address.toLowerCase();
    if (!poolMap.has(key)) {
      newPoolsAdded++;
    }
    poolMap.set(key, pool);
  });
  
  const finalPools = Array.from(poolMap.values());
  
  // Save registry
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
  console.log(`Pairs checked: ${pairsChecked}`);
  console.log(`Pools discovered: ${allPools.length}`);
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
    const version = pool.version || 'unknown';
    byVersion.set(version, (byVersion.get(version) || 0) + 1);
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