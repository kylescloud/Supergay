import { ethers } from 'ethers';
import { config } from 'dotenv';
import * as fs from 'fs';
import { FlashLoanArbitrageEnhanced__factory } from '../artifacts/contracts/FlashLoanArbitrageEnhanced.sol/FlashLoanArbitrageEnhanced.js';

config();

async function deployFlashLoanContract() {
  console.log('=== Deploying Flash Loan Arbitrage Enhanced Contract ===\n');

  // Get configuration
  const RPC_URL = process.env.RPC_URL || 'https://base-rpc.publicnode.com';
  const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
  const AAVE_POOL_ADDRESS = '0xA238Dd80C259a72e81d7e4b422E3588869B8325B';

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
  console.log('Deploying FlashLoanArbitrageEnhanced contract...');
  const factory = new FlashLoanArbitrageEnhanced__factory(wallet);
  
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed to: ${contractAddress}\n`);

  // Wait for a few block confirmations
  console.log('Waiting for block confirmations...');
  await contract.deploymentTransaction()?.wait(5);
  console.log('✅ Contract confirmed!\n');

  // Configure DEX routers
  console.log('Configuring DEX routers...');
  const routers = {
    uniswapV2Router: '0x4752ba5DBC23f44D87826276BF6Fd6b1C1252c36',
    uniswapV3Router: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    aerodromeRouter: '0xcfE90b3E7d4C8b2d11C5115D6240226F2F5fd937',
    alienBaseRouter: '0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7',
    swapBasedRouter: '0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066'
  };

  const tx = await contract.setRouters(
    routers.uniswapV2Router,
    routers.uniswapV3Router,
    routers.aerodromeRouter,
    routers.alienBaseRouter,
    routers.swapBasedRouter
  );
  await tx.wait();
  console.log('✅ DEX routers configured!\n');

  // Get contract owner
  const owner = await contract.owner();
  console.log(`Contract Owner: ${owner}`);

  // Save deployment information
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: 'Base',
    deployer: wallet.address,
    contractAddress: contractAddress,
    aavePoolAddress: AAVE_POOL_ADDRESS,
    routers: routers,
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

# DEX Routers
UNISWAP_V2_ROUTER=${routers.uniswapV2Router}
UNISWAP_V3_ROUTER=${routers.uniswapV3Router}
AERODROME_ROUTER=${routers.aerodromeRouter}
ALIENBASE_ROUTER=${routers.alienBaseRouter}
SWAPBASED_ROUTER=${routers.swapBasedRouter}
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
      routers: routers,
      supportedDEXs: [
        'Uniswap V2',
        'Uniswap V3',
        'Aerodrome',
        'AlienBase',
        'SwapBased'
      ]
    },
    nextSteps: [
      'Fund the contract with ETH for gas (optional, wallet pays gas)',
      'Test with a small flash loan',
      'Set up automated execution using run-automated-executor.ts',
      'Monitor execution history',
      'Collect profits'
    ],
    importantNotes: [
      'Contract is owned by deployer wallet',
      'Only owner can execute arbitrage',
      'Aave flash loans require approval',
      'Flash loan premium is 0.05% on Base',
      'Minimum profit should account for gas costs'
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
  console.log('1. Test the contract with a small flash loan');
  console.log('2. Run automated executor: npm run execute-arbitrage');
  console.log('3. Monitor execution history in data/execution-history.json');
  console.log('4. Collect profits from successful arbitrage executions\n');

  return deploymentInfo;
}

// Run deployment
deployFlashLoanContract().catch(console.error);