import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager } from '../src/config';
import fs from 'fs';

/**
 * Update Pool Registry State and Run Production Scan
 * 
 * This script:
 * 1. Loads the existing pool registry (477 pools)
 * 2. Updates pool state data from blockchain
 * 3. Runs the production scan
 * 4. Generates detailed report
 */

interface PoolState {
  address: string;
  dex: string;
  dexVersion: string;
  token0: any;
  token1: any;
  liquidity?: string;
  sqrtPriceX96?: string;
  tick?: number;
  reserve0?: string;
  reserve1?: string;
  isActive: boolean;
  lastUpdated: number;
}

async function updatePoolStates(): Promise<number> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              UPDATING POOL REGISTRY STATE FROM BLOCKCHAIN                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Initialize RPC manager
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

  // ABIs for pool contracts
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

        pool.liquidity = liquidity.toString();
        pool.sqrtPriceX96 = slot0.sqrtPriceX96.toString();
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

        pool.reserve0 = reserves.reserve0.toString();
        pool.reserve1 = reserves.reserve1.toString();
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
        console.log(`   ⚠️  Failed to update pool ${pool.address}: ${error.message.substring(0, 100)}`);
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

  return updatedCount;
}

async function runProductionScan() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              RUNNING PRODUCTION ARBITRAGE SCAN                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Execute the existing scan script
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const scan = spawn('npx', ['ts-node', 'scripts/full-scan-detailed-logging.ts'], {
      cwd: '/workspace',
      stdio: 'inherit'
    });

    scan.on('close', (code: number) => {
      if (code === 0) {
        console.log('\n✅ Production scan completed successfully!');
        resolve(code);
      } else {
        console.log(`\n❌ Production scan failed with code ${code}`);
        reject(code);
      }
    });

    scan.on('error', (error: Error) => {
      console.error('❌ Error running scan:', error);
      reject(error);
    });
  });
}

async function main() {
  try {
    const startTime = Date.now();

    // Step 1: Update pool states
    const updatedPools = await updatePoolStates();

    // Step 2: Run production scan
    await runProductionScan();

    const duration = Date.now() - startTime;

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          EXECUTION SUMMARY                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Pools Updated: ${updatedPools}`);
    console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  } catch (error) {
    console.error('\n❌ Execution failed:', error);
    process.exit(1);
  }
}

main();