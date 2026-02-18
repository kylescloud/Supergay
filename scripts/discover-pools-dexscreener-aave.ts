import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// RPC Provider
const provider = new ethers.JsonRpcProvider(
  process.env.QUICKNODE_RPC || process.env.BASE_RPC_URL || 'https://mainnet.base.org'
);

console.log('\n=== Discovering Pools via DexScreener (Aave V3 Borrowable Tokens) ===\n');

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
  liquidityUSD?: number;
  volume24h?: number;
}

/**
 * Map DexScreener DEX ID to our format
 */
function mapDexInfo(dexId: string): { name: string; identifier: string; version: string } {
  const dexMap: Record<string, { name: string; identifier: string; version: string }> = {
    'uniswap': { name: 'Uniswap V2', identifier: 'uniswap-v2', version: 'v2' },
    'uniswapv3': { name: 'Uniswap V3', identifier: 'uniswap-v3', version: 'v3' },
    'sushiswap': { name: 'SushiSwap V3', identifier: 'sushiswap-v3', version: 'v3' },
    'pancakeswap': { name: 'PancakeSwap V3', identifier: 'pancakeswap-v3', version: 'v3' },
    'aerodrome': { name: 'Aerodrome', identifier: 'aerodrome', version: 'v2' },
    'aerodrome-slipstream': { name: 'Aerodrome SlipStream', identifier: 'aerodrome-slipstream', version: 'v3' },
    'baseswap': { name: 'BaseSwap', identifier: 'baseswap', version: 'v2' },
    'curve': { name: 'Curve', identifier: 'curve', version: 'curve' },
    'alienbase': { name: 'AlienBase', identifier: 'alienbase', version: 'v2' },
    'swapbased': { name: 'SwapBased', identifier: 'swapbased', version: 'v2' },
  };
  
  const normalized = dexId.toLowerCase().replace(/\s+/g, '-');
  return dexMap[normalized] || { name: dexId, identifier: normalized, version: 'v2' };
}

/**
 * Fetch pools for a token from DexScreener
 */
async function fetchPoolsForToken(tokenAddress: string, tokenSymbol: string): Promise<Pool[]> {
  const pools: Pool[] = [];
  
  try {
    console.log(`\n📊 Fetching pools for ${tokenSymbol}...`);
    
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const pairs = response.data.pairs || [];
    const basePairs = pairs.filter((p: any) => p.chainId === 'base');
    
    console.log(`  Found ${basePairs.length} pools on Base`);
    
    for (const pair of basePairs) {
      try {
        const dexInfo = mapDexInfo(pair.dexId);
        
        // Determine version from pair data
        let version = dexInfo.version;
        if (pair.labels && pair.labels.includes('v3')) {
          version = 'v3';
        } else if (pair.labels && pair.labels.includes('v2')) {
          version = 'v2';
        }
        
        // Extract fee from pair (if available)
        let fee = undefined;
        if (version === 'v3' && pair.fee) {
          fee = Math.round(parseFloat(pair.fee) * 10000); // Convert to basis points
        }
        
        // Parse liquidity
        const liquidityUSD = parseFloat(pair.liquidity?.usd || '0');
        const volume24h = parseFloat(pair.volume?.h24 || '0');
        
        // Skip pools with very low liquidity
        if (liquidityUSD < 1000) continue;
        
        pools.push({
          address: pair.pairAddress,
          dex: dexInfo.name,
          dexIdentifier: dexInfo.identifier,
          version: version,
          token0: {
            address: pair.baseToken.address,
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name || pair.baseToken.symbol,
            decimals: 18 // Default, will be fetched if needed
          },
          token1: {
            address: pair.quoteToken.address,
            symbol: pair.quoteToken.symbol,
            name: pair.quoteToken.name || pair.quoteToken.symbol,
            decimals: 18 // Default
          },
          fee: fee,
          isActive: true,
          liquidityUSD: liquidityUSD,
          volume24h: volume24h
        });
        
        console.log(`    ✅ ${pair.baseToken.symbol}/${pair.quoteToken.symbol} on ${dexInfo.name} (${version}) - $${liquidityUSD.toLocaleString()} liquidity`);
      } catch (error) {
        // Skip failed pools
      }
    }
    
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log('  ⚠️  Rate limited, waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return fetchPoolsForToken(tokenAddress, tokenSymbol);
    }
    console.log(`  ❌ Error fetching pools: ${error.message}`);
  }
  
  return pools;
}

/**
 * Discover all pools
 */
async function discoverAllPools() {
  const allPools: Pool[] = [];
  const poolAddresses = new Set<string>();
  
  let tokensProcessed = 0;
  const totalTokens = AAVE_V3_BORROWABLE_TOKENS.length;
  
  // Fetch pools for each Aave borrowable token
  for (const token of AAVE_V3_BORROWABLE_TOKENS) {
    tokensProcessed++;
    console.log(`\n[${tokensProcessed}/${totalTokens}] Processing ${token.symbol}...`);
    
    const pools = await fetchPoolsForToken(token.address, token.symbol);
    
    for (const pool of pools) {
      const key = pool.address.toLowerCase();
      if (!poolAddresses.has(key)) {
        poolAddresses.add(key);
        allPools.push(pool);
      }
    }
    
    // Rate limiting - DexScreener allows 300 requests/minute
    await new Promise(resolve => setTimeout(resolve, 250));
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
  console.log(`Tokens processed: ${tokensProcessed}`);
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
  
  // Show V3 pools specifically
  const v3Pools = finalPools.filter(p => p.version === 'v3');
  console.log(`\n✅ V3 Pools: ${v3Pools.length}`);
  
  if (v3Pools.length > 0) {
    console.log('\nTop V3 Pools by Liquidity:');
    v3Pools
      .sort((a, b) => (b.liquidityUSD || 0) - (a.liquidityUSD || 0))
      .slice(0, 10)
      .forEach(pool => {
        console.log(`  ${pool.token0.symbol}/${pool.token1.symbol} on ${pool.dex} - $${(pool.liquidityUSD || 0).toLocaleString()}`);
      });
  }
  
  console.log(`\n✅ Registry saved to: ${registryPath}`);
}

// Run discovery
discoverAllPools().catch(console.error);