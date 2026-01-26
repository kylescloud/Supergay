const { ethers } = require('ethers');
const fs = require('fs');

// Read the top-200-tokens.ts file
let content = fs.readFileSync('src/config/top-200-tokens.ts', 'utf8');

// Find all token addresses in the file
const addressPattern = /'([0-9a-fA-F]{40})'/g;
let match;
let fixedAddresses = [];

while ((match = addressPattern.exec(content)) !== null) {
  const rawAddress = match[1];
  const checksummedAddress = ethers.getAddress(rawAddress);
  
  if (rawAddress !== checksummedAddress) {
    console.log(`Fixing: ${rawAddress} -> ${checksummedAddress}`);
    content = content.replace(rawAddress, checksummedAddress);
    fixedAddresses.push({ original: rawAddress, fixed: checksummedAddress });
  }
}

// Write the fixed content back
fs.writeFileSync('src/config/top-200-tokens.ts', content, 'utf8');

console.log(`\nFixed ${fixedAddresses.length} token addresses`);
console.log('Done!');