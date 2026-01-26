import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager } from '../src/utils/rpcManager';

/**
 * Update pool state data from blockchain
 */
async function updatePoolStates() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              UPDATING POOL STATE FROM BLOCKCHAIN                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider('scanning' as any);
  const blockNumber = await provider.getBlockNumber();

  console.log(`📍 Current Block: ${blockNumber}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  // Load existing pool registry
  const registry = new PoolRegistryManager();
  await registry.load();
  const pools = registry.getAllPools();

  console.log(`📂 Loaded ${pools.length} pools from registry\n`);

  // ABIs
  const V3_POOL_ABI = [
    'function liquidity() view returns (uint128)',
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)'
  ];

  const V2_PAIR_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)'
  ];

  let updatedCount = 0;
  let failedCount = 0;

  console.log('🔄 Updating pool states...');
  console.log('─'.repeat(80));

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    
    try {
      if (pool.dexVersion === 'v3' || pool.dexVersion === 'v3-like') {
        const poolContract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
        const [liquidity, slot0] = await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0()
        ]);

        pool.liquidity = liquidity;
        pool.sqrtPriceX96 = slot0.sqrtPriceX96;
        pool.tick = Number(slot0.tick);
        pool.isActive = liquidity > 0n;
        pool.lastUpdated = Date.now();
        
        updatedCount++;
        
        if ((i + 1) % 50 === 0) {
          console.log(`   Progress: ${i + 1}/${pools.length} pools updated`);
        }
      } else if (pool.dexVersion === 'v2') {
        const pairContract = new ethers.Contract(pool.address, V2_PAIR_ABI, provider);
        const reserves = await pairContract.getReserves();

        pool.reserve0 = reserves.reserve0;
        pool.reserve1 = reserves.reserve1;
        pool.isActive = reserves.reserve0 > 0n && reserves.reserve1 > 0n;
        pool.lastUpdated = Date.now();
        
        updatedCount++;
        
        if ((i + 1) % 50 === 0) {
          console.log(`   Progress: ${i + 1}/${pools.length} pools updated`);
        }
      }
    } catch (error: any) {
      failedCount++;
      if (failedCount <= 5) {
        console.log(`   ⚠️  Failed: ${pool.address.substring(0, 10)}... - ${error.message.substring(0, 50)}`);
      }
    }
  }

  console.log(`   Progress: ${pools.length}/${pools.length} pools updated`);
  console.log('─'.repeat(80));
  console.log(`\n✅ Successfully updated: ${updatedCount} pools`);
  console.log(`❌ Failed to update: ${failedCount} pools\n`);

  // Save updated registry
  await registry.save();
  console.log(`💾 Updated registry saved to data/pool-registry.json\n`);

  return { updatedCount, failedCount };
}

async function main() {
  try {
    await updatePoolStates();
    
    console.log('✅ Pool state update complete!');
    console.log('\n🚀 Now run the production scan:');
    console.log('   npx ts-node scripts/full-scan-detailed-logging.ts');
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
}

main();