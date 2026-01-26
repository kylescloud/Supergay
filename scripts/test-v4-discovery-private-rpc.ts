#!/usr/bin/env ts-node
/**
 * Test V4 Pool Discovery with Private RPCs
 * 
 * This script tests the Uniswap V4 pool fetcher with incremental block range queries
 * using private Moralis RPC endpoints.
 */

import { ethers } from 'ethers';
import { UniswapV4Fetcher } from '../src/pools/fetchers/uniswapV4';
import { TOKENS, DEX_CONFIG } from '../src/config/constants';

// Private RPC endpoints from environment or config
const PRIVATE_RPCS = [
  process.env.PRIVATE_RPC_1 || 'https://site1.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
  process.env.PRIVATE_RPC_2 || 'https://site2.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357'
];

// V4 Configuration
const V4_CONFIG = {
  name: 'Uniswap V4',
  chainId: 8453,
  poolManager: '0x0000000000000000000000000000000000000000', // Placeholder - will use actual address
  stateView: '0x0000000000000000000000000000000000000000', // Placeholder - will use actual address
  factory: undefined,
  router: undefined,
  feeTiers: [100, 500, 2500, 3000, 10000]
};

async function testV4Discovery() {
  console.log('\n' + '='.repeat(80));
  console.log('Uniswap V4 Pool Discovery Test with Private RPCs');
  console.log('='.repeat(80) + '\n');

  // Try each private RPC until one works
  for (let i = 0; i < PRIVATE_RPCS.length; i++) {
    const rpcUrl = PRIVATE_RPCS[i];
    console.log(`\nAttempting connection to Private RPC ${i + 1}/${PRIVATE_RPCS.length}...`);
    console.log(`RPC URL: ${rpcUrl.substring(0, 50)}...`);

    try {
      // Create provider
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Test connection
      console.log('Testing connection...');
      const blockNumber = await provider.getBlockNumber();
      console.log(`✅ Connected! Current block: ${blockNumber}\n`);

      // Update V4 config with actual addresses from constants
      const config = {
        ...V4_CONFIG,
        poolManager: DEX_CONFIG.uniswapV4.poolManager,
        stateView: DEX_CONFIG.uniswapV4.stateView
      };

      console.log('V4 Configuration:');
      console.log(`  Pool Manager: ${config.poolManager}`);
      console.log(`  State View: ${config.stateView}`);
      console.log(`  Fee Tiers: ${config.feeTiers.join(', ')}`);

      // Create V4 fetcher
      console.log('\nInitializing UniswapV4Fetcher...');
      const fetcher = new UniswapV4Fetcher(provider, config as any);
      console.log('✅ Fetcher initialized\n');

      // Run pool discovery
      console.log('Starting pool discovery with incremental block range queries...\n');
      const result = await fetcher.fetchAllPools();

      // Display results
      console.log('\n' + '='.repeat(80));
      console.log('DISCOVERY RESULTS');
      console.log('='.repeat(80));
      console.log(`Success: ${result.success}`);
      console.log(`Pools Found: ${result.pools.length}`);
      console.log(`Total Events: ${result.stats.totalRequested}`);
      console.log(`Successful: ${result.stats.successful}`);
      console.log(`Failed: ${result.stats.failed}`);
      console.log(`RPC Calls: ${result.stats.rpcCalls}`);
      console.log(`Execution Time: ${result.stats.executionTime}ms`);
      console.log(`Batches Processed: ${result.stats.batches}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        result.errors.slice(0, 10).forEach((err, idx) => {
          console.log(`  ${idx + 1}. ${err}`);
        });
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more errors`);
        }
      }

      // Display pool details
      if (result.pools.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('DISCOVERED POOLS');
        console.log('='.repeat(80));
        
        result.pools.slice(0, 10).forEach((pool, idx) => {
          console.log(`\nPool ${idx + 1}:`);
          console.log(`  Address: ${pool.address}`);
          console.log(`  DEX: ${pool.dex} (${pool.dexVersion})`);
          console.log(`  Pair: ${pool.token0.symbol}/${pool.token1.symbol}`);
          console.log(`  Addresses: ${pool.token0.address} / ${pool.token1.address}`);
          console.log(`  Fee: ${(pool.fee || 0) / 10000}%`);
          console.log(`  Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
          console.log(`  sqrtPriceX96: ${pool.sqrtPriceX96?.toString() || 'N/A'}`);
          console.log(`  Tick: ${pool.tick || 'N/A'}`);
        });

        if (result.pools.length > 10) {
          console.log(`\n... and ${result.pools.length - 10} more pools`);
        }
      }

      // Save results to JSON
      const outputPath = 'data/v4-discovery-results.json';
      const fs = require('fs');
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Results saved to: ${outputPath}`);

      return result;

    } catch (error) {
      console.error(`\n❌ Failed with Private RPC ${i + 1}:`);
      console.error(error instanceof Error ? error.message : error);
      
      if (i < PRIVATE_RPCS.length - 1) {
        console.log('\nTrying next private RPC...\n');
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('All private RPCs failed');
  console.log('='.repeat(80));
  throw new Error('Unable to connect to any private RPC');
}

// Run the test
testV4Discovery()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });