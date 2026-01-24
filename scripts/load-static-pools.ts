import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { config } from '../src/config/index';
import * as fs from 'fs';
import * as path from 'path';
import type { Pool } from '../src/pools/types';

async function main() {
  console.log('============================================');
  console.log(' LOAD STATIC POOLS - BASE MAINNET');
  console.log('============================================\n');

  const provider = await config.getScanningProvider();
  console.log('Connected to Base mainnet RPC\n');

  // Load static pools from JSON
  const staticPoolsPath = path.join(__dirname, '..', 'data', 'static-pools.json');
  const staticPoolsData = JSON.parse(fs.readFileSync(staticPoolsPath, 'utf-8'));
  
  console.log(`Loaded ${staticPoolsData.pools.length} pools from static-pools.json\n`);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  
  // Add pools to registry
  let addedCount = 0;
  for (const poolData of staticPoolsData.pools) {
    try {
      const address = ethers.getAddress(poolData.address);
      
      // Check if pool already exists in registry
      const existingPools = registry.getPools({});
      const existingPool = existingPools.find(p => p.address.toLowerCase() === address.toLowerCase());
      
      let pool: Pool;
      
      if (existingPool) {
        // Preserve existing state data (liquidity, reserves, sqrtPriceX96, tick)
        pool = {
          ...existingPool,
          dex: poolData.dexName,
          dexVersion: poolData.dexType,
          token0: poolData.token0,
          token1: poolData.token1,
          fee: poolData.fee,
          isActive: poolData.isActive,
        };
        console.log(`Updating existing pool: ${pool.dex} - ${pool.token0.symbol}/${pool.token1.symbol}`);
      } else {
        // Create new pool
        pool = {
          address: address,
          dex: poolData.dexName,
          dexVersion: poolData.dexType,
          token0: poolData.token0,
          token1: poolData.token1,
          fee: poolData.fee,
          reserve0: BigInt(poolData.reserve0 || 0),
          reserve1: BigInt(poolData.reserve1 || 0),
          blockNumber: poolData.blockNumber,
          lastUpdated: Math.floor(Date.now() / 1000),
          isActive: poolData.isActive,
        };
        console.log(`Adding new pool: ${pool.dex} - ${pool.token0.symbol}/${pool.token1.symbol}`);
      }
      
      await registry.addPools([pool]);
      addedCount++;
      
      console.log(`  Address: ${pool.address}`);
      console.log(`  Fee: ${pool.fee ? (pool.fee / 10000).toFixed(2) + '%' : 'N/A'}\n`);
      
    } catch (error: any) {
      console.error(`Failed to add pool ${poolData.address}: ${error.message}`);
    }
  }

  // Save registry
  await registry.save();
  console.log(`Registry saved to data/pool-registry.json\n`);

  console.log('============================================');
  console.log(' REGISTRY SUMMARY');
  console.log('============================================\n');
  
  console.log(`Pools Loaded:       ${addedCount}`);
  console.log(`File:              ${staticPoolsPath}`);
  console.log(`Saved to:          data/pool-registry.json\n`);

  // Test fetching pools by pair
  console.log('============================================');
  console.log(' POOL FETCHING TEST');
  console.log('============================================\n');

  const wethAddress = '0x4200000000000000000000000000000000000006';
  const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  const wethUsdcPools = registry.getPoolsForPair(wethAddress, usdcAddress);
  console.log(`\nWETH/USDC pools found: ${wethUsdcPools.length}`);
  
  for (const pool of wethUsdcPools) {
    console.log(`  - ${pool.dex} (${pool.dexVersion}): ${pool.address}`);
  }

  console.log(`\nStatic pools loaded successfully!\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });