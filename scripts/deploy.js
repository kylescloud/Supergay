"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hardhat_1 = require("hardhat");
const config_1 = require("../src/config");
async function main() {
    console.log('Deploying FlashLoanArbitrage contract to Base...');
    // Validate configuration
    config_1.config.validate();
    // Get deployer account
    const [deployer] = await hardhat_1.ethers.getSigners();
    console.log('Deploying with account:', deployer.address);
    console.log('Account balance:', hardhat_1.ethers.formatEther(await hardhat_1.ethers.provider.getBalance(deployer.address)));
    // Aave PoolAddressesProvider on Base
    const poolAddressesProvider = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';
    // Deploy FlashLoanArbitrage contract
    const FlashLoanArbitrage = await hardhat_1.ethers.getContractFactory('FlashLoanArbitrage');
    const flashLoanArbitrage = await FlashLoanArbitrage.deploy(poolAddressesProvider);
    await flashLoanArbitrage.waitForDeployment();
    const contractAddress = await flashLoanArbitrage.getAddress();
    console.log('FlashLoanArbitrage deployed to:', contractAddress);
    // Wait for a few block confirmations
    console.log('Waiting for block confirmations...');
    await flashLoanArbitrage.deploymentTransaction()?.wait(5);
    // Verify deployment
    const owner = await flashLoanArbitrage.owner();
    const pool = await flashLoanArbitrage.getContractInfo();
    console.log('\nDeployment Info:');
    console.log('- Owner:', owner);
    console.log('- Pool:', pool._pool);
    console.log('- Min Profit:', hardhat_1.ethers.formatEther(pool._minProfit), 'ETH');
    console.log('- Max Gas Price:', pool._maxGasPrice.toString(), 'wei');
    // Approve WETH for trading (if needed)
    const wethAddress = '0x4200000000000000000000000000000000000006';
    const weth = await hardhat_1.ethers.getContractAt('IERC20', wethAddress);
    console.log('\nApproving WETH...');
    const approveTx = await weth.approve(contractAddress, hardhat_1.ethers.MaxUint256);
    await approveTx.wait();
    console.log('WETH approved');
    console.log('\n=== Deployment Complete ===');
    console.log('Contract Address:', contractAddress);
    console.log('Transaction Hash:', flashLoanArbitrage.deploymentTransaction()?.hash);
    console.log('\n=== Next Steps ===');
    console.log('1. Add contract address to .env file:');
    console.log(`   FLASH_LOAN_RECEIVER=${contractAddress}`);
    console.log('2. Verify contract on BaseScan:');
    console.log(`   npx hardhat verify --network base ${contractAddress} ${poolAddressesProvider}`);
    console.log('3. Fund contract with ETH for gas:');
    console.log(`   cast send ${contractAddress} --value 0.1ether`);
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=deploy.js.map