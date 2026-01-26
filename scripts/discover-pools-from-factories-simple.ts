/**
 * Simplified Factory-Based Pool Discovery Script
 * 
 * Discovers pools by querying DEX factory contracts directly
 * Uses fewer tokens and longer delays to avoid rate limiting
 */

import { ethers } from 'ethers';
import { Token } from '../src/types/index';
import { TOKENS } from '../src/config/constants';
import { FactoryPoolFetcher, FactoryConfig } from '../src/pools/fetchers/factoryPoolFetcher';
import fs from 'fs';
import path from 'path';

// Factory configurations for major DEXs only
const FACTORY_CONFIGS: FactoryConfig[] = [
  {
    name: 'Uniswap V2',
    factoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    factoryType: 'v2',
  },
  {
    name: 'Uniswap V3',
    factoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    factoryType: 'v3',
    feeTiers: [500, 3000, 10000], // 0.05%, 0.3%, 1%
  },
  {
    name: 'Aerodrome',
    factoryAddress: '0x420DD381b31aEf6683db6B902084c0A413773B88',
    factoryType: 'v2',
  },
];

// Get only top 3 tokens for testing
const getTopTokens = (): Token[] => {
  return [
    {
      address: TOKENS.WETH,
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    {
      address: TOKENS.USDC,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    {
      address: TOKENS.USDbC,
      symbol: 'USDbC',
      name: 'USD Base Coin',
      decimals: 6,
    },
  ];
};

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('     SIMPLIFIED FACTORY-BASED POOL DISCOVERY - BASE BLOCKCHAIN');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Get tokens to discover pools for
  const tokens = getTopTokens();
  console.log(`📊 Tokens to discover: ${tokens.length}`);
  console.log(tokens.map(t => `  • ${t.symbol} (${t.address})`).join('\n'));
  console.log();

  // Get RPC URL
  const rpcUrl = 'https://mainnet.base.org';
  console.log(`🔗 RPC URL: ${rpcUrl}\n`);

  // Initialize fetcher
  const fetcher = new FactoryPoolFetcher(rpcUrl);
  await fetcher.initialize();

  console.log('🏭 Factory Configurations:');
  FACTORY_CONFIGS.forEach(config => {
    console.log(`  • ${config.name}`);
    console.log(`    Address: ${config.factoryAddress}`);
    console.log(`    Type: ${config.factoryType}`);
    if (config.feeTiers) {
      console.log(`    Fee Tiers: ${config.feeTiers.map(f => `${f / 10000}%`).join(', ')}`);
    }
  });
  console.log();

  // Discover pools with longer delays
  console.log('🔍 Starting pool discovery...\n');
  const discoveredPools = await fetcher.discoverAndValidatePools(
    FACTORY_CONFIGS,
    tokens,
    {
      batchSize: 5,
      delayBetweenBatches: 1000, // 1 second delay
    }
  );

  // Group pools by DEX
  const poolsByDex: Record<string, any[]> = {};
  discoveredPools.forEach(pool => {
    if (!poolsByDex[pool.dex]) {
      poolsByDex[pool.dex] = [];
    }
    poolsByDex[pool.dex].push(pool);
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                         DISCOVERY RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  console.log(`📊 Total Valid Pools Found: ${discoveredPools.length}\n`);

  console.log('Pools by DEX:');
  Object.entries(poolsByDex)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([dex, pools]) => {
      console.log(`  • ${dex}: ${pools.length} pools`);
    });

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                         POOL DETAILS');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  discoveredPools.forEach((pool, index) => {
    console.log(`${index + 1}. ${pool.dex} ${pool.dexVersion.toUpperCase()}`);
    console.log(`   Address: ${pool.address}`);
    console.log(`   Pair: ${pool.token0.symbol}/${pool.token1.symbol}`);
    if (pool.fee) {
      console.log(`   Fee: ${pool.fee / 10000}%`);
    }
    console.log();
  });

  // Save to file
  const outputDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'factory-discovered-pools-simple.json');
  const outputData = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    chainId: 8453,
    network: 'base',
    totalPools: discoveredPools.length,
    poolsByDex: Object.fromEntries(
      Object.entries(poolsByDex).map(([dex, pools]) => [dex, pools.length])
    ),
    pools: discoveredPools.map(pool => ({
      address: pool.address,
      dex: pool.dex,
      dexVersion: pool.dexVersion,
      token0: pool.token0,
      token1: pool.token1,
      fee: pool.fee,
    })),
  };

  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
  console.log(`💾 Pools saved to: ${outputFile}`);

  console.log('\n✅ Factory-based pool discovery complete!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});