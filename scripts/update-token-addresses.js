const { getAddress } = require('ethers');
const fs = require('fs');
const path = require('path');

// Correct addresses (lowercase first, then checksum)
const correctAddresses = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  USDbC: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca',
  DAI: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
  WBTC: '0x2ae3f1ec7f1f5012cf12ab14ad75ca5a5d9f83e8',
  CBETH: '0xfde4c96c8593536e31f229ea8f37b2ada39a4e7d',
};

// Read constants file
const constantsPath = path.join(__dirname, '../src/config/constants.ts');
let content = fs.readFileSync(constantsPath, 'utf8');

console.log('Updating token addresses with correct checksums...\n');

// Update each token address
for (const [token, address] of Object.entries(correctAddresses)) {
  const checksummed = getAddress(address);
  console.log(`${token}: ${checksummed}`);
  
  // Replace the old incorrect address with the correct one
  // Match patterns like: USDC: '0x...'
  const regex = new RegExp(`${token}:\\s*'[^']*'`, 'g');
  content = content.replace(regex, `${token}: '${checksummed}'`);
  
  // Also update any WETH_ADDRESS constants etc
  const tokenConstRegex = new RegExp(`${token}_ADDRESS\\s*=\\s*'[^']*'`, 'g');
  content = content.replace(tokenConstRegex, `${token}_ADDRESS = '${checksummed}'`);
}

// Write back
fs.writeFileSync(constantsPath, content);
console.log('\n✅ Token addresses updated with correct checksums');