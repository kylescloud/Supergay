const { getAddress } = require('ethers');
const fs = require('fs');
const path = require('path');

// Read the constants file
const constantsPath = path.join(__dirname, '../src/config/constants.ts');
let content = fs.readFileSync(constantsPath, 'utf8');

// Map of addresses to fix (current incorrect -> correct checksum)
const addresses = {
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDbC (check if correct)
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI (check if correct)
  '0x2Ae3F1Ec7F1F5012CF12ab14Ad75ca5A5d9f83e8': '0x2Ae3F1Ec7F1F5012CF12ab14Ad75ca5A5d9f83e8', // WBTC (check if correct)
  '0xfde4C96c8593536E31F229EA8f37b2ADa39a4E7d': '0xfde4C96c8593536E31F229EA8f37b2ADa39a4E7d', // CBETH (check if correct)
  '0xd9d80F5316615B599b88e3e81Ce66fA0c37E9d84': '0xd9d80F5316615B599b88e3e81Ce66fA0c37E9d84', // Check all
};

// Try to get correct checksum for each address
console.log('Fixing address checksums...\n');
for (const [oldAddress, suggestedFix] of Object.entries(addresses)) {
  try {
    // Try to get the proper checksum
    const checksummed = getAddress(oldAddress);
    console.log(`${oldAddress} -> ${checksummed}`);
    
    // Replace in content
    content = content.replace(new RegExp(oldAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), checksummed);
  } catch (error) {
    console.log(`Error with ${oldAddress}: ${error.message}`);
  }
}

// Write back
fs.writeFileSync(constantsPath, content);
console.log('\n✅ Checksums fixed and saved to constants.ts');