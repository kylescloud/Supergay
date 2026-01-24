import { ethers } from 'ethers';
import { PoolDiscovery } from '../src/pools/discovery';
import { PoolRegistryManager } from '../src/pools/registry';
import { config } from '../src/config/index';
import { TOKENS } from '../src/config/constants';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              POOL DISCOVERY - BASE MAINNET                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Initialize provider
  const provider = await config.getScanningProvider();
  console.log('📡 Connected to Base mainnet RPC\n');

  // Initialize Pool Discovery
  const discovery = new PoolDiscovery(provider);
  console.log('🔍 Pool Discovery initialized\n');

  // Initialize discovery
  await discovery.initialize();
  console.log('✅ Pool Discovery initialized\n');

  // Discover all pools from all DEXs
  console.log(`🎯 Discovering pools from all configured DEXs...\n`);

  const startTime = Date.now();
  
  await discovery.discoverAllPools();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n\n✅ Pool discovery complete! Total time: ${duration}s\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });