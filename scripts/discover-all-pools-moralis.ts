import { moralisClient, MoralisPair } from '../src/utils/moralisClient';
import { TOKENS, TOKEN_METADATA, DEX_CONFIG } from '../src/config/constants';
import { Token } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

interface DiscoveredPool {
  address: string;
  dex: string;
  dexType: string;
  dexVersion: string;
  token0: Token;
  token1: Token;
  feeTier?: number;
  liquidityUSD: number;
  volume24hUSD: number;
  priceUSD: string;
  pairLabel: string;
  isActive: boolean;
  timestamp: number;
}

interface DiscoveryStats {
  totalPairsFound: number;
  pairsPerToken: Record<string, number>;
  pairsPerDEX: Record<string, number>;
  totalLiquidityUSD: number;
  discoveryTime: number;
}

// Map DEX names from Moralis to our internal DEX names
const DEX_MAPPING: Record<string, string> = {
  'uniswap v4': 'uniswap-v4',
  'uniswap v3': 'uniswap-v3',
  'uniswap v2': 'uniswap-v2',
  'uniswap': 'uniswap-v2',
  'sushiswap': 'sushiswap-v3',
  'sushiswap v3': 'sushiswap-v3',
  'pancakeswap': 'pancakeswap-v3',
  'pancakeswap v3': 'pancakeswap-v3',
  'pancakeswap v2': 'pancakeswap-v2',
  'aerodrome': 'aerodrome',
  'aerodrome slipstream': 'aerodrome-slipstream',
  'aerodromeslipstream': 'aerodrome-slipstream',
  'aerodrome slipstream 2': 'aerodrome-slipstream-2',
  'baseswap': 'baseswap',
  'curve': 'curve',
  'alien base': 'unknown',
  'alienbase': 'unknown',
  'unknown': 'unknown'
};

async function discoverPoolsForToken(
  tokenAddress: string,
  tokenSymbol: string
): Promise<MoralisPair[]> {
  console.log(`\n📊 Discovering ALL pairs for ${tokenSymbol} (${tokenAddress})...`);
  
  try {
    // Get ALL pairs with maximum pagination (no limit)
    const pairs = await moralisClient.getAllTokenPairs(tokenAddress, 20); // Max 20 pages
    console.log(`✅ Found ${pairs.length} pairs for ${tokenSymbol}`);
    return pairs;
  } catch (error) {
    console.error(`❌ Error fetching pairs for ${tokenSymbol}:`, error);
    return [];
  }
}

async function discoverAllPools(): Promise<{
  pools: DiscoveredPool[];
  stats: DiscoveryStats;
}> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          COMPLETE MORALIS POOL DISCOVERY - ALL DEXs                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  const allPools: DiscoveredPool[] = [];
  const stats: DiscoveryStats = {
    totalPairsFound: 0,
    pairsPerToken: {},
    pairsPerDEX: {},
    totalLiquidityUSD: 0,
    discoveryTime: 0
  };

  // Discover pairs for all tokens
  for (const [symbol, address] of Object.entries(TOKENS)) {
    const pairs = await discoverPoolsForToken(address, symbol);
    stats.pairsPerToken[symbol] = pairs.length;
    stats.totalPairsFound += pairs.length;

    // Convert Moralis pairs to our format
    for (const pair of pairs) {
      try {
        // Extract token data safely - handle null/undefined tokens
        let token0Address = pair.base_token?.token_address || '';
        let token0Symbol = pair.base_token?.token_symbol || '';
        let token0Name = pair.base_token?.token_name || '';
        let token0Decimals = pair.base_token?.token_decimals || 18;

        let token1Address = pair.quote_token?.token_address || '';
        let token1Symbol = pair.quote_token?.token_symbol || '';
        let token1Name = pair.quote_token?.token_name || '';
        let token1Decimals = pair.quote_token?.token_decimals || 18;

        // If token addresses are missing but we have the pair, skip
        // We'll need to use blockchain queries to get token info
        if (!token0Address || !token1Address) {
          console.warn(`⚠️  Skipping pool with missing token addresses: ${pair.pair_address}`);
          continue;
        }

        // Get or create token metadata
        const metadata0 = TOKEN_METADATA[token0Symbol] || {
          decimals: token0Decimals,
          symbol: token0Symbol,
          name: token0Name
        };

        const metadata1 = TOKEN_METADATA[token1Symbol] || {
          decimals: token1Decimals,
          symbol: token1Symbol,
          name: token1Name
        };

        const token0: Token = {
          address: token0Address,
          symbol: metadata0.symbol,
          decimals: metadata0.decimals,
          name: metadata0.name
        };

        const token1: Token = {
          address: token1Address,
          symbol: metadata1.symbol,
          decimals: metadata1.decimals,
          name: metadata1.name
        };

        // Map DEX name to internal type
        const dexName = pair.exchange_name || 'unknown';
        const dexType = moralisClient.getDEXType(dexName);
        const mappedDEX = DEX_MAPPING[dexName.toLowerCase()] || DEX_MAPPING[dexType] || 'unknown';

        const feeTier = moralisClient.extractFeeTier(pair.pair_label);

        const pool: DiscoveredPool = {
          address: pair.pair_address,
          dex: mappedDEX,
          dexType: mappedDEX,
          dexVersion: mappedDEX.includes('v4') ? 'v4' : (mappedDEX.includes('v3') ? 'v3' : 'v2'),
          token0: token0,
          token1: token1,
          feeTier: feeTier || undefined,
          liquidityUSD: parseFloat(pair.liquidity_usd || '0'),
          volume24hUSD: parseFloat(pair.volume_24h_usd || '0'),
          priceUSD: pair.usd_price || '0',
          pairLabel: pair.pair_label,
          isActive: !pair.inactive_pair,
          timestamp: Date.now()
        };

        allPools.push(pool);
        
        // Update stats
        stats.totalLiquidityUSD += pool.liquidityUSD;
        stats.pairsPerDEX[mappedDEX] = (stats.pairsPerDEX[mappedDEX] || 0) + 1;

      } catch (error) {
        console.error(`❌ Error processing pair ${pair.pair_address}:`, error);
      }
    }

    // Rate limiting - wait between token requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  stats.discoveryTime = Date.now() - startTime;

  return { pools: allPools, stats };
}

