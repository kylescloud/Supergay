/**
 * Test script for pool discovery with all 10 DEXs
 */

import { ethers } from 'ethers';
import { PoolDiscovery } from '../src/pools/discovery';

async function test() {
  try {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║              POOL DISCOVERY TEST - ALL 10 DEXs              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Use a public Base RPC endpoint
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    console.log('✅ Provider initialized\n');
    
    console.log('Initializing Pool Discovery...');
    const discovery = new PoolDiscovery(provider);
    await discovery.initialize();
    
    console.log('✅ Pool Discovery initialized\n');
    
    console.log('Starting pool discovery with all 10 DEXs...\n');
    await discovery.discoverAllPools(false);
    
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    DISCOVERY TEST COMPLETE              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    const registry = discovery.getRegistry();
    const stats = registry.getStats();
    
    console.log('\nFinal Statistics:');
    console.log(`Total Pools: ${stats.totalPools}`);
    console.log(`Active Pools: ${stats.activePools}`);
    console.log('Pools by DEX:');
    for (const [dex, count] of Object.entries(stats.poolsByDEX)) {
      console.log(`  ${dex}: ${count} pools`);
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

test();