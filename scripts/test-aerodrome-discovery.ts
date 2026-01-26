#!/usr/bin/env ts-node
/**
 * Test Aerodrome Pool Discovery
 * 
 * This script tests pool discovery for all Aerodrome DEX variants:
 * 1. Aerodrome (V2-style AMM)
 * 2. Aerodrome SlipStream (V3-style CL AMM)
 * 3. Aerodrome SlipStream 2 (Alternative CL AMM)
 */

import { ethers } from 'ethers';
import { UniswapV2Fetcher } from '../src/pools/fetchers/uniswapV2';
import { UniswapV3Fetcher } from '../src/pools/fetchers/uniswapV3';
import { RPCManager, RPCUsageType } from '../src/utils/rpcManager';
import { DEX_CONFIG } from '../src/config/constants';
import fs from 'fs';

async function testAerodromeDiscovery() {
  console.log('\n' + '='.repeat(80));
  console.log('AERODROME POOL DISCOVERY TEST');
  console.log('='.repeat(80) + '\n');

  // Initialize RPC Manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider(RPCUsageType.SCANNING);

  console.log('✅ RPC Manager initialized');
  console.log('✅ Connected to Base mainnet\n');

  const results: any = {
    aerodrome: null,
    slipstream: null,
    slipstream2: null,
    summary: {
      totalPools: 0,
      totalErrors: 0,
      executionTime: 0
    }
  };

  const startTime = Date.now();

  // Test 1: Aerodrome (V2)
  console.log('Testing Aerodrome (V2-style AMM)...');
  console.log('='.repeat(80));
  
  const aerodromeV2Config = {
    name: 'Aerodrome',
    chainId: 8453,
    factory: DEX_CONFIG.aerodrome.factory,
    router: DEX_CONFIG.aerodrome.router,
    version: 'v2',
    feeTiers: []
  };

  try {
    const aerodromeV2Fetcher = new UniswapV2Fetcher(provider, aerodromeV2Config);
    const aerodromeResult = await aerodromeV2Fetcher.fetchAllPools();
    
    console.log('\nAerodrome V2 Results:');
    console.log(`  Success: ${aerodromeResult.success}`);
    console.log(`  Pools Found: ${aerodromeResult.pools.length}`);
    console.log(`  Total Requested: ${aerodromeResult.stats.totalRequested}`);
    console.log(`  Successful: ${aerodromeResult.stats.successful}`);
    console.log(`  Failed: ${aerodromeResult.stats.failed}`);
    console.log(`  RPC Calls: ${aerodromeResult.stats.rpcCalls}`);
    console.log(`  Execution Time: ${aerodromeResult.stats.executionTime}ms`);

    if (aerodromeResult.pools.length > 0) {
      console.log('\nSample Pools:');
      aerodromeResult.pools.slice(0, 5).forEach((pool, idx) => {
        console.log(`  ${idx + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Reserves: ${pool.reserve0?.toString()} / ${pool.reserve1?.toString()}`);
      });

      if (aerodromeResult.pools.length > 5) {
        console.log(`  ... and ${aerodromeResult.pools.length - 5} more pools`);
      }
    }

    if (aerodromeResult.errors.length > 0) {
      console.log(`\nErrors (${aerodromeResult.errors.length}):`);
      aerodromeResult.errors.slice(0, 5).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    results.aerodrome = aerodromeResult;
    results.summary.totalPools += aerodromeResult.pools.length;
    results.summary.totalErrors += aerodromeResult.errors.length;

  } catch (error) {
    console.error('Error with Aerodrome V2:', error);
    results.aerodrome = { error: error instanceof Error ? error.message : 'Unknown error' };
    results.summary.totalErrors++;
  }

  console.log('\n\n');

  // Test 2: Aerodrome SlipStream (V3)
  console.log('Testing Aerodrome SlipStream (V3-style CL AMM)...');
  console.log('='.repeat(80));
  
  const slipstreamConfig = {
    name: 'Aerodrome SlipStream',
    chainId: 8453,
    factory: DEX_CONFIG.aerodromeSlipStream.factory,
    router: DEX_CONFIG.aerodromeSlipStream.router,
    quoter: DEX_CONFIG.aerodromeSlipStream.quoter,
    feeTiers: [...DEX_CONFIG.aerodromeSlipStream.feeTiers],
    version: 'v3',
  };

  try {
    const slipstreamFetcher = new UniswapV3Fetcher(provider, slipstreamConfig);
    const slipstreamResult = await slipstreamFetcher.fetchAllPools();
    
    console.log('\nAerodrome SlipStream Results:');
    console.log(`  Success: ${slipstreamResult.success}`);
    console.log(`  Pools Found: ${slipstreamResult.pools.length}`);
    console.log(`  Total Requested: ${slipstreamResult.stats.totalRequested}`);
    console.log(`  Successful: ${slipstreamResult.stats.successful}`);
    console.log(`  Failed: ${slipstreamResult.stats.failed}`);
    console.log(`  RPC Calls: ${slipstreamResult.stats.rpcCalls}`);
    console.log(`  Execution Time: ${slipstreamResult.stats.executionTime}ms`);

    if (slipstreamResult.pools.length > 0) {
      console.log('\nSample Pools:');
      slipstreamResult.pools.slice(0, 5).forEach((pool, idx) => {
        console.log(`  ${idx + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Fee: ${(pool.fee || 0) / 10000}%`);
        console.log(`     Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
        console.log(`     Tick: ${pool.tick || 'N/A'}`);
      });

      if (slipstreamResult.pools.length > 5) {
        console.log(`  ... and ${slipstreamResult.pools.length - 5} more pools`);
      }
    }

    if (slipstreamResult.errors.length > 0) {
      console.log(`\nErrors (${slipstreamResult.errors.length}):`);
      slipstreamResult.errors.slice(0, 5).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    results.slipstream = slipstreamResult;
    results.summary.totalPools += slipstreamResult.pools.length;
    results.summary.totalErrors += slipstreamResult.errors.length;

  } catch (error) {
    console.error('Error with Aerodrome SlipStream:', error);
    results.slipstream = { error: error instanceof Error ? error.message : 'Unknown error' };
    results.summary.totalErrors++;
  }

  console.log('\n\n');

  // Test 3: Aerodrome SlipStream 2 (V3 alternative)
  console.log('Testing Aerodrome SlipStream 2 (Alternative CL AMM)...');
  console.log('='.repeat(80));
  
  const slipstream2Config = {
    name: 'Aerodrome SlipStream 2',
    chainId: 8453,
    factory: DEX_CONFIG.aerodromeSlipStream2.factory,
    router: DEX_CONFIG.aerodromeSlipStream2.router,
    quoter: DEX_CONFIG.aerodromeSlipStream2.quoter,
    feeTiers: [...DEX_CONFIG.aerodromeSlipStream2.feeTiers],
    version: 'v3',
  };

  try {
    const slipstream2Fetcher = new UniswapV3Fetcher(provider, slipstream2Config);
    const slipstream2Result = await slipstream2Fetcher.fetchAllPools();
    
    console.log('\nAerodrome SlipStream 2 Results:');
    console.log(`  Success: ${slipstream2Result.success}`);
    console.log(`  Pools Found: ${slipstream2Result.pools.length}`);
    console.log(`  Total Requested: ${slipstream2Result.stats.totalRequested}`);
    console.log(`  Successful: ${slipstream2Result.stats.successful}`);
    console.log(`  Failed: ${slipstream2Result.stats.failed}`);
    console.log(`  RPC Calls: ${slipstream2Result.stats.rpcCalls}`);
    console.log(`  Execution Time: ${slipstream2Result.stats.executionTime}ms`);

    if (slipstream2Result.pools.length > 0) {
      console.log('\nSample Pools:');
      slipstream2Result.pools.slice(0, 5).forEach((pool, idx) => {
        console.log(`  ${idx + 1}. ${pool.token0.symbol}/${pool.token1.symbol}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Fee: ${(pool.fee || 0) / 10000}%`);
        console.log(`     Liquidity: ${pool.liquidity?.toString() || 'N/A'}`);
        console.log(`     Tick: ${pool.tick || 'N/A'}`);
      });

      if (slipstream2Result.pools.length > 5) {
        console.log(`  ... and ${slipstream2Result.pools.length - 5} more pools`);
      }
    }

    if (slipstream2Result.errors.length > 0) {
      console.log(`\nErrors (${slipstream2Result.errors.length}):`);
      slipstream2Result.errors.slice(0, 5).forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    results.slipstream2 = slipstream2Result;
    results.summary.totalPools += slipstream2Result.pools.length;
    results.summary.totalErrors += slipstream2Result.errors.length;

  } catch (error) {
    console.error('Error with Aerodrome SlipStream 2:', error);
    results.slipstream2 = { error: error instanceof Error ? error.message : 'Unknown error' };
    results.summary.totalErrors++;
  }

  const endTime = Date.now();
  results.summary.executionTime = endTime - startTime;

  // Final Summary
  console.log('\n' + '='.repeat(80));
  console.log('AERODROME DISCOVERY SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Execution Time: ${results.summary.executionTime}ms (${(results.summary.executionTime / 1000).toFixed(2)}s)`);
  console.log(`Total Pools Found: ${results.summary.totalPools}`);
  console.log(`Total Errors: ${results.summary.totalErrors}`);
  console.log('');

  console.log('Pools by DEX:');
  console.log(`  Aerodrome V2: ${results.aerodrome?.pools?.length || 0} pools`);
  console.log(`  Aerodrome SlipStream: ${results.slipstream?.pools?.length || 0} pools`);
  console.log(`  Aerodrome SlipStream 2: ${results.slipstream2?.pools?.length || 0} pools`);

  // Save results
  const outputPath = 'data/aerodrome-discovery-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80) + '\n');

  return results;
}

// Run the test
testAerodromeDiscovery()
  .then(() => {
    console.log('✅ Aerodrome discovery test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });