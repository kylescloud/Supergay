import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKENS } from '../src/config/constants';
import { DEX_DISCOVERY_CONFIG } from '../src/config/dexDiscoveryConfig';
import axios from 'axios';

// Flash loan token addresses
const FLASH_LOAN_TOKENS = Object.keys(TOKENS).map(key => 
  (TOKENS as any)[key].toLowerCase()
);

// The Graph subgraph endpoints
const SUBGRAPH_ENDPOINTS = {
  uniswapV3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  sushiswapV3: 'https://api.thegraph.com/subgraphs/name/sushi-v2/sushiswap-v3-base',
  pancakeswapV3: 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-base',
  aerodrome: 'https://api.thegraph.com/subgraphs/name/aerodrome-finance/aerodrome-exchange',
  baseSwap: 'https://api.thegraph.com/subgraphs-name/baseswap/baseswap-exchange',
  curve: 'https://api.thegraph.com/subgraphs/name/curvefi/curve-finance-pools'
};

async function querySubgraph(
  endpoint: string,
  query: string,
  variables: any = {}
): Promise<any[]> {
  try {
    const response = await axios.post(endpoint, {
      query,
      variables
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    if (response.data.errors) {
      console.error(`  ❌ Subgraph error:`, response.data.errors[0].message);
      return [];
    }
    
    return response.data.data?.pools || [];
  } catch (error: any) {
    console.error(`  ❌ Error querying subgraph:`, error.message);
    return [];
  }
}

async function discoverUniswapV3PoolsFromSubgraph(): Promise<any[]> {
  console.log(`\n🔍 Discovering Uniswap V3 pools from subgraph...`);
  
  const query = `
    query GetPools($tokens: [String!]!, $first: Int!) {
      pools(
        where: {
          token0_in: $tokens,
          token1_in: $tokens
        },
        first: $first,
        orderBy: liquidity,
        orderDirection: desc
      ) {
        id
        token0 { symbol, address }
        token1 { symbol, address }
        feeTier
        liquidity
        sqrtPriceX96
        tick
      }
    }
  `;
  
  const pools = await querySubgraph(
    SUBGRAPH_ENDPOINTS.uniswapV3,
    query,
    {
      tokens: FLASH_LOAN_TOKENS.map(t => t.toLowerCase()),
      first: 1000
    }
  );
  
  console.log(`  ✅ Found ${pools.length} pools from subgraph`);
  
  return pools.map((pool: any) => ({
    address: pool.id,
    dex: 'Uniswap V3',
    dexType: 'v3',
    token0: pool.token0.address.toLowerCase(),
    token1: pool.token1.address.toLowerCase(),
    fee: pool.feeTier,
    liquidity: pool.liquidity,
    sqrtPriceX96: pool.sqrtPriceX96,
    tick: pool.tick
  }));
}

async function discoverPoolsFromDexScreener(): Promise<any[]> {
  console.log(`\n🔍 Discovering pools from DEX Screener API...`);
  
  const allPools: any[] = [];
  
  for (const token of FLASH_LOAN_TOKENS.slice(0, 5)) { // Limit to first 5 tokens
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${token}`,
        { timeout: 10000 }
      );
      
      const pairs = response.data.pairs || [];
      
      for (const pair of pairs) {
        const chainId = pair.chainId;
        if (chainId !== 'base') continue;
        
        const dexId = pair.dexId;
        if (dexId !== 'uniswap' && dexId !== 'sushiswap' && 
            dexId !== 'pancakeswap' && dexId !== 'aerodrome' && 
            dexId !== 'baseswap') continue;
        
        // Check if either token is a flash loan token
        const token0 = pair.baseToken.address.toLowerCase();
        const token1 = pair.quoteToken.address.toLowerCase();
        
        if (FLASH_LOAN_TOKENS.includes(token0) || FLASH_LOAN_TOKENS.includes(token1)) {
          const dexName = pair.dexId.charAt(0).toUpperCase() + pair.dexId.slice(1);
          const isV3 = pair.dexVersion === 'v3';
          
          allPools.push({
            address: pair.pairAddress,
            dex: dexName,
            dexType: isV3 ? 'v3' : 'v2',
            token0,
            token1,
            fee: pair.fees?.[0] || (isV3 ? 3000 : 300), // Default fees
            liquidity: pair.liquidity?.usd || '0',
            price: pair.priceUsd
          });
        }
      }
    } catch (error: any) {
      console.error(`  ❌ Error querying DEX Screener for ${token}:`, error.message);
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`  ✅ Found ${allPools.length} pools from DEX Screener`);
  return allPools;
}

async function discoverPoolsFromCoinGecko(): Promise<any[]> {
  console.log(`\n🔍 Discovering pools from CoinGecko DEX data...`);
  
  const allPools: any[] = [];
  
  try {
    // Get top Base DEXs
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/exchanges',
      { timeout: 10000 }
    );
    
    const baseDexs = response.data.filter((ex: any) => 
      ex.identifier.includes('base') || ex.name.toLowerCase().includes('base')
    );
    
    console.log(`  Found ${baseDexs.length} Base DEXs on CoinGecko`);
    
    for (const dex of baseDexs) {
      try {
        const dexResponse = await axios.get(
          `https://api.coingecko.com/api/v3/exchanges/${dex.id}/tickers`,
          { timeout: 10000 }
        );
        
        const tickers = dexResponse.data.tickers || [];
        
        for (const ticker of tickers.slice(0, 50)) { // Limit to top 50 pairs
          const base = ticker.base.toLowerCase();
          const target = ticker.target.toLowerCase();
          
          if (FLASH_LOAN_TOKENS.includes(base) || FLASH_LOAN_TOKENS.includes(target)) {
            allPools.push({
              address: ticker.market.identifier || `${dex.id}-${base}-${target}`, // Use as identifier
              dex: dex.name,
              dexType: dex.name.toLowerCase().includes('v3') ? 'v3' : 'v2',
              token0: base,
              token1: target,
              fee: 3000, // Default
              price: ticker.last
            });
          }
        }
      } catch (error: any) {
        console.error(`    ❌ Error querying ${dex.name}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error(`  ❌ Error querying CoinGecko:`, error.message);
  }
  
  console.log(`  ✅ Found ${allPools.length} pools from CoinGecko`);
  return allPools;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('MULTI-SOURCE POOL DISCOVERY');
  console.log('═'.repeat(80));
  
  console.log(`\n📊 Flash Loan Tokens (${FLASH_LOAN_TOKENS.length}):`);
  FLASH_LOAN_TOKENS.forEach(addr => {
    const tokenKey = Object.keys(TOKENS).find(key => 
      (TOKENS as any)[key].toLowerCase() === addr
    );
    console.log(`  - ${tokenKey}: ${addr}`);
  });
  
  // Initialize registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const allPools: any[] = [];
  
  // Method 1: Uniswap V3 Subgraph (most accurate)
  try {
    const uniswapPools = await discoverUniswapV3PoolsFromSubgraph();
    allPools.push(...uniswapPools);
  } catch (error: any) {
    console.error(`❌ Uniswap V3 subgraph failed:`, error.message);
  }
  
  // Method 2: DEX Screener API (comprehensive)
  try {
    const screenerPools = await discoverPoolsFromDexScreener();
    allPools.push(...screenerPools);
  } catch (error: any) {
    console.error(`❌ DEX Screener failed:`, error.message);
  }
  
  // Method 3: CoinGecko DEX data (backup)
  try {
    const coingeckoPools = await discoverPoolsFromCoinGecko();
    allPools.push(...coingeckoPools);
  } catch (error: any) {
    console.error(`❌ CoinGecko failed:`, error.message);
  }
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('DISCOVERY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools Discovered: ${allPools.length}`);
  
  // Remove duplicates
  const uniquePools = Array.from(
    new Map(allPools.map(p => [p.address.toLowerCase(), p])).values()
  );
  console.log(`Unique Pools: ${uniquePools.length}`);
  
  // Group by DEX
  const byDex: Record<string, any[]> = {};
  uniquePools.forEach(pool => {
    if (!byDex[pool.dex]) byDex[pool.dex] = [];
    byDex[pool.dex].push(pool);
  });
  
  console.log('\n📊 Pools by DEX:');
  for (const [dex, pools] of Object.entries(byDex)) {
    console.log(`  ${dex}: ${pools.length}`);
  }
  
  // Add pools to registry
  console.log(`\n💾 Adding ${uniquePools.length} pools to registry...`);
  await registry.addPools(uniquePools);
  
  // Save registry
  await registry.save();
  console.log(`✅ Registry saved to: data/pool-registry.json`);
  
  console.log('\n✅ Multi-source pool discovery completed!');
}

main().catch(console.error);