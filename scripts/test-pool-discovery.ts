/**
 * Test Pool Discovery
 * Comprehensive testing of all DEX pool fetchers
 */

import { ethers } from 'ethers';
import { PoolDiscovery } from '../src/pools/discovery';
import config from '../src/config/index';

async function runPoolDiscoveryTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         POOL DISCOVERY - COMPREHENSIVE TEST SUITE          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Get provider
    console.log('📡 Connecting to Base mainnet...');
    const provider = config.getScanningProvider();
    
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    console.log(`✅ Connected successfully`);
    console.log(`   Network: Base (Chain ID: ${network.chainId})`);
    console.log(`   Current Block: ${blockNumber}\n`);

    // Initialize discovery
    const discovery = new PoolDiscovery(provider);
    await discovery.initialize();

    // Run discovery
    console.log('\n🔍 Starting pool discovery...\n');
    await discovery.discoverAllPools();

    // Get registry
    const registry = discovery.getRegistry();
    const stats = registry.getStats();

    // Print detailed statistics
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    DETAILED STATISTICS                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Pools: ${stats.totalPools}`);
    console.log(`Active Pools: ${stats.activePools}`);
    console.log(`Inactive Pools: ${stats.totalPools - stats.activePools}\n`);

    console.log('Pools by DEX:');
    const sortedDexs = Object.entries(stats.poolsByDEX).sort((a, b) => b[1] - a[1]);
    for (const [dex, count] of sortedDexs) {
      const percentage = ((count / stats.totalPools) * 100).toFixed(1);
      console.log(`  ${dex.padEnd(20)} ${count.toString().padStart(6)} (${percentage}%)`);
    }

    console.log('\nTop 10 Tokens by Pool Count:');
    const sortedTokens = Object.entries(stats.poolsByToken)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [token, count] of sortedTokens) {
      const percentage = ((count / stats.totalPools) * 100).toFixed(1);
      console.log(`  ${token.padEnd(42)} ${count.toString().padStart(4)} (${percentage}%)`);
    }

    // Sample pools from each DEX
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    SAMPLE POOLS BY DEX                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    for (const [dex, count] of sortedDexs) {
      const pools = registry.getPoolsByDEX(dex);
      console.log(`${dex}:`);
      console.log(`  Total: ${count} pools`);
      
      // Show top 3 pools by liquidity
      const topPools = pools
        .filter(p => p.liquidity || p.reserve0)
        .sort((a, b) => {
          const liqA = a.liquidity || a.reserve0 || 0n;
          const liqB = b.liquidity || b.reserve0 || 0n;
          return Number(liqB - liqA);
        })
        .slice(0, 3);

      if (topPools.length > 0) {
        console.log(`  Top pools by liquidity:`);
        for (const pool of topPools) {
          let liquidity = 'Unknown';
          if (pool.liquidity) {
            liquidity = `${ethers.formatEther(pool.liquidity)} ETH`;
          } else if (pool.reserve0 && pool.reserve1) {
            liquidity = `${ethers.formatEther(pool.reserve0)} / ${ethers.formatEther(pool.reserve1)}`;
          }
          
          console.log(`    - ${pool.token0.symbol}/${pool.token1.symbol}`);
          console.log(`      Address: ${pool.address}`);
          console.log(`      Liquidity: ${liquidity}`);
          if (pool.fee) {
            console.log(`      Fee: ${pool.fee / 10000}%`);
          }
        }
      } else {
        console.log(`  No active pools found`);
      }
      console.log();
    }

    // Test filtering
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FILTERING TESTS                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Filter by WETH
    const wethPools = registry.getPoolsByToken('0x4200000000000000000000000000000000000006');
    console.log(`Pools with WETH: ${wethPools.length}`);

    // Filter by USDC
    const usdcPools = registry.getPoolsByToken('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    console.log(`Pools with USDC: ${usdcPools.length}`);

    // Filter by active pools
    const activePools = registry.getPools({ isActive: true });
    console.log(`Active pools: ${activePools.length}`);

    // Filter by DEX
    const uniswapPools = registry.getPools({ dex: 'Uniswap V3' });
    console.log(`Uniswap V3 pools: ${uniswapPools.length}`);

    // Test pair lookup
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    PAIR LOOKUP TESTS                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const wethUsdcPools = registry.getPoolsForPair(
      '0x4200000000000000000000000000000000000006',
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    );
    console.log(`WETH/USDC pools: ${wethUsdcPools.length}`);
    if (wethUsdcPools.length > 0) {
      console.log('\nWETH/USDC pools by DEX:');
      for (const pool of wethUsdcPools) {
        console.log(`  ${pool.dex} ${pool.dexVersion}: ${pool.address}`);
        if (pool.fee) {
          console.log(`    Fee tier: ${pool.fee / 10000}%`);
        }
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST COMPLETE                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('✅ All tests completed successfully!');
    console.log(`📊 Registry saved to data/pool-registry.json`);
    console.log(`📄 CSV saved to data/pool-registry.csv\n`);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    throw error;
  }
}

// Run tests
runPoolDiscoveryTests()
  .then(() => {
    console.log('✓ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test suite failed:', error);
    process.exit(1);
  });