#!/usr/bin/env ts-node
/**
 * Test Curve Pool Discovery
 * 
 * This script tests Curve pool discovery for both Stableswap and Twocrypto factories
 */

import { ethers } from 'ethers';
import { CurveFetcher } from '../src/pools/fetchers/curve';
import { DEX_CONFIG, TOKENS } from '../src/config/constants';
import { RPCManager, RPCUsageType } from '../src/utils/rpcManager';

async function testCurveDiscovery() {
  console.log('\n' + '='.repeat(80));
  console.log('Curve Pool Discovery Test');
  console.log('='.repeat(80) + '\n');

  // Initialize RPC Manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider(RPCUsageType.SCANNING);

  console.log('✅ Connected to Base mainnet\n');

  // Test Stableswap Metapool Factory
  console.log('Testing Stableswap Metapool Factory...');
  console.log('='.repeat(80));
  
  const stableswapConfig = {
    name: 'Curve Stableswap',
    chainId: 8453,
    factory: DEX_CONFIG.curve.stableswapMetapoolFactory,
    version: 'curve',
    feeTiers: []
  };

  const stableswapFetcher = new CurveFetcher(provider, stableswapConfig);
  
  try {
    const stableswapResult = await stableswapFetcher.fetchAllPools();
    
    console.log('\nStableswap Results:');
    console.log(`  Success: ${stableswapResult.success}`);
    console.log(`  Pools Found: ${stableswapResult.pools.length}`);
    console.log(`  Total Requested: ${stableswapResult.stats.totalRequested}`);
    console.log(`  Successful: ${stableswapResult.stats.successful}`);
    console.log(`  Failed: ${stableswapResult.stats.failed}`);
    console.log(`  RPC Calls: ${stableswapResult.stats.rpcCalls}`);
    console.log(`  Execution Time: ${stableswapResult.stats.executionTime}ms`);

    if (stableswapResult.pools.length > 0) {
      console.log('\nSample Pools:');
      stableswapResult.pools.slice(0, 5).forEach((pool, idx) => {
        console.log(`  ${idx + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Reserves: ${pool.reserve0?.toString()} / ${pool.reserve1?.toString()}`);
      });
    }

    if (stableswapResult.errors.length > 0) {
      console.log(`\nErrors (${stableswapResult.errors.length}):`);
      stableswapResult.errors.slice(0, 5).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }
  } catch (error) {
    console.error('Error with Stableswap factory:', error);
  }

  console.log('\n\n');

  // Test Twocrypto Factory
  console.log('Testing Twocrypto Factory...');
  console.log('='.repeat(80));
  
  const twocryptoConfig = {
    name: 'Curve Twocrypto',
    chainId: 8453,
    factory: DEX_CONFIG.curve.twocryptoFactory,
    version: 'curve',
    feeTiers: []
  };

  const twocryptoFetcher = new CurveFetcher(provider, twocryptoConfig);
  
  try {
    const twocryptoResult = await twocryptoFetcher.fetchAllPools();
    
    console.log('\nTwocrypto Results:');
    console.log(`  Success: ${twocryptoResult.success}`);
    console.log(`  Pools Found: ${twocryptoResult.pools.length}`);
    console.log(`  Total Requested: ${twocryptoResult.stats.totalRequested}`);
    console.log(`  Successful: ${twocryptoResult.stats.successful}`);
    console.log(`  Failed: ${twocryptoResult.stats.failed}`);
    console.log(`  RPC Calls: ${twocryptoResult.stats.rpcCalls}`);
    console.log(`  Execution Time: ${twocryptoResult.stats.executionTime}ms`);

    if (twocryptoResult.pools.length > 0) {
      console.log('\nSample Pools:');
      twocryptoResult.pools.slice(0, 5).forEach((pool, idx) => {
        console.log(`  ${idx + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Reserves: ${pool.reserve0?.toString()} / ${pool.reserve1?.toString()}`);
      });
    }

    if (twocryptoResult.errors.length > 0) {
      console.log(`\nErrors (${twocryptoResult.errors.length}):`);
      twocryptoResult.errors.slice(0, 5).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }
  } catch (error) {
    console.error('Error with Twocrypto factory:', error);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Curve Discovery Test Complete');
  console.log('='.repeat(80) + '\n');
}

// Run the test
testCurveDiscovery()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });