import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

interface BaseToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Fetch tokens from DEX Screener API (fast)
 */
async function fetchTokensFromDexScreener(): Promise<BaseToken[]> {
  console.log('🔍 Fetching tokens from DEX Screener...');
  
  const tokens: BaseToken[] = [];
  const tokenMap = new Map<string, BaseToken>();
  
  try {
    // Fetch top pairs on Base
    const response = await axios.get(
      'https://api.dexscreener.com/latest/dex/search?q=base',
      { timeout: 30000 }
    );
    
    const pairs = response.data.pairs || [];
    console.log(`  Found ${pairs.length} pairs on Base`);
    
    for (const pair of pairs) {
      try {
        if (pair.chainId !== 'base') continue;
        
        // Extract tokens from pair
        const baseToken = pair.baseToken;
        const quoteToken = pair.quoteToken;
        
        [baseToken, quoteToken].forEach(token => {
          try {
            const address = ethers.getAddress(token.address);
            if (!tokenMap.has(address)) {
              tokenMap.set(address, {
                address,
                symbol: token.symbol.toUpperCase(),
                name: token.name || token.symbol,
                decimals: 18 // Default, will be fetched later if needed
              });
            }
          } catch (error) {
            // Skip invalid addresses
          }
        });
      } catch (error) {
        // Skip pair errors
      }
    }
    
    const uniqueTokens = Array.from(tokenMap.values());
    console.log(`  ✅ Found ${uniqueTokens.length} unique tokens from DEX Screener`);
    return uniqueTokens;
  } catch (error: any) {
    console.error(`  ❌ Error fetching from DEX Screener: ${error.message}`);
    return [];
  }
}

/**
 * Fetch tokens from CoinGecko base assets list (fast)
 */
