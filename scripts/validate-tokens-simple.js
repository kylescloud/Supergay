const { ethers } = require('ethers');
const fs = require('fs');

console.log('='.repeat(80));
console.log('Token Address Validation');
console.log('='.repeat(80));
console.log('');

const content = fs.readFileSync('src/config/top-200-tokens.ts', 'utf8');

// Extract all addresses from the file
const addressPattern = /0x[a-fA-F0-9]{40}/g;
const addresses = content.match(addressPattern) || [];

console.log(`Found ${addresses.length} addresses in the file`);
console.log('');

let validCount = 0;
let invalidCount = 0;
const invalidAddresses = [];

addresses.forEach(address => {
  try {
    const checksummed = ethers.getAddress(address);
    if (address === checksummed) {
      validCount++;
    } else {
      console.log(`⚠️  Invalid checksum: ${address}`);
      console.log(`   Correct checksum:  ${checksummed}`);
      invalidAddresses.push({ original: address, corrected: checksummed });
      invalidCount++;
    }
  } catch (error) {
    console.log(`❌ Invalid address: ${address}`);
    console.log(`   Error: ${error.message}`);
    invalidAddresses.push({ original: address, corrected: null, error: error.message });
    invalidCount++;
  }
});

console.log('');
console.log('='.repeat(80));
console.log('Summary');
console.log('='.repeat(80));
console.log(`Total Addresses: ${addresses.length}`);
console.log(`Valid Addresses: ${validCount}`);
console.log(`Invalid Addresses: ${invalidCount}`);
console.log('');

if (invalidAddresses.length > 0) {
  console.log('Invalid addresses found:');
  invalidAddresses.forEach(addr => {
    console.log(`  ${addr.original}`);
    if (addr.corrected) {
      console.log(`    → ${addr.corrected}`);
    } else {
      console.log(`    → Cannot be fixed (invalid format)`);
    }
  });
  console.log('');
}

console.log('To fix these addresses, update src/config/top-200-tokens.ts');
console.log('='.repeat(80));