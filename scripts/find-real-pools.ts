import { ethers } from 'ethers';
import { config } from '../src/config/index';

// Uniswap V3 Factory ABI
const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

// Uniswap V2 Factory ABI
const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

// Token addresses on Base
const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
};

// DEX Factories on Base
const FACTORIES = {
  uniswapV3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  uniswapV2: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
};

// Common fee tiers for V3
const FEE_TIERS = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

async function main() {
  console.log('============================================');
  console.log(' FIND REAL POOL ADDRESSES - BASE MAINNET');
  console.log('============================================\n');

  const provider = await config.getScanningProvider();
  console.log('Connected to Base mainnet RPC\n');

  // Uniswap V3 Pools
  console.log('--- Uniswap V3 Pools ---\n');
  const v3Factory = new ethers.Contract(FACTORIES.uniswapV3, UNISWAP_V3_FACTORY_ABI, provider);

  const pairs = [
    { token0: TOKENS.WETH, token1: TOKENS.USDC, name: 'WETH/USDC' },
    { token0: TOKENS.WETH, token1: TOKENS.USDbC, name: 'WETH/USDbC' },
    { token0: TOKENS.USDC, token1: TOKENS.USDbC, name: 'USDC/USDbC' },
  ];

  for (const pair of pairs) {
    console.log(`\n${pair.name}:`);
    
    for (const fee of FEE_TIERS) {
      try {
        const poolAddress = await v3Factory.getPool(pair.token0, pair.token1, fee);
        
        // Check if it's not the zero address
        if (poolAddress !== ethers.ZeroAddress) {
          console.log(`  Fee ${fee / 10000}%: ${poolAddress} ✓`);
        } else {
          console.log(`  Fee ${fee / 10000}%: Not found`);
        }
      } catch (error: any) {
        console.log(`  Fee ${fee / 10000}%: Error - ${error.message}`);
      }
    }
  }

  // Uniswap V2 Pools
  console.log('\n\n--- Uniswap V2 Pools ---\n');
  const v2Factory = new ethers.Contract(FACTORIES.uniswapV2, UNISWAP_V2_FACTORY_ABI, provider);

  for (const pair of pairs) {
    console.log(`\n${pair.name}:`);
    
    try {
      const pairAddress = await v2Factory.getPair(pair.token0, pair.token1);
      
      if (pairAddress !== ethers.ZeroAddress) {
        console.log(`  Address: ${pairAddress} ✓`);
      } else {
        console.log(`  Address: Not found`);
      }
    } catch (error: any) {
      console.log(`  Error - ${error.message}`);
    }
  }

  console.log('\n============================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });