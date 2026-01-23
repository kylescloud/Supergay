import { ethers } from 'hardhat';
import { config } from '../src/config';

async function main() {
  console.log('Verifying FlashLoanArbitrage contract...');

  const contractAddress = config.flashLoanReceiver;
  
  if (!contractAddress) {
    throw new Error('FLASH_LOAN_RECEIVER not set in .env');
  }

  const poolAddressesProvider = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';

  console.log('Verifying contract at:', contractAddress);
  console.log('Constructor args:', poolAddressesProvider);

  try {
    await hre.run('verify:verify', {
      address: contractAddress,
      constructorArguments: [poolAddressesProvider],
      network: 'base',
    });
    console.log('Contract verified successfully!');
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('Contract is already verified');
    } else {
      console.error('Verification failed:', error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });