import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { ArbitrageLogger } from '../src/utils/logger';
import { TOKENS, TOKEN_METADATA } from '../src/config/constants';
import { DEX_DISCOVERY_CONFIG } from '../src/config/dexDiscoveryConfig';
import { EnhancedRPCManager } from '../src/utils/enhancedRpcManager';

// ABIs
const V2_FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
];

const V3_FACTORY_ABI = [
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
];

const CURVE_FACTORY_ABI = [
  'event CurvePoolCreated(address indexed pool, address indexed token0, address indexed token1)'
];

// Base token addresses (lowercase for comparison)
const FLASH_LOAN_TOKENS = Object.keys(TOKENS).map(key => 
  (TOKENS as any)[key].toLowerCase()
);

async function discoverV2PoolsFromFactory(
  provider: ethers.Provider,
  factoryAddress: string,
  dexName: string
): Promise<any[]> {
  console.log(`\n🔍 Discovering ${dexName} V2 pools from factory events...`);
  
  const factory = new ethers.Contract(factoryAddress, V2_FACTORY_ABI, provider);
  const pools: any[] = [];
  
  try {
    // Query PairCreated events
    // We'll use a large block range, but might need to split for production
    const filter = factory.filters.PairCreated();
    const events = await factory.queryFilter(filter, 0, 'latest');
    
    console.log(`  Found ${events.length} PairCreated events`);
    
    for (const event of events! as any) {
      const token0 = event.args.token0.toLowerCase();
      const token1 = event.args.token1.toLowerCase();
      const pair = event.args.pair;
      
      // Check if either token is a flash loan token
      if (FLASH_LOAN_TOKENS.includes(token0) || FLASH_LOAN_TOKENS.includes(token1)) {
        pools.push({
          address: pair,
          dex: dexName,
          dexType: 'v2',
          token0,
          token1,
          fee: 3000, // V2 standard fee
          pair
        });
      }
    }
    
    console.log(`  ✅ Filtered to ${pools.length} pools with flash loan tokens`);
  } catch (error: any) {
    console.error(`  ❌ Error querying ${dexName} V2 factory:`, error.message);
  }
  
  return pools;
}

async function discoverV3PoolsFromFactory(
  provider: ethers.Provider,
  factoryAddress: string,
  dexName: string,
  feeTiers: number[] = [100, 500, 3000, 10000]
): Promise<any[]> {
  console.log(`\n🔍 Discovering ${dexName} V3 pools from factory events...`);
  
  const factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider);
  const pools: any[] = [];
  
  try {
    // Query PoolCreated events
    const filter = factory.filters.PoolCreated();
    const events = await factory.queryFilter(filter, 0, 'latest');
    
    console.log(`  Found ${events.length} PoolCreated events`);
    
    for (const event of events! as any) {
      const token0 = event.args.token0.toLowerCase();
      const token1 = event.args.token1.toLowerCase();
      const fee = Number(event.args.fee);
      const pool = event.args.pool;
      
      // Check if fee tier matches and if either token is a flash loan token
      if (feeTiers.includes(fee) && 
          (FLASH_LOAN_TOKENS.includes(token0) || FLASH_LOAN_TOKENS.includes(token1))) {
        pools.push({
          address: pool,
          dex: dexName,
          dexType: 'v3',
          token0,
          token1,
          fee,
          tickSpacing: Number(event.args.tickSpacing),
          pool
        });
      }
    }
    
    console.log(`  ✅ Filtered to ${pools.length} pools with flash loan tokens`);
  } catch (error: any) {
    console.error(`  ❌ Error querying ${dexName} V3 factory:`, error.message);
  }
  
  return pools;
}

