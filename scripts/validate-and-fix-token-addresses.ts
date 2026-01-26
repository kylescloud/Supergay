import { ethers } from 'ethers';
import fs from 'fs';

// BaseScan API for token validation
const BASESCAN_API_KEY = 'YourApiKeyHere'; // You can get a free key from basescan.org
const BASESCAN_API_URL = 'https://api.basescan.org/api';

// Known valid Base tokens (flash loan assets)
const KNOWN_VALID_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDB6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  WBTC: '0x1cea84203673764244e05693e42e6ace62be9ba5',
  LINK: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196',
  UNI: '0x483d65783497475b646097218237c9A4c5aDAb9C',
  AAVE: '0xaD341aC6C4B13f3Afe910A3Cb7C5F462C3EB4ba6',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
};

/**
 * Check if an address is valid and checksummed
 */
function isValidAddress(address: string): boolean {
  try {
    const checksummed = ethers.getAddress(address);
    return checksummed === address;
  } catch (error) {
    return false;
  }
}

/**
 * Validate a token address by checking if it's checksummed
 */
function validateAddress(address: string): { valid: boolean; checksummed?: string; error?: string } {
  try {
    const checksummed = ethers.getAddress(address);
    return {
      valid: true,
      checksummed,
    };
  } catch (error) {
    return {
      valid: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Read and parse the top-200-tokens.ts file
 */
function readTokenFile(): { tokens: Record<string, string>; content: string } {
  const content = fs.readFileSync('src/config/top-200-tokens.ts', 'utf8');
  
  // Extract token addresses using regex (handle smart quotes and regular quotes)
  const tokenPattern = /(\w+):\s*[''""“”]([0-9a-fA-F]{40})[''""“”]/g;
  const tokens: Record<string, string> = {};
  let match;
  
  while ((match = tokenPattern.exec(content)) !== null) {
    const symbol = match[1];
    const address = match[2];
    tokens[symbol] = address;
  }
  
  return { tokens, content };
}

/**
 * Main validation function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Token Address Validation and Fix');
  console.log('='.repeat(80));
  console.log('');
  
  const { tokens, content } = readTokenFile();
  
  console.log(`Found ${Object.keys(tokens).length} tokens to validate`);
  console.log('');
  
  let validCount = 0;
  let invalidCount = 0;
  let knownValidCount = 0;
  const invalidTokens: Array<{ symbol: string; address: string; error: string }> = [];
  const fixedTokens: Array<{ symbol: string; original: string; fixed: string }> = [];
  
  for (const [symbol, address] of Object.entries(tokens)) {
    const validation = validateAddress(address);
    
    if (!validation.valid) {
      console.log(`❌ ${symbol}: ${address}`);
      console.log(`   Error: ${validation.error}`);
      
      // Check if it's a known valid token
      if (KNOWN_VALID_TOKENS[symbol as keyof typeof KNOWN_VALID_TOKENS]) {
        const correctAddress = KNOWN_VALID_TOKENS[symbol as keyof typeof KNOWN_VALID_TOKENS];
        console.log(`   ✓ Found correct address: ${correctAddress}`);
        fixedTokens.push({
          symbol,
          original: address,
          fixed: correctAddress,
        });
        knownValidCount++;
      }
      
      invalidTokens.push({
        symbol,
        address,
        error: validation.error || 'Invalid checksum',
      });
      invalidCount++;
    } else {
      console.log(`✅ ${symbol}: ${address}`);
      validCount++;
    }
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Total Tokens: ${Object.keys(tokens).length}`);
  console.log(`Valid Tokens: ${validCount}`);
  console.log(`Invalid Tokens: ${invalidCount}`);
  console.log(`Known Valid Fixes: ${knownValidCount}`);
  console.log('');
  
  if (fixedTokens.length > 0) {
    console.log('Tokens that can be fixed:');
    fixedTokens.forEach(token => {
      console.log(`  ${token.symbol}: ${token.original} -> ${token.fixed}`);
    });
    console.log('');
  }
  
  if (invalidTokens.length - fixedTokens.length > 0) {
    console.log('Tokens that need manual research:');
    invalidTokens
      .filter(token => !fixedTokens.find(f => f.symbol === token.symbol))
      .forEach(token => {
        console.log(`  ${token.symbol}: ${token.address}`);
      });
    console.log('');
  }
  
  // Ask if user wants to apply fixes
  if (fixedTokens.length > 0) {
    console.log('Would you like to apply the known valid fixes? (This will update top-200-tokens.ts)');
    console.log('To apply fixes manually, edit src/config/top-200-tokens.ts and replace the addresses.');
  }
}

main()
  .then(() => {
    console.log('');
    console.log('✅ Validation complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error(`❌ Validation failed: ${error}`);
    process.exit(1);
  });