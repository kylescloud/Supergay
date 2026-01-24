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

async function discoverPoolsForToken(
  tokenAddress: string,
  tokenSymbol: string
): Promise<MoralisPair[]> {
  console.log(`\n📊 Discovering pairs for ${tokenSymbol} (${tokenAddress})...`);
  
  try {
    const pairs = await moralisClient.getAllTokenPairs(tokenAddress, 5); // Max 5 pages
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
  console.log('║          MORALIS POOL DISCOVERY - BASE BLOCKCHAIN                         ║');
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
        const metadata0 = TOKEN_METADATA[pair.base_token.token_symbol] || {
          decimals: 18,
          symbol: pair.base_token.token_symbol,
          name: pair.base_token.token_name
        };

        const metadata1 = TOKEN_METADATA[pair.quote_token.token_symbol] || {
          decimals: 18,
          symbol: pair.quote_token.token_symbol,
          name: pair.quote_token.token_name
        };

        const token0: Token = {
          address: pair.base_token.token_address,
          symbol: pair.base_token.token_symbol,
          decimals: pair.base_token.token_decimals,
          name: pair.base_token.token_name
        };

        const token1: Token = {
          address: pair.quote_token.token_address,
          symbol: pair.quote_token.token_symbol,
          decimals: pair.quote_token.token_decimals,
          name: pair.quote_token.token_name
        };

        const dexType = moralisClient.getDEXType(pair.exchange_name);
        const feeTier = moralisClient.extractFeeTier(pair.pair_label);

        const pool: DiscoveredPool = {
          address: pair.pair_address,
          dex: pair.exchange_name,
          dexType: dexType,
          dexVersion: dexType.includes('v3') || dexType.includes('v4') ? 'v3' : 'v2',
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
        stats.pairsPerDEX[pair.exchange_name] = (stats.pairsPerDEX[pair.exchange_name] || 0) + 1;

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

function filterPools(pools: DiscoveredPool[]): DiscoveredPool[] {
  console.log('\n🔍 Filtering pools...');
  
  // Filter by liquidity (minimum $10,000)
  const filtered = pools.filter(pool => 
    pool.liquidityUSD >= 10000 && pool.isActive
  );

  console.log(`✅ Filtered ${pools.length} → ${filtered.length} pools (min $10K liquidity)`);
  
  return filtered;
}

function removeDuplicates(pools: DiscoveredPool[]): DiscoveredPool[] {
  const seen = new Set<string>();
  const uniquePools: DiscoveredPool[] = [];

  for (const pool of pools) {
    // Create a unique key based on token pair and DEX
    const key = `${pool.token0.address}-${pool.token1.address}-${pool.dex}-${pool.dexType}`;
    
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
  const jsonPath = path.join(dataDir, 'moralis-pools.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ pools, stats }, null, 2));
  console.log(`\n💾 Saved pools to: ${jsonPath}`);

  // Save CSV
  const csvPath = path.join(dataDir, 'moralis-pools.csv');
  const csvHeader = [
    'Address',
    'DEX',
    'DEX Type',
    'Version',
    'Token0 Symbol',
    'Token0 Address',
    'Token1 Symbol',
    'Token1 Address',
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
    pool.token1.symbol,
    pool.token1.address,
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
}

function printStats(stats: DiscoveryStats, filteredCount: number): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          DISCOVERY STATISTICS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Total Pairs Found:      ${stats.totalPairsFound}`);
  console.log(`✅ Active Pools ($10K+):  ${filteredCount}`);
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
    console.log(`   ${dex.padEnd(25)}: ${count} pairs`);
  }
  console.log();
}

async function main() {
  try {
    // Discover all pools
    const { pools, stats } = await discoverAllPools();

    // Filter pools
    const filteredPools = filterPools(pools);

    // Remove duplicates
    const uniquePools = removeDuplicates(filteredPools);

    // Save to files
    savePoolsToFile(uniquePools, stats);

    // Print statistics
    printStats(stats, uniquePools.length);

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ POOL DISCOVERY COMPLETE                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('❌ Fatal error during pool discovery:', error);
    process.exit(1);
  }
}

main();