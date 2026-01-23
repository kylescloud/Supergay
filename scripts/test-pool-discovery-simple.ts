/**
 * Simple Test Pool Discovery
 * Basic testing of pool fetchers
 */

import { ethers } from 'ethers';
import { PoolDiscovery } from '../src/pools/discovery';
import config from '../src/config/index';

async function runSimpleTest() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              POOL DISCOVERY - SIMPLE TEST                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
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

    // Get registry and print summary
    const registry = discovery.getRegistry();
    const data = registry.getRegistry();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Total Pools Found:  ${data.pools.length}`);
    console.log(`Active Pools:      ${data.stats.activePools}`);
    console.log(`Last Updated:      ${new Date(data.lastUpdated).toISOString()}`);
    console.log(`Block Number:      ${data.blockNumber}\n`);

    registry.printSummary();

    console.log('\n✅ Test completed successfully!');
    console.log(`📊 Registry saved to data/pool-registry.json`);
    console.log(`📄 CSV saved to data/pool-registry.csv\n`);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    throw error;
  }
}

// Run tests
runSimpleTest()
  .then(() => {
    console.log('✓ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error);
    process.exit(1);
  });