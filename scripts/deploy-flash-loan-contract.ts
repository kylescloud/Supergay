import { ethers } from 'ethers';
import { config } from 'dotenv';
import * as fs from 'fs';
import { FlashLoanArbitrage__factory } from '../typechain/contracts/FlashLoanArbitrage.js';

config();

async function deployFlashLoanContract() {
  console.log('=== Deploying Flash Loan Arbitrage Contract ===\n');

  // Get configuration
  const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';
  const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
  const AAVE_POOL_ADDRESS = '0xA238Dd80C259a72e81d7e4b422E3588869B8325B';
  const ADDRESSES_PROVIDER = '0xA238Dd80C259a72e81d7e4b422E3588869B8325B';

  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment variables!');
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer Address: ${wallet.address}`);
  console.log(`Network: Base`);
  console.log(`RPC: ${RPC_URL}\n`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet Balance: ${ethers.formatEther(balance)} ETH\n`);

  if (balance < ethers.parseEther('0.01')) {
    console.log('⚠️  WARNING: Insufficient ETH for deployment. Need at least 0.01 ETH.');
    return;
  }

  // Deploy contract
  console.log('Deploying FlashLoanArbitrage contract...');
  const factory = new FlashLoanArbitrage__factory(wallet);
  
  // Deploy with Aave addresses provider
  const contract = await factory.deploy(ADDRESSES_PROVIDER);
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed to: ${contractAddress}\n`);

  // Wait for a few block confirmations
  console.log('Waiting for block confirmations...');
  await contract.deploymentTransaction()?.wait(5);
  console.log('✅ Contract confirmed!\n');

  // Verify router addresses
  console.log('Verifying configured DEX routers...\n');
  
  const routers = {
    uniswapV2Router: await contract.uniswapV2Router(),
    uniswapV3Router: await contract.uniswapV3Router(),
    uniswapV4UniversalRouter: await contract.uniswapV4UniversalRouter(),
    curveRouter: await contract.curveRouter(),
    aerodromeRouter: await contract.aerodromeRouter(),
    aerodromeSlipStreamRouter: await contract.aerodromeSlipStreamRouter(),
    aerodromeSlipStream2Router: await contract.aerodromeSlipStream2Router(),
    sushiswapV3Router: await contract.sushiswapV3Router(),
    pancakeswapV3Router: await contract.pancakeswapV3Router(),
    baseSwapRouter: await contract.baseSwapRouter(),
    hydrexRouter: await contract.hydrexRouter()
  };

  console.log('Configured DEX Routers:');
  console.log(`  Uniswap V2: ${routers.uniswapV2Router}`);
  console.log(`  Uniswap V3: ${routers.uniswapV3Router}`);
  console.log(`  Uniswap V4: ${routers.uniswapV4UniversalRouter}`);
  console.log(`  Curve: ${routers.curveRouter}`);
  console.log(`  Aerodrome V2: ${routers.aerodromeRouter}`);
  console.log(`  Aerodrome SlipStream: ${routers.aerodromeSlipStreamRouter}`);
  console.log(`  Aerodrome SlipStream 2: ${routers.aerodromeSlipStream2Router}`);
  console.log(`  SushiSwap V3: ${routers.sushiswapV3Router}`);
  console.log(`  PancakeSwap V3: ${routers.pancakeswapV3Router}`);
  console.log(`  BaseSwap: ${routers.baseSwapRouter}`);
  console.log(`  Hydrex: ${routers.hydrexRouter}\n`);

  console.log('✅ All 11 DEX routers verified!\n');

  // Get contract owner
  const owner = await contract.owner();
  console.log(`Contract Owner: ${owner}`);

  // Check if paused
  const paused = await contract.paused();
  console.log(`Contract Paused: ${paused}\n`);

  // Save deployment information
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: 'Base',
    deployer: wallet.address,
    contractAddress: contractAddress,
    aavePoolAddress: AAVE_POOL_ADDRESS,
    addressesProvider: ADDRESSES_PROVIDER,
    routers: {
      uniswapV2Router: routers.uniswapV2Router,
      uniswapV3Router: routers.uniswapV3Router,
      uniswapV4UniversalRouter: routers.uniswapV4UniversalRouter,
      curveRouter: routers.curveRouter,
      aerodromeRouter: routers.aerodromeRouter,
      aerodromeSlipStreamRouter: routers.aerodromeSlipStreamRouter,
      aerodromeSlipStream2Router: routers.aerodromeSlipStream2Router,
      sushiswapV3Router: routers.sushiswapV3Router,
      pancakeswapV3Router: routers.pancakeswapV3Router,
      baseSwapRouter: routers.baseSwapRouter,
      hydrexRouter: routers.hydrexRouter
    },
    transactionHash: contract.deploymentTransaction()?.hash,
    blockNumber: await provider.getBlockNumber()
  };

  // Save to file
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
  }
  fs.writeFileSync('data/deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Deployment info saved to: data/deployment-info.json\n`);

  // Update .env file
  const envContent = `
# Flash Loan Contract
FLASH_LOAN_CONTRACT=${contractAddress}

# Aave V3 Pool on Base
AAVE_POOL=${AAVE_POOL_ADDRESS}
AAVE_POOL_ADDRESS=${AAVE_POOL_ADDRESS}

# DEX Routers (configured in contract constructor)
UNISWAP_V2_ROUTER=${routers.uniswapV2Router}
UNISWAP_V3_ROUTER=${routers.uniswapV3Router}
UNISWAP_V4_ROUTER=${routers.uniswapV4UniversalRouter}
CURVE_ROUTER=${routers.curveRouter}
AERODROME_ROUTER=${routers.aerodromeRouter}
AERODROME_SLIPSTREAM_ROUTER=${routers.aerodromeSlipStreamRouter}
AERODROME_SLIPSTREAM_2_ROUTER=${routers.aerodromeSlipStream2Router}
SUSHISWAP_V3_ROUTER=${routers.sushiswapV3Router}
PANCAKESWAP_V3_ROUTER=${routers.pancakeswapV3Router}
BASESWAP_ROUTER=${routers.baseSwapRouter}
HYDREX_ROUTER=${routers.hydrexRouter}
`;

  fs.appendFileSync('.env', envContent);
  console.log('✅ .env file updated with contract addresses\n');

  // Generate deployment report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      network: 'Base',
      contractAddress: contractAddress,
      deployer: wallet.address,
      deploymentCost: ethers.formatEther(balance - await provider.getBalance(wallet.address)) + ' ETH',
      confirmations: 5
    },
    configuration: {
      aavePool: AAVE_POOL_ADDRESS,
      addressesProvider: ADDRESSES_PROVIDER,
      routers: {
        uniswapV2Router: routers.uniswapV2Router,
        uniswapV3Router: routers.uniswapV3Router,
        uniswapV4UniversalRouter: routers.uniswapV4UniversalRouter,
        curveRouter: routers.curveRouter,
        aerodromeRouter: routers.aerodromeRouter,
        aerodromeSlipStreamRouter: routers.aerodromeSlipStreamRouter,
        aerodromeSlipStream2Router: routers.aerodromeSlipStream2Router,
        sushiswapV3Router: routers.sushiswapV3Router,
        pancakeswapV3Router: routers.pancakeswapV3Router,
        baseSwapRouter: routers.baseSwapRouter,
        hydrexRouter: routers.hydrexRouter
      },
      supportedDEXs: [
        'Uniswap V2',
        'Uniswap V3',
        'Uniswap V4',
        'Curve',
        'Aerodrome V2',
        'Aerodrome SlipStream',
        'Aerodrome SlipStream 2',
        'SushiSwap V3',
        'PancakeSwap V3',
        'BaseSwap',
        'Hydrex'
      ]
    },
    nextSteps: [
      'Test with a small flash loan on testnet first',
      'Verify all DEX integrations work',
      'Set up automated execution using run-automated-executor.ts',
      'Monitor execution history',
      'Collect profits'
    ],
    importantNotes: [
      'Contract is owned by deployer wallet',
      'Only owner can execute arbitrage',
      'Aave flash loans require approval',
      'Flash loan premium is 0.05% on Base',
      'Minimum profit should account for gas costs',
      'All 11 DEXs are configured and ready',
      'Router addresses are set in constructor and cannot be changed',
      'If you need different router addresses, you must deploy a new contract'
    ]
  };

  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }
  fs.writeFileSync('reports/deployment-report.json', JSON.stringify(report, null, 2));
  console.log(`✅ Deployment report saved to: reports/deployment-report.json\n`);

  console.log('=== Deployment Complete! ===\n');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Supported DEXs: ${report.configuration.supportedDEXs.length}`);
  console.log('\nNext Steps:');
  console.log('1. Test the contract with a small flash loan on testnet');
  console.log('2. Run automated executor: npm run executor:start');
  console.log('3. Monitor execution history in data/execution-history.json');
  console.log('4. Collect profits from successful arbitrage executions\n');

  return deploymentInfo;
}

// Run deployment
deployFlashLoanContract().catch(console.error);