import { ethers } from 'ethers';
import { UniswapV3Fetcher } from '../src/pools/fetchers/uniswapV3';
import { UniswapV2Fetcher } from '../src/pools/fetchers/uniswapV2';
import { SushiSwapV3Fetcher } from '../src/pools/fetchers/sushiswapV3';
import { PancakeSwapV3Fetcher } from '../src/pools/fetchers/pancakeswapV3';
import { AerodromeFetcher } from '../src/pools/fetchers/aerodrome';
import { config } from '../src/config/index';
import type { DEXConfig } from '../src/pools/types';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║         TARGETED POOL DISCOVERY - BASE MAINNET                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const provider = await config.getScanningProvider();
  console.log('📡 Connected to Base mainnet RPC\n');

  // Define DEX configs
  const dexConfigs: DEXConfig[] = [
    {
      name: 'Uniswap V3',
      version: 'V3',
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    },
    {
      name: 'Uniswap V2',
      version: 'V2',
      factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    },
    {
      name: 'SushiSwap V3',
      version: 'V3',
      factory: '0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89',
    },
    {
      name: 'PancakeSwap V3',
      version: 'V3',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    },
    {
      name: 'Aerodrome',
      version: 'V2/V3',
      factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    },
  ];

  let totalPoolsFound = 0;
  let totalErrors = 0;

  for (const dexConfig of dexConfigs) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Testing ${dexConfig.name} (${dexConfig.version})`);
    console.log(`Factory: ${dexConfig.factory}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      let fetcher;
      
      // Create appropriate fetcher based on version
      if (dexConfig.version === 'V3' || dexConfig.version === 'V2/V3') {
        if (dexConfig.name === 'Uniswap V3') {
          fetcher = new UniswapV3Fetcher(provider, dexConfig);
        } else if (dexConfig.name === 'SushiSwap V3') {
          fetcher = new SushiSwapV3Fetcher(provider, dexConfig);
        } else if (dexConfig.name === 'PancakeSwap V3') {
          fetcher = new PancakeSwapV3Fetcher(provider, dexConfig);
        } else if (dexConfig.name === 'Aerodrome') {
          fetcher = new AerodromeFetcher(provider, dexConfig);
        }
      } else if (dexConfig.version === 'V2') {
        if (dexConfig.name === 'Uniswap V2') {
          fetcher = new UniswapV2Fetcher(provider, dexConfig);
        }
      }

      if (!fetcher) {
        console.log(`⚠️  No fetcher available for ${dexConfig.name}`);
        continue;
      }

      // Try to fetch pools with base token filter
      try {
        const result = await fetcher.fetchAllPools('0x4200000000000000000000000000000000000006'); // WETH
        
        if (result.success) {
          console.log(`✅ Successfully fetched ${result.pools.length} pools`);
          totalPoolsFound += result.pools.length;
          
          // Show sample pools
          if (result.pools.length > 0) {
            console.log(`\n📊 Sample pools (first 5):`);
            for (let i = 0; i < Math.min(5, result.pools.length); i++) {
              const pool = result.pools[i];
              console.log(`   ${i + 1}. ${pool.address}`);
              console.log(`      Tokens: ${pool.token0?.symbol || pool.token0?.address?.slice(0, 8)}... / ${pool.token1?.symbol || pool.token1?.address?.slice(0, 8)}...`);
              console.log(`      Fee: ${pool.fee ? (pool.fee / 10000).toFixed(2) + '%' : 'N/A'}`);
              console.log(`      Reserves: ${pool.reserve0} / ${pool.reserve1}`);
            }
          }
        } else {
          console.log(`❌ Failed to fetch pools`);
          totalErrors++;
        }
        
        if (result.errors.length > 0) {
          console.log(`\n⚠️  Errors encountered:`);
          for (const error of result.errors.slice(0, 3)) {
            console.log(`   - ${error.slice(0, 150)}...`);
          }
        }
        
        console.log(`\n📈 Stats:`);
        console.log(`   Execution time: ${result.stats.executionTime}ms`);
        console.log(`   Batches: ${result.stats.batches}`);
        console.log(`   RPC calls: ${result.stats.rpcCalls}`);
        
      } catch (error: any) {
        console.log(`❌ Error fetching pools: ${error.message || error.toString().slice(0, 200)}`);
        totalErrors++;
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to create fetcher: ${error.message || error.toString().slice(0, 200)}`);
      totalErrors++;
    }
  }

  console.log(`\n\n╔══════════════════════════════════════════════════════════════════════════════╗`);
  console.log('║                        TEST SUMMARY                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`Total Pools Found: ${totalPoolsFound}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`DEXs Tested: ${dexConfigs.length}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });