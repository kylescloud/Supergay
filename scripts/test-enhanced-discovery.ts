/**
 * Test Enhanced Pool Discovery with Private RPCs
 * Tests the implementation with private RPC endpoints
 */

import { ethers } from 'ethers';
import { PRIVATE_RPC_NODES } from '../src/config/constants';
import { UniswapV4Fetcher } from '../src/pools/fetchers/uniswapV4';
import { EnhancedRPCManager } from '../src/utils/enhancedRpcManager';

async function testEnhancedDiscovery() {
  console.log('\n' + '='.repeat(80));
  console.log('Testing Enhanced Pool Discovery with Private RPCs');
  console.log('='.repeat(80));

  console.log(`\nPrivate RPC Nodes: ${PRIVATE_RPC_NODES.length}`);
  PRIVATE_RPC_NODES.forEach((rpc, i) => {
    console.log(`  ${i + 1}. ${rpc}`);
  });

  // Create Enhanced RPC Manager
  console.log('\nCreating Enhanced RPC Manager...');
  const allRpcUrls = [...PRIVATE_RPC_NODES];
  const rpcManager = new EnhancedRPCManager(allRpcUrls, {
    maxRetries: 3,
    retryDelay: 1000,
    retryBackoffMultiplier: 2,
    maxRetryDelay: 10000,
    timeout: 15000,
    rateLimitPerSecond: 10,
    rateLimitBurst: 20
  });
  console.log('✓ RPC Manager created');

  // Create provider
  const provider = new ethers.JsonRpcProvider(PRIVATE_RPC_NODES[0]);
  console.log('✓ Provider created');

  // Create V4 fetcher config
  const v4Config = {
    name: 'Uniswap V4',
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    version: 'v4',
  };

  console.log(`\nPool Manager: ${v4Config.poolManager}`);
  console.log(`State View: ${v4Config.stateView}`);

  try {
    // Create fetcher instance
    console.log('\nCreating UniswapV4Fetcher instance...');
    const fetcher = new UniswapV4Fetcher(provider, v4Config);
    console.log('✓ Fetcher created successfully');

    // Test pool discovery with limited block range for testing
    console.log('\nStarting pool discovery (limited range for testing)...');
    
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // For testing, only query the last 100K blocks
    const testStartBlock = Math.max(0, currentBlock - 100000);
    console.log(`Testing blocks ${testStartBlock} to ${currentBlock}`);

    const startTime = Date.now();
    const result = await fetcher.fetchAllPools();
    const executionTime = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('Test Results');
    console.log('='.repeat(80));

    console.log(`\nSuccess: ${result.success}`);
    console.log(`Total Pools Found: ${result.pools.length}`);
    console.log(`Execution Time: ${executionTime}ms`);
    console.log(`RPC Calls: ${result.stats.rpcCalls}`);
    console.log(`Batches: ${result.stats.batches}`);
    console.log(`Successful: ${result.stats.successful}`);
    console.log(`Failed: ${result.stats.failed}`);

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    // Display pool details
    if (result.pools.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('Pool Details');
      console.log('='.repeat(80) + '\n');

      result.pools.slice(0, 10).forEach((pool, i) => {
        console.log(`Pool ${i + 1}:`);
        console.log(`  Address: ${pool.address}`);
        console.log(`  Tokens: ${pool.token0.symbol} / ${pool.token1.symbol}`);
        console.log(`  Fee: ${pool.fee ? pool.fee / 10000 + '%' : 'N/A'}`);
        console.log(`  Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
        console.log(`  Tick: ${pool.tick ?? 'N/A'}`);
        console.log('');
      });

      if (result.pools.length > 10) {
        console.log(`... and ${result.pools.length - 10} more pools`);
      }
    }

    // Test RPC Manager Statistics
    console.log('\n' + '='.repeat(80));
    console.log('RPC Manager Statistics');
    console.log('='.repeat(80) + '\n');

    const stats = rpcManager.getStatistics();
    stats.forEach((stat, i) => {
      console.log(`Node ${i + 1}:`);
      console.log(`  URL: ${stat.url}`);
      console.log(`  Is Private: ${stat.isPrivate}`);
      console.log(`  Is Healthy: ${stat.isHealthy}`);
      console.log(`  Request Count: ${stat.requestCount}`);
      console.log(`  Failure Count: ${stat.failureCount}`);
      console.log(`  Avg Response Time: ${stat.averageResponseTime.toFixed(2)}ms`);
      console.log('');
    });

    // Save results to file
    const fs = require('fs');
    const output = {
      success: result.success,
      poolsFound: result.pools.length,
      executionTime,
      stats: result.stats,
      errors: result.errors,
      pools: result.pools.map(pool => ({
        address: pool.address,
        token0: pool.token0.symbol,
        token1: pool.token1.symbol,
        fee: pool.fee,
        liquidity: pool.liquidity?.toString(),
        tick: pool.tick,
      })),
      rpcStats: stats,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      'data/test-enhanced-discovery-results.json',
      JSON.stringify(output, null, 2)
    );

    console.log('\n' + '='.repeat(80));
    console.log(`Results saved to: data/test-enhanced-discovery-results.json`);
    console.log('='.repeat(80) + '\n');

    return result;

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testEnhancedDiscovery()
  .then(() => {
    console.log('✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });