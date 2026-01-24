import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { config } from '../src/config/index';
import type { Pool } from '../src/pools/types';

// Uniswap V3 Pool ABI
const UNISWAP_V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

// Uniswap V2 Pool ABI
const UNISWAP_V2_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

async function main() {
  console.log('============================================');
  console.log(' UPDATE POOL STATES - BASE MAINNET');
  console.log('============================================\n');

  const provider = await config.getScanningProvider();
  console.log('Connected to Base mainnet RPC\n');

  // Load existing registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const pools = registry.getPools({});
  console.log(`Loaded ${pools.length} pools from registry\n`);

  const poolUpdates: Partial<Pool>[] = [];
  
  for (const pool of pools) {
    try {
      console.log(`\nUpdating pool: ${pool.dex} - ${pool.token0.symbol}/${pool.token1.symbol}`);
      console.log(`  Address: ${pool.address}`);
      
      const update: Partial<Pool> = {
        address: pool.address,
        lastUpdated: Math.floor(Date.now() / 1000),
        isActive: true,
      };
      
      if (pool.dexVersion === 'V3') {
        // V3 Pool
        const poolContract = new ethers.Contract(pool.address, UNISWAP_V3_POOL_ABI, provider);
        
        const [liquidity, slot0] = await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0(),
        ]);
        
        update.liquidity = BigInt(liquidity);
        update.sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);
        update.tick = slot0.tick;
        
        console.log(`  V3 Pool updated:`);
        console.log(`    Liquidity: ${liquidity.toString()}`);
        console.log(`    SqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
        console.log(`    Tick: ${slot0.tick}`);
        
      } else if (pool.dexVersion === 'V2') {
        // V2 Pool
        const poolContract = new ethers.Contract(pool.address, UNISWAP_V2_POOL_ABI, provider);
        
        const reserves = await poolContract.getReserves();
        
        update.reserve0 = BigInt(reserves.reserve0);
        update.reserve1 = BigInt(reserves.reserve1);
        
        console.log(`  V2 Pool updated:`);
        console.log(`    Reserve0: ${reserves.reserve0.toString()}`);
        console.log(`    Reserve1: ${reserves.reserve1.toString()}`);
      }
      
      poolUpdates.push(update);
      
    } catch (error: any) {
      console.error(`  Error updating pool: ${error.message}`);
    }
  }

  // Update pools in registry
  await registry.updatePoolStates(poolUpdates);
  
  // Save updated registry
  await registry.save();
  console.log(`\n\nRegistry saved successfully`);

  console.log('\n============================================');
  console.log(' SUMMARY');
  console.log('============================================\n');
  console.log(`Total Pools:       ${pools.length}`);
  console.log(`Successfully Updated: ${poolUpdates.length}`);
  console.log(`Failed:            ${pools.length - poolUpdates.length}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });