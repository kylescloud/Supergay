import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { TOKEN_METADATA } from '../src/config/constants';
import fs from 'fs';

// V2 Pool ABI
const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

// V3 Pool ABI
const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

async function main() {
  console.log('='.repeat(80));
  console.log('FIXING POOL STATES');
  console.log('='.repeat(80));
  console.log();

  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const registry = new PoolRegistryManager();

  // Load existing registry
  console.log('📂 Loading pool registry...');
  await registry.load();

  const pools = registry.getAllPools();
  console.log(`   Found ${pools.length} pools in registry`);

  let updated = 0;
  let failed = 0;

  for (const pool of pools) {
    try {
      console.log(`\n🔄 Updating pool state for ${pool.address} (${pool.dex}: ${pool.token0.symbol}/${pool.token1.symbol})`);

      const version = pool.dexVersion?.toLowerCase();
      
      if (version === 'v2') {
        await updateV2PoolState(provider, pool);
        updated++;
        console.log(`   ✅ V2 reserves updated`);
      } else if (version === 'v3' || pool.dex === 'uniswap-v3' || pool.dex === 'pancakeswap-v3') {
        await updateV3PoolState(provider, pool);
        updated++;
        console.log(`   ✅ V3 state updated`);
      } else {
        console.log(`   ⚠️ Skipping unsupported version: ${pool.dexVersion} (${version})`);
        failed++;
      }
    } catch (error) {
      console.error(`   ❌ Failed to update pool state: ${error}`);
      failed++;
    }
  }

  // Save updated registry
  await registry.save();

  console.log('\n' + '='.repeat(80));
  console.log('UPDATE COMPLETE');
  console.log('='.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Total Pools: ${pools.length}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
}

async function updateV2PoolState(provider: ethers.JsonRpcProvider, pool: any): Promise<void> {
  const poolContract = new ethers.Contract(pool.address, V2_POOL_ABI, provider);
  const reserves = await poolContract.getReserves();
  
  pool.reserve0 = BigInt(reserves[0]);
  pool.reserve1 = BigInt(reserves[1]);
  pool.lastUpdated = Date.now();
  pool.isActive = pool.reserve0 > 0n || pool.reserve1 > 0n;
}

async function updateV3PoolState(provider: ethers.JsonRpcProvider, pool: any): Promise<void> {
  const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
  const slot0 = await poolContract.slot0();
  const liquidity = await poolContract.liquidity();
  
  pool.sqrtPriceX96 = BigInt(slot0[0]);
  pool.tick = Number(slot0[1]);
  pool.liquidity = BigInt(liquidity);
  pool.lastUpdated = Date.now();
  pool.isActive = pool.liquidity > 0n;
}

main().catch(console.error);