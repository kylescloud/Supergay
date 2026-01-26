import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

interface BasePool {
  address: string;
  dex: string;
  dexVersion: string;
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
  fee?: number; // For V3 pools
  liquidity?: string;
  reserve0?: string;
  reserve1?: string;
  sqrtPriceX96?: string;
  tick?: number;
}

interface BaseToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Load Base tokens from file
 */
async function loadBaseTokens(): Promise<BaseToken[]> {
  try {
    const data = await fs.readFile(path.join('data', 'base-tokens.json'), 'utf-8');
    const json = JSON.parse(data);
    return json.tokens || [];
  } catch (error) {
    console.error('Error loading base tokens:', error);
    return [];
  }
}

/**
 * Discover pools from DEX Screener API for all tokens
 */
async function discoverPoolsFromDexScreener(tokens: BaseToken[]): Promise<BasePool[]> {
  console.log('\n🔍 Discovering pools from DEX Screener for all tokens...');
  
  const allPools: BasePool[] = [];
  const poolSet = new Set<string>();
  const batchSize = 50;
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tokens.length / batchSize)}...`);
    
    for (const token of batch) {
      try {
        const response = await axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${token.address}`,
          { timeout: 5000 }
        );
        
        const pairs = response.data.pairs || [];
        
        for (const pair of pairs) {
          if (pair.chainId !== 'base') continue;
          
          const dexId = pair.dexId;
          const dexVersion = pair.dexVersion === 'v3' ? 'v3' : 'v2';
          
          // Map dexId to standard DEX name
          const dexMap: Record<string, string> = {
            'uniswap': 'Uniswap',
            'pancakeswap': 'PancakeSwap',
            'aerodrome': 'Aerodrome',
            'sushiswap': 'SushiSwap',
            'baseswap': 'BaseSwap',
            'baseswap-finance': 'BaseSwap',
            'curve': 'Curve'
          };
          
          const dexName = dexMap[dexId] || dexId.charAt(0).toUpperCase() + dexId.slice(1);
          
          // Create pool ID
          const poolId = `${dexName}-${pair.pairAddress}`;
          if (poolSet.has(poolId)) continue;
          poolSet.add(poolId);
          
          allPools.push({
            address: pair.pairAddress,
            dex: dexName,
            dexVersion,
            token0: {
              address: pair.baseToken.address,
              symbol: pair.baseToken.symbol.toUpperCase(),
              name: pair.baseToken.name || pair.baseToken.symbol,
              decimals: 18 // Default, will be updated from token list
            },
            token1: {
              address: pair.quoteToken.address,
              symbol: pair.quoteToken.symbol.toUpperCase(),
              name: pair.quoteToken.name || pair.quoteToken.symbol,
              decimals: 18
            },
            fee: pair.fees?.[0] || (dexVersion === 'v3' ? 3000 : 300),
            liquidity: pair.liquidity?.usd || '0'
          });
        }
      } catch (error) {
        // Skip token errors
      }
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`  ✅ Discovered ${allPools.length} pools from DEX Screener`);
  return allPools;
}

/**
 * Discover pools from Uniswap V3 subgraph
 */
async function discoverUniswapV3PoolsFromSubgraph(): Promise<BasePool[]> {
  console.log('\n🔍 Discovering Uniswap V3 pools from subgraph...');
  
  const pools: BasePool[] = [];
  
  try {
    const query = `
      query GetPools($first: Int!) {
        pools(
          first: $first,
          orderBy: totalValueLockedUSD,
          orderDirection: desc
        ) {
          id
          token0 { symbol, address, name, decimals }
          token1 { symbol, address, name, decimals }
          feeTier
          liquidity
          totalValueLockedUSD
          sqrtPriceX96
          tick
        }
      }
    `;
    
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
      { query, variables: { first: 1000 } },
      { timeout: 30000 }
    );
    
    const poolData = response.data.data?.pools || [];
    
    for (const pool of poolData) {
      pools.push({
        address: pool.id,
        dex: 'Uniswap',
        dexVersion: 'v3',
        token0: {
          address: pool.token0.address,
          symbol: pool.token0.symbol.toUpperCase(),
          name: pool.token0.name,
          decimals: pool.token0.decimals
        },
        token1: {
          address: pool.token1.address,
          symbol: pool.token1.symbol.toUpperCase(),
          name: pool.token1.name,
          decimals: pool.token1.decimals
        },
        fee: pool.feeTier,
        liquidity: pool.liquidity,
        sqrtPriceX96: pool.sqrtPriceX96,
        tick: pool.tick
      });
    }
    
    console.log(`  ✅ Discovered ${pools.length} Uniswap V3 pools`);
  } catch (error: any) {
    console.error(`  ❌ Error querying Uniswap V3 subgraph: ${error.message}`);
  }
  
  return pools;
}

/**
 * Discover pools from SushiSwap subgraph
 */
