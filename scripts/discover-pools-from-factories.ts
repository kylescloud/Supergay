/**
 * Factory-Based Pool Discovery Script
 * 
 * Discovers pools by querying DEX factory contracts directly
 * Validates all pools before adding to registry
 */

import { ethers } from 'ethers';
import { Token } from '../src/types/index';
import { TOKENS } from '../src/config/constants';
import { FactoryPoolFetcher, FactoryConfig } from '../src/pools/fetchers/factoryPoolFetcher';
import fs from 'fs';
import path from 'path';

// Factory configurations for all 10 required DEXs
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
    name: 'SushiSwap V3',
    factoryAddress: '0x1af40C4C2D932e96FDb3F257D3C7F7f5f7e0B8d',
    factoryType: 'v3',
    feeTiers: [500, 3000, 10000],
  },
  {
    name: 'PancakeSwap V3',
    factoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    factoryType: 'v3',
    feeTiers: [100, 500, 2500, 10000],
  },
  {
    name: 'Aerodrome',
    factoryAddress: '0x420DD381b31aEf6683db6B902084c0A413773B88',
    factoryType: 'v2',
  },
  {
    name: 'Aerodrome SlipStream',
    factoryAddress: '0x641C00A822e8b671738d32a4315043E3C5Da456C',
    factoryType: 'v3',
    feeTiers: [100, 500, 2500, 10000],
  },
  {
    name: 'Aerodrome SlipStream 2',
    factoryAddress: '0x31F734C5b88cD4d97B44e858Da656B79BaA26633',
    factoryType: 'v3',
    feeTiers: [100, 500, 2500, 10000],
  },
  {
    name: 'BaseSwap',
    factoryAddress: '0xFDa619791C141031a2d0104840FCB905be82668C',
    factoryType: 'v2',
  },
  {
    name: 'Curve',
    factoryAddress: '0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98',
    factoryType: 'curve',
  },
];

// Get top Base tokens (major tokens with high liquidity)
const getTopTokens = (): Token[] => {
  return [
    // WETH pairs (most liquid)
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
    {
      address: TOKENS.cbETH,
      symbol: 'cbETH',
      name: 'Coinbase Wrapped Staked ETH',
      decimals: 18,
    },
    {
      address: TOKENS.wstETH,
      symbol: 'wstETH',
      name: 'Wrapped Lido Staked ETH',
      decimals: 18,
    },
    // Additional major tokens
    {
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
    },
    {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
    },
    {
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      symbol: 'USDT',
      name: 'L2 Standard Bridged USDT (Base)',
      decimals: 6,
    },
  ];
};

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('           FACTORY-BASED POOL DISCOVERY - BASE BLOCKCHAIN');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Get tokens to discover pools for
  const tokens = getTopTokens();
  console.log(`📊 Tokens to discover: ${tokens.length}`);
  console.log(tokens.map(t => `  • ${t.symbol} (${t.address})`).join('\n'));
  console.log();

  // Get RPC URL
  const rpcUrl = process.env.RPC_URL || 'https://mainnet.base.org';
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

  // Discover pools
  console.log('🔍 Starting pool discovery...\n');
  const discoveredPools = await fetcher.discoverAndValidatePools(
    FACTORY_CONFIGS,
    tokens,
    {
      batchSize: 50,
      delayBetweenBatches: 100,
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

  const outputFile = path.join(outputDir, 'factory-discovered-pools.json');
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