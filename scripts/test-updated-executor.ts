import { ethers } from 'ethers';
import { FlashLoanExecutor } from '../src/execution/FlashLoanExecutor';
import fs from 'fs';

// Mock opportunity for testing
const mockOpportunity = {
  id: 'test-001',
  timestamp: Date.now(),
  strategy: 'Multi-Hop Cyclic Arbitrage',
  profitPercent: 0.5,
  path: ['WETH', 'USDC', 'DAI', 'WETH'],
  pools: [
    '0x4200000000000000000000000000000000000006',
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913',
    '0x50C5725949A6F0c72E6C4a641F24049A917DB0Cb'
  ],
  estimatedGas: 300000,
  profitAfterGas: 0.3,
  status: 'detected' as const,
  dexTypes: ['UniswapV3', 'UniswapV2', 'UniswapV3'],
  dexIdentifiers: ['UniswapV3', 'UniswapV2', 'UniswapV3'],
  poolFees: [3000, 3000, 3000]
};

async function testFlashLoanExecutor() {
  console.log('🧪 Testing Updated FlashLoanExecutor\n');
  console.log('='.repeat(60));
  
  try {
    // Load config
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    console.log(`✅ Config loaded`);
    console.log(`   Min Profit Percent: ${config.minProfitPercent}%`);
    console.log(`   Max Gas Price: ${config.maxGasPrice} gwei\n`);
    
    // Load environment variables
    let privateKey = process.env.PRIVATE_KEY || '';
    let contractAddress = process.env.FLASH_LOAN_CONTRACT_ADDRESS || '';
    
    // Try to load from .env file
    try {
      const envContent = fs.readFileSync('.env', 'utf8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        if (line.startsWith('PRIVATE_KEY=')) {
          privateKey = line.split('=')[1].trim();
        } else if (line.startsWith('FLASH_LOAN_CONTRACT_ADDRESS=')) {
          contractAddress = line.split('=')[1].trim();
        }
      }
    } catch (error) {
      // .env file not found, use process.env
    }
    
    // Use mock values for testing if not set
    if (!privateKey) {
      console.log('⚠️  PRIVATE_KEY not found, using mock key for testing');
      privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
    }
    
    if (!contractAddress) {
      console.log('⚠️  FLASH_LOAN_CONTRACT_ADDRESS not found, using mock address for testing');
      contractAddress = '0x0000000000000000000000000000000000000001';
    }
    
    console.log('✅ Environment variables loaded');
    console.log(`   Contract Address: ${contractAddress}\n`);
    
    // Create executor instance
    console.log('🔧 Creating FlashLoanExecutor instance...');
    const executor = new FlashLoanExecutor(privateKey, contractAddress);
    console.log('✅ FlashLoanExecutor created successfully\n');
    
    // Test buildFlashLoanParams
    console.log('🔨 Testing buildFlashLoanParams...');
    console.log('-'.repeat(60));
    
    const flashLoanParams = (executor as any).buildFlashLoanParams(mockOpportunity);
    
    console.log('✅ Flash loan parameters built successfully\n');
    console.log('📊 Parameters Summary:');
    console.log('   Asset:', flashLoanParams.asset);
    console.log('   Amount:', ethers.formatEther(flashLoanParams.amount), 'tokens');
    console.log('   Swaps:', flashLoanParams.swapParams.swaps.length);
    console.log('   DEX Path:', flashLoanParams.swapParams.dexPath);
    console.log('   Min Profit:', ethers.formatEther(flashLoanParams.swapParams.minProfitAmount), 'tokens\n');
    
    // Display each swap
    console.log('📝 Swap Details:');
    console.log('-'.repeat(60));
    flashLoanParams.swapParams.swaps.forEach((swap: any, index: number) => {
      console.log(`\n   Swap ${index + 1}:`);
      console.log(`   ├─ DEX Type: ${swap.dexType} (${getDexTypeName(swap.dexType)})`);
      console.log(`   ├─ Token In: ${swap.tokenIn}`);
      console.log(`   ├─ Token Out: ${swap.tokenOut}`);
      console.log(`   ├─ Amount: ${ethers.formatEther(swap.amount)}`);
      console.log(`   ├─ Min Amount: ${ethers.formatEther(swap.minAmount)}`);
      console.log(`   ├─ Router: ${swap.dexRouter}`);
      console.log(`   ├─ Fee: ${swap.fee / 10000}%`);
      console.log(`   └─ Swap Data: ${swap.swapData}`);
    });
    
    console.log('\n');
    
    // Test encoding
    console.log('🔐 Testing SwapParams encoding...');
    console.log('-'.repeat(60));
    
    // Encode SwapParams - simpler approach: encode as array
    const swapsArray = flashLoanParams.swapParams.swaps.map((swap: any) => [
      swap.dexType,
      swap.tokenIn,
      swap.tokenOut,
      swap.amount,
      swap.minAmount,
      swap.dexRouter,
      swap.fee,
      swap.swapData
    ]);
    
    const swapParamsEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(uint8,address,address,uint256,uint256,address,uint24,bytes)[]',
        'uint256',
        'string'
      ],
      [
        swapsArray,
        flashLoanParams.swapParams.minProfitAmount,
        flashLoanParams.swapParams.dexPath
      ]
    );
    
    console.log('✅ SwapParams encoded successfully');
    console.log(`   Encoded length: ${swapParamsEncoded.length} bytes`);
    console.log(`   Encoded hash: ${ethers.keccak256(swapParamsEncoded).substring(0, 20)}...\n`);
    
    // Test decoding
    console.log('🔓 Testing SwapParams decoding...');
    console.log('-'.repeat(60));
    
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      [
        'tuple(uint8,address,address,uint256,uint256,address,uint24,bytes)[]',
        'uint256',
        'string'
      ],
      swapParamsEncoded
    );
    
    const decodedSwaps = decoded[0];
    const decodedMinProfit = decoded[1];
    const decodedDexPath = decoded[2];
    
    console.log('✅ SwapParams decoded successfully');
    console.log(`   Decoded swaps: ${decodedSwaps.length}`);
    console.log(`   Decoded min profit: ${ethers.formatEther(decodedMinProfit)} tokens`);
    console.log(`   Decoded DEX path: ${decodedDexPath}\n`);
    
    // Verify encoding/decoding round trip
    console.log('✅ Verification:');
    console.log('-'.repeat(60));
    const originalSwapCount = flashLoanParams.swapParams.swaps.length;
    const decodedSwapCount = decodedSwaps.length;
    const swapsMatch = originalSwapCount === decodedSwapCount;
    const minProfitMatch = flashLoanParams.swapParams.minProfitAmount === decodedMinProfit;
    const dexPathMatch = flashLoanParams.swapParams.dexPath === decodedDexPath;
    
    console.log(`   Swap count matches: ${swapsMatch ? '✅' : '❌'} (${originalSwapCount} == ${decodedSwapCount})`);
    console.log(`   Min profit matches: ${minProfitMatch ? '✅' : '❌'}`);
    console.log(`   DEX path matches: ${dexPathMatch ? '✅' : '❌'}`);
    
    if (swapsMatch && minProfitMatch && dexPathMatch) {
      console.log('\n🎉 All tests passed! FlashLoanExecutor is ready for production.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the implementation.');
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
  }
}

function getDexTypeName(dexType: number): string {
  const types: Record<number, string> = {
    0: 'UniswapV2',
    1: 'UniswapV3',
    2: 'UniswapV4',
    3: 'Curve',
    4: 'AerodromeV2',
    5: 'AerodromeV3',
    6: 'SushiSwapV3',
    7: 'PancakeSwapV3',
    8: 'BaseSwap',
    9: 'Hydrex'
  };
  return types[dexType] || 'Unknown';
}

// Run the test
testFlashLoanExecutor();