async function discoverSushiSwapPoolsFromSubgraph(): Promise<BasePool[]> {
  console.log('\n🔍 Discovering SushiSwap pools from subgraph...');
  
  const pools: BasePool[] = [];
  
  try {
    const query = `
      query GetPools($first: Int!) {
        pools(
          first: $first,
          orderBy: liquidityUSD,
          orderDirection: desc
        ) {
          id
          token0 { symbol, address, name, decimals }
          token1 { symbol, address, name, decimals }
          liquidity
          liquidityUSD
        }
      }
    `;
    
    const response = await axios.post(
      'https://api.thegraph.com/subgraphs/name/sushi-v2/sushiswap-exchange-base',
      { query, variables: { first: 500 } },
      { timeout: 30000 }
    );
    
    const poolData = response.data.data?.pools || [];
    
    for (const pool of poolData) {
      pools.push({
        address: pool.id,
        dex: 'SushiSwap',
        dexVersion: 'v2',
        token0: {
          address: pool.token0.address,
          symbol: pool.token0.symbol.toUpperCase(),
          name: pool.token0.name,
          decimals: pool.token0.decimals
        },
        token1: {
          address: pool.token1.address,
          symbol: pool.token1.symbol.toUpperCase(),
          name: pool.token1.name,
          decimals: pool.token1.decimals
        },
        fee: 300, // SushiSwap V2 standard fee
        liquidity: pool.liquidity
      });
    }
    
    console.log(`  ✅ Discovered ${pools.length} SushiSwap pools`);
  } catch (error: any) {
    console.error(`  ❌ Error querying SushiSwap subgraph: ${error.message}`);
  }
  
  return pools;
}

/**
 * Merge and deduplicate pools
 */
function mergePools(...poolLists: BasePool[][]): BasePool[] {
  console.log('\n🔄 Merging and deduplicating pools...');
  
  const poolMap = new Map<string, BasePool>();
  
  for (const poolList of poolLists) {
    for (const pool of poolList) {
      const existing = poolMap.get(pool.address);
      
      if (!existing) {
        poolMap.set(pool.address, pool);
      } else {
        // Merge data, prefer more complete information
        if (!pool.liquidity && existing.liquidity) pool.liquidity = existing.liquidity;
        if (!pool.sqrtPriceX96 && existing.sqrtPriceX96) pool.sqrtPriceX96 = existing.sqrtPriceX96;
        if (!pool.tick && existing.tick !== undefined) pool.tick = existing.tick;
      }
    }
  }
  
  const merged = Array.from(poolMap.values());
  console.log(`  ✅ Merged to ${merged.length} unique pools`);
  
  return merged;
}

/**
 * Update pool token metadata from token list
 */
function updatePoolTokenMetadata(pools: BasePool[], tokens: BaseToken[]): BasePool[] {
  console.log('\n📝 Updating pool token metadata...');
  
  const tokenMap = new Map(tokens.map(t => [t.address.toLowerCase(), t]));
  
  let updated = 0;
  for (const pool of pools) {
    const token0 = tokenMap.get(pool.token0.address.toLowerCase());
    const token1 = tokenMap.get(pool.token1.address.toLowerCase());
    
    if (token0) {
      pool.token0 = {
        address: token0.address,
        symbol: token0.symbol,
        name: token0.name,
        decimals: token0.decimals
      };
      updated++;
    }
    
    if (token1) {
      pool.token1 = {
        address: token1.address,
        symbol: token1.symbol,
        name: token1.name,
        decimals: token1.decimals
      };
      updated++;
    }
  }
  
  console.log(`  ✅ Updated metadata for ${updated} tokens in pools`);
  return pools;
}

/**
 * Filter pools by liquidity threshold
 */
function filterPoolsByLiquidity(pools: BasePool[], minLiquidity: number = 1000): BasePool[] {
  console.log(`\n🔍 Filtering pools by minimum liquidity: $${minLiquidity}...`);
  
  const filtered = pools.filter(pool => {
    const liquidity = parseFloat(pool.liquidity || '0');
    return liquidity >= minLiquidity;
  });
  
  console.log(`  ✅ Filtered to ${filtered.length}/${pools.length} pools with sufficient liquidity`);
  return filtered;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('COMPREHENSIVE BASE POOL DISCOVERY (ALL 10 DEXs)');
  console.log('═'.repeat(80));
  
  // Load tokens
  console.log('\n📂 Loading Base tokens...');
  const tokens = await loadBaseTokens();
  console.log(`  ✅ Loaded ${tokens.length} tokens`);
  
  // Discover pools from multiple sources
  const dexScreenerPools = await discoverPoolsFromDexScreener(tokens);
  const uniswapV3Pools = await discoverUniswapV3PoolsFromSubgraph();
  const sushiSwapPools = await discoverSushiSwapPoolsFromSubgraph();
  
  // Merge all pools
  const mergedPools = mergePools(
    dexScreenerPools,
    uniswapV3Pools,
    sushiSwapPools
  );
  
  // Update token metadata
  const poolsWithMetadata = updatePoolTokenMetadata(mergedPools, tokens);
  
  // Filter by liquidity
  const filteredPools = filterPoolsByLiquidity(poolsWithMetadata, 1000);
  
  // Group by DEX
  const byDex: Record<string, BasePool[]> = {};
  filteredPools.forEach(pool => {
    if (!byDex[pool.dex]) byDex[pool.dex] = [];
    byDex[pool.dex].push(pool);
  });
  
  // Save to file
  const outputPath = path.join('data', 'base-pools.json');
  const outputData = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    chainId: 8453,
    network: 'base',
    totalPools: filteredPools.length,
    poolsByDex: Object.fromEntries(
      Object.entries(byDex).map(([dex, pools]) => [dex, pools.length])
    ),
    pools: filteredPools
  };
  
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('DISCOVERY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools Discovered: ${filteredPools.length}`);
  console.log(`Saved to: ${outputPath}`);
  
  console.log('\n📊 Pools by DEX:');
  for (const [dex, count] of Object.entries(outputData.poolsByDex)) {
    console.log(`  ${dex}: ${count}`);
  }
  
  console.log('\n✅ Pool discovery completed!');
}

main().catch(console.error);