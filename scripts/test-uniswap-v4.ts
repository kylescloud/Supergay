/**
 * Test Uniswap V4 Pool Discovery
 * Tests the production implementation with real Base blockchain data
 */

import { ethers } from 'ethers';
import { PUBLIC_RPC_NODES, BASE_CHAIN_ID } from '../src/config/constants';
import { UniswapV4Fetcher } from '../src/pools/fetchers/uniswapV4';

async function testUniswapV4() {
  console.log('\n' + '='.repeat(80));
  console.log('Testing Uniswap V4 Pool Discovery');
  console.log('='.repeat(80));

  // Create provider
  const rpcUrl = PUBLIC_RPC_NODES[0];
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log(`\nRPC URL: ${rpcUrl}`);
  console.log(`Chain ID: ${BASE_CHAIN_ID}`);

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

    // Test pool discovery
    console.log('\nStarting pool discovery...');
    console.log('This may take a while due to rate limiting...\n');

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

      result.pools.slice(0, 5).forEach((pool, i) => {
        console.log(`Pool ${i + 1}:`);
        console.log(`  Address: ${pool.address}`);
        console.log(`  Tokens: ${pool.token0.symbol} / ${pool.token1.symbol}`);
        console.log(`  Fee: ${pool.fee ? pool.fee / 10000 + '%' : 'N/A'}`);
        console.log(`  Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
        console.log(`  Tick: ${pool.tick ?? 'N/A'}`);
        console.log('');
      });

      if (result.pools.length > 5) {
        console.log(`... and ${result.pools.length - 5} more pools`);
      }
    }

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
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      'data/test-uniswap-v4-results.json',
      JSON.stringify(output, null, 2)
    );

    console.log('\n' + '='.repeat(80));
    console.log(`Results saved to: data/test-uniswap-v4-results.json`);
    console.log('='.repeat(80) + '\n');

    return result;

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testUniswapV4()
  .then(() => {
    console.log('✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });