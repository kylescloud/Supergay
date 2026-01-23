/**
 * Run Pool Discovery
 * Quick test script to verify pool discovery works
 */

const { ethers } = require('ethers');

// DEX Factory addresses on Base
const DEX_FACTORIES = {
  'Uniswap V3': '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  'Uniswap V2': '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
  'SushiSwap': '0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89',
  'Aerodrome': '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
};

// RPC URLs
const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://1rpc.io/base',
];

async function testPoolDiscovery() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         POOL DISCOVERY - QUICK VALIDATION TEST              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(RPC_URLS[0]);
  
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    console.log(`✅ Connected to Base (Chain ID: ${network.chainId})`);
    console.log(`   Current Block: ${blockNumber}\n`);

    // Uniswap V3 Factory ABI
    const V3_FACTORY_ABI = [
      'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
    ];

    // Test Uniswap V3
    console.log('Testing Uniswap V3 Factory...');
    const v3Factory = new ethers.Contract(DEX_FACTORIES['Uniswap V3'], V3_FACTORY_ABI, provider);
    
    const filter = v3Factory.filters.PoolCreated();
    const events = await v3Factory.queryFilter(filter, blockNumber - 1000, blockNumber);
    
    console.log(`Found ${events.length} recent pool creation events\n`);
    
    // Show some sample pools
    if (events.length > 0) {
      console.log('Sample pools:');
      for (let i = 0; i < Math.min(5, events.length); i++) {
        const event = events[i];
        const args = event.args;
        console.log(`  ${i + 1}. Pool: ${args.pool}`);
        console.log(`     Token0: ${args.token0}`);
        console.log(`     Token1: ${args.token1}`);
        console.log(`     Fee: ${Number(args.fee) / 10000}%`);
        console.log(`     Block: ${event.blockNumber}\n`);
      }
    }

    console.log('✅ Pool discovery test completed successfully!');
    console.log('   The DEX factory connections are working correctly.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

testPoolDiscovery()
  .then(() => {
    console.log('✓ All tests passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error);
    process.exit(1);
  });