function removeDuplicates(pools: DiscoveredPool[]): DiscoveredPool[] {
  const seen = new Set<string>();
  const uniquePools: DiscoveredPool[] = [];

  for (const pool of pools) {
    // Create a unique key based on pool address
    const key = pool.address.toLowerCase();
    
    if (!seen.has(key)) {
      seen.add(key);
      uniquePools.push(pool);
    }
  }

  console.log(`✅ Removed duplicates: ${pools.length} → ${uniquePools.length} unique pools`);
  
  return uniquePools;
}

function savePoolsToFile(
  pools: DiscoveredPool[],
  stats: DiscoveryStats
): void {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Save JSON
  const jsonPath = path.join(dataDir, 'all-pools-moralis.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ pools, stats }, null, 2));
  console.log(`\n💾 Saved pools to: ${jsonPath}`);

  // Save CSV
  const csvPath = path.join(dataDir, 'all-pools-moralis.csv');
  const csvHeader = [
    'Address',
    'DEX',
    'DEX Type',
    'Version',
    'Token0 Symbol',
    'Token0 Address',
    'Token0 Decimals',
    'Token1 Symbol',
    'Token1 Address',
    'Token1 Decimals',
    'Fee Tier',
    'Liquidity USD',
    'Volume 24h USD',
    'Price USD',
    'Is Active'
  ];

  const csvRows = pools.map(pool => [
    pool.address,
    pool.dex,
    pool.dexType,
    pool.dexVersion,
    pool.token0.symbol,
    pool.token0.address,
    pool.token0.decimals,
    pool.token1.symbol,
    pool.token1.address,
    pool.token1.decimals,
    pool.feeTier || 'N/A',
    pool.liquidityUSD,
    pool.volume24hUSD,
    pool.priceUSD,
    pool.isActive
  ]);

  const csvContent = [
    csvHeader.join(','),
    ...csvRows.map(row => row.join(','))
  ].join('\n');

  fs.writeFileSync(csvPath, csvContent);
  console.log(`💾 Saved CSV to: ${csvPath}`);

  // Save pool registry format
  const registryPath = path.join(dataDir, 'pool-registry-moralis.json');
  const registryData = pools.map(pool => ({
    address: pool.address,
    token0: pool.token0,
    token1: pool.token1,
    dex: pool.dex,
    version: pool.dexVersion,
    fee: pool.feeTier || (pool.dexVersion === 'v2' ? 3000 : 3000),
    isActive: pool.isActive
  }));
  fs.writeFileSync(registryPath, JSON.stringify(registryData, null, 2));
  console.log(`💾 Saved pool registry format to: ${registryPath}`);
}

function printStats(stats: DiscoveryStats, totalPools: number): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          DISCOVERY STATISTICS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Total Pairs Found:      ${stats.totalPairsFound}`);
  console.log(`✅ Total Unique Pools:     ${totalPools}`);
  console.log(`💰 Total Liquidity:       $${stats.totalLiquidityUSD.toLocaleString()}`);
  console.log(`⏱️  Discovery Time:        ${(stats.discoveryTime / 1000).toFixed(2)}s`);

  console.log('\n📈 Pairs per Token:');
  for (const [token, count] of Object.entries(stats.pairsPerToken)) {
    console.log(`   ${token.padEnd(8)}: ${count} pairs`);
  }

  console.log('\n🏛️  Pairs per DEX:');
  const sortedDEXs = Object.entries(stats.pairsPerDEX)
    .sort(([, a], [, b]) => b - a);
  
  for (const [dex, count] of sortedDEXs) {
    console.log(`   ${dex.padEnd(30)}: ${count} pools`);
  }
  console.log();
}

async function main() {
  try {
    // Discover all pools
    const { pools, stats } = await discoverAllPools();

    // Remove duplicates
    const uniquePools = removeDuplicates(pools);

    // Save to files
    savePoolsToFile(uniquePools, stats);

    // Print statistics
    printStats(stats, uniquePools.length);

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