async function fetchTokensFromCoinGeckoAssets(): Promise<BaseToken[]> {
  console.log('\n🔍 Fetching tokens from CoinGecko...');
  
  const tokens: BaseToken[] = [];
  
  try {
    // Get list of coins on Base platform
    const response = await axios.get(
      'https://tokens.coingecko.com/base/all.json',
      { timeout: 30000 }
    );
    
    const tokenList = response.data.tokens || [];
    console.log(`  Found ${tokenList.length} tokens on CoinGecko`);
    
    for (const token of tokenList) {
      try {
        const address = ethers.getAddress(token.address);
        tokens.push({
          address,
          symbol: token.symbol.toUpperCase(),
          name: token.name,
          decimals: token.decimals || 18
        });
      } catch (error) {
        // Skip invalid addresses
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens from CoinGecko`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from CoinGecko: ${error.message}`);
  }
  
  return tokens;
}

/**
 * Fetch tokens from 1inch token list (fast)
 */
async function fetchTokensFrom1inch(): Promise<BaseToken[]> {
  console.log('\n🔍 Fetching tokens from 1inch...');
  
  const tokens: BaseToken[] = [];
  
  try {
    const response = await axios.get(
      'https://tokens.1inch.io/v1.2/8453',
      { timeout: 30000 }
    );
    
    for (const [address, tokenData] of Object.entries(response.data) as [string, any][]) {
      try {
        const checksumAddress = ethers.getAddress(address);
        tokens.push({
          address: checksumAddress,
          symbol: tokenData.symbol.toUpperCase(),
          name: tokenData.name,
          decimals: parseInt(tokenData.decimals) || 18
        });
      } catch (error) {
        // Skip invalid addresses
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens from 1inch`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from 1inch: ${error.message}`);
  }
  
  return tokens;
}

/**
 * Add known Base tokens
 */
function addKnownTokens(tokens: BaseToken[]): BaseToken[] {
  console.log('\n📋 Adding known Base tokens...');
  
  const knownTokens: BaseToken[] = [
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', name: 'USD Base Coin', decimals: 6 },
    { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
    { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped Lido Staked ETH', decimals: 18 },
    { address: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A', symbol: 'weETH', name: 'Wrapped eETH', decimals: 18 },
    { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', decimals: 8 },
    { address: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', symbol: 'tBTC', name: 'tBTC', decimals: 18 },
    { address: '0x6Bb7c9e0dDd5f7871e30A870e91A4f16f9cb10Ee', symbol: 'GHO', name: 'GHO Stablecoin', decimals: 18 },
    { address: '0x6370E0331e9C9dF4398f5a8e7d69c5F269dd7c1b', symbol: 'AAVE', name: 'Aave', decimals: 18 },
    { address: '0x2416092f143378750bb29b79eD961ab195CcEea5', symbol: 'ezETH', name: 'Renzo Restaked ETH', decimals: 18 },
    { address: '0xEDfa23602C7F3c7D0e3d82fd74c8A37ddabbea0E', symbol: 'wrsETH', name: 'Wrapped Rocket Pool ETH', decimals: 18 },
    { address: '0xecAcaF1E1c1cbB7c039711F7e07fC7F4A1eAa1c1', symbol: 'LBTC', name: 'LayerZero BTC', decimals: 8 },
    { address: '0x60a3e35c9b3f2e0e8d5dd0e29b5d9e9e26f4db42', symbol: 'EURC', name: 'Euro Coin', decimals: 6 },
  ];
  
  const tokenMap = new Map<string, BaseToken>(tokens.map(t => [t.address, t]));
  
  for (const known of knownTokens) {
    const existing = tokenMap.get(known.address);
    if (!existing) {
      tokenMap.set(known.address, known);
    } else {
      // Update with known data
      Object.assign(existing, known);
    }
  }
  
  const updated = Array.from(tokenMap.values());
  console.log(`  ✅ Added/updated known tokens. Total: ${updated.length}`);
  
  return updated;
}

/**
 * Merge and deduplicate tokens
 */
function mergeTokens(...tokenLists: BaseToken[][]): BaseToken[] {
  console.log('\n🔄 Merging and deduplicating tokens...');
  
  const tokenMap = new Map<string, BaseToken>();
  
  for (const tokenList of tokenLists) {
    for (const token of tokenList) {
      const existing = tokenMap.get(token.address);
      
      if (!existing) {
        tokenMap.set(token.address, token);
      } else {
        // Merge metadata, prefer more complete data
        if (!existing.name && token.name) existing.name = token.name;
        if (!existing.symbol && token.symbol) existing.symbol = token.symbol;
        if (!existing.decimals && token.decimals) existing.decimals = token.decimals;
      }
    }
  }
  
  const merged = Array.from(tokenMap.values());
  console.log(`  ✅ Merged to ${merged.length} unique tokens`);
  
  return merged;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('COMPREHENSIVE BASE TOKEN DISCOVERY (FAST)');
  console.log('═'.repeat(80));
  
  // Fetch tokens from multiple sources
  const dexScreenerTokens = await fetchTokensFromDexScreener();
  const coingeckoTokens = await fetchTokensFromCoinGeckoAssets();
  const oneInchTokens = await fetchTokensFrom1inch();
  
  // Merge all tokens
  const mergedTokens = mergeTokens(
    dexScreenerTokens,
    coingeckoTokens,
    oneInchTokens
  );
  
  // Add known tokens
  const tokensWithKnown = addKnownTokens(mergedTokens);
  
  // Sort by symbol
  tokensWithKnown.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  // Save to file
  const outputPath = path.join('data', 'base-tokens.json');
  const outputData = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    chainId: 8453,
    network: 'base',
    totalTokens: tokensWithKnown.length,
    tokens: tokensWithKnown
  };
  
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('DISCOVERY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Tokens Discovered: ${tokensWithKnown.length}`);
  console.log(`Saved to: ${outputPath}`);
  console.log('\n✅ Token discovery completed!');
  
  // Show sample tokens
  console.log('\n📊 Sample tokens:');
  for (const token of tokensWithKnown.slice(0, 20)) {
    console.log(`  ${token.symbol.padEnd(10)} - ${token.address} - ${token.name}`);
  }
}

main().catch(console.error);