async function discoverCurvePoolsFromFactory(
  provider: ethers.Provider,
  factoryAddress: string,
  dexName: string
): Promise<any[]> {
  console.log(`\n🔍 Discovering ${dexName} pools from factory events...`);
  
  const factory = new ethers.Contract(factoryAddress, CURVE_FACTORY_ABI, provider);
  const pools: any[] = [];
  
  try {
    // Query CurvePoolCreated events
    const filter = factory.filters.CurvePoolCreated();
    const events = await factory.queryFilter(filter, 0, 'latest');
    
    console.log(`  Found ${events.length} CurvePoolCreated events`);
    
    for (const event of events! as any) {
      const pool = event.args.pool;
      const token0 = event.args.token0?.toLowerCase();
      const token1 = event.args.token1?.toLowerCase();
      
      // Check if either token is a flash loan token
      if ((token0 && FLASH_LOAN_TOKENS.includes(token0)) || 
          (token1 && FLASH_LOAN_TOKENS.includes(token1))) {
        pools.push({
          address: pool,
          dex: dexName,
          dexType: 'curve',
          token0,
          token1,
          fee: 4, // Curve typical fee
          pool
        });
      }
    }
    
    console.log(`  ✅ Filtered to ${pools.length} pools with flash loan tokens`);
  } catch (error: any) {
    console.error(`  ❌ Error querying ${dexName} factory:`, error.message);
  }
  
  return pools;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('FACTORY-BASED POOL DISCOVERY');
  console.log('═'.repeat(80));
  
  console.log(`\n📊 Flash Loan Tokens (${FLASH_LOAN_TOKENS.length}):`);
  FLASH_LOAN_TOKENS.forEach(addr => {
    // Find token by address
    const tokenKey = Object.keys(TOKENS).find(key => 
      (TOKENS as any)[key].toLowerCase() === addr
    );
    const symbol = tokenKey ? (TOKENS as any)[tokenKey] : 'Unknown';
    console.log(`  - ${tokenKey}: ${addr}`);
  });
  
  // Initialize RPC manager with hardcoded public RPC nodes
  const publicNodes = [
    'https://mainnet.base.org',
    'https://base.publicnode.com',
    'https://base.meowrpc.com'
  ];
  
  const rpcManager = new EnhancedRPCManager(publicNodes);
  
  const provider = await rpcManager.getProvider();
  if (!provider) {
    throw new Error('Failed to get provider from RPC manager');
  }
  
  // Initialize registry
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const allPools: any[] = [];
  
  // Discover pools for each DEX
  for (const [dexName, config] of Object.entries(DEX_DISCOVERY_CONFIG)) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`Processing: ${dexName}`);
    console.log('═'.repeat(80));
    
    let pools: any[] = [];
    
    // V2 DEXs
    if (config.version === 'v2' && config.factory) {
      pools = await discoverV2PoolsFromFactory(
        provider,
        config.factory,
        dexName
      );
      allPools.push(...pools);
    }
    
    // V3 DEXs
    if (config.version === 'v3' && config.factory) {
      pools = await discoverV3PoolsFromFactory(
        provider,
        config.factory,
        dexName,
        config.feeTiers
      );
      allPools.push(...pools);
    }
    
    // Curve
    if (config.version === 'curve' && config.factory) {
      pools = await discoverCurvePoolsFromFactory(
        provider,
        config.factory,
        'Curve'
      );
      allPools.push(...pools);
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('DISCOVERY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Pools Discovered: ${allPools.length}`);
  
  // Group by DEX
  const byDex: Record<string, any[]> = {};
  allPools.forEach(pool => {
    if (!byDex[pool.dex]) byDex[pool.dex] = [];
    byDex[pool.dex].push(pool);
  });
  
  console.log('\n📊 Pools by DEX:');
  for (const [dex, pools] of Object.entries(byDex)) {
    console.log(`  ${dex}: ${pools.length}`);
  }
  
  // Add pools to registry
  console.log(`\n💾 Adding ${allPools.length} pools to registry...`);
  await registry.addPools(allPools);
  
  // Save registry
  await registry.save();
  console.log(`✅ Registry saved to: data/pool-registry.json`);
  
  console.log('\n✅ Factory-based pool discovery completed!');
}

main().catch(console.error);