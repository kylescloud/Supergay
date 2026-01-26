import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

interface BaseToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidity?: string;
  volume24h?: string;
}

/**
 * Fetch all Base tokens from Coingecko
 */
async function fetchTokensFromCoinGecko(): Promise<BaseToken[]> {
  console.log('🔍 Fetching tokens from CoinGecko...');
  
  const tokens: BaseToken[] = [];
  
  try {
    // Get top 500 coins by market cap
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list', {
      timeout: 30000
    });
    
    const allCoins = response.data;
    console.log(`  Found ${allCoins.length} coins on CoinGecko`);
    
    // Get platform mapping for Base
    for (const coin of allCoins.slice(0, 1000)) {
      try {
        const detailResponse = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coin.id}`,
          { timeout: 5000 }
        );
        
        const platforms = detailResponse.data.platforms || {};
        const baseAddress = platforms['base'];
        
        if (baseAddress && ethers.isAddress(baseAddress)) {
          tokens.push({
            address: ethers.getAddress(baseAddress),
            symbol: detailResponse.data.symbol.toUpperCase(),
            name: detailResponse.data.name,
            decimals: 18, // Default, will update if available
            liquidity: '0',
            volume24h: '0'
          });
        }
      } catch (error) {
        // Skip individual coin errors
      }
      
      if (tokens.length % 50 === 0) {
        console.log(`  Progress: ${tokens.length} Base tokens found...`);
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens on Base`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from CoinGecko: ${error.message}`);
  }
  
  return tokens;
}

/**
 * Fetch tokens from BaseScan token list
 */
async function fetchTokensFromBaseScan(): Promise<BaseToken[]> {
  console.log('\n🔍 Fetching tokens from BaseScan...');
  
  const tokens: BaseToken[] = [];
  
  try {
    // BaseScan API for top tokens
    const response = await axios.get('https://api.basescan.org/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        contractaddress: '0x4200000000000000000000000000000000000006', // WETH
        page: 1,
        offset: 1000,
        sort: 'desc',
        apikey: process.env.BASESCAN_API_KEY || 'YourApiKeyToken'
      },
      timeout: 30000
    });
    
    const transactions = response.data.result || [];
    
    for (const tx of transactions) {
      try {
        const address = ethers.getAddress(tx.contractAddress);
        const symbol = tx.tokenSymbol;
        const name = tx.tokenName;
        
        // Skip duplicates
        if (!tokens.find(t => t.address === address)) {
          tokens.push({
            address,
            symbol,
            name,
            decimals: parseInt(tx.tokenDecimal) || 18
          });
        }
      } catch (error) {
        // Skip invalid addresses
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens from BaseScan`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from BaseScan: ${error.message}`);
  }
  
  return tokens;
}

/**
 * Fetch tokens from DEX Screener
 */
async function fetchTokensFromDexScreener(): Promise<BaseToken[]> {
  console.log('\n🔍 Fetching tokens from DEX Screener...');
  
  const tokens: BaseToken[] = [];
  
  try {
    // Get top Base tokens
    const response = await axios.get(
      'https://api.dexscreener.com/token-orders/base/v1',
      { timeout: 30000 }
    );
    
    // Parse token addresses from order book
    const uniqueAddresses = new Set<string>();
    
    for (const order of response.data.slice(0, 500)) {
      try {
        const address = ethers.getAddress(order.tokenAddress);
        if (!uniqueAddresses.has(address)) {
          uniqueAddresses.add(address);
          tokens.push({
            address,
            symbol: order.tokenSymbol,
            name: order.tokenName || order.tokenSymbol,
            decimals: 18
          });
        }
      } catch (error) {
        // Skip invalid addresses
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens from DEX Screener`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from DEX Screener: ${error.message}`);
  }
  
  return tokens;
}

/**
 * Fetch tokens from SushiSwap token list
 */
async function fetchTokensFromSushiSwap(): Promise<BaseToken[]> {
  console.log('\n🔍 Fetching tokens from SushiSwap...');
  
  const tokens: BaseToken[] = [];
  
  try {
    const response = await axios.get(
      'https://tokens.sushi.com/v0/tokens',
      { timeout: 30000 }
    );
    
    const allTokens = response.data;
    
    for (const [addr, tokenData] of Object.entries(allTokens) as [string, any][]) {
      if (tokenData.chainId === 8453) { // Base chain ID
        try {
          const checksumAddress = ethers.getAddress(addr);
          tokens.push({
            address: checksumAddress,
            symbol: tokenData.symbol.toUpperCase(),
            name: tokenData.name,
            decimals: tokenData.decimals
          });
        } catch (error) {
          // Skip invalid addresses
        }
      }
    }
    
    console.log(`  ✅ Found ${tokens.length} tokens from SushiSwap`);
  } catch (error: any) {
    console.error(`  ❌ Error fetching from SushiSwap: ${error.message}`);
  }
  
  return tokens;
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

/**
 * Validate and clean tokens
 */
function validateTokens(tokens: BaseToken[]): BaseToken[] {
  console.log('\n✅ Validating tokens...');
  
  const valid = tokens.filter(token => {
    // Check address validity
    if (!ethers.isAddress(token.address)) return false;
    
    // Check required fields
    if (!token.symbol || token.symbol.length === 0) return false;
    if (!token.name || token.name.length === 0) return false;
    if (!token.decimals || token.decimals < 0 || token.decimals > 255) return false;
    
    return true;
  });
  
  console.log(`  ✅ Validated ${valid.length}/${tokens.length} tokens`);
  
  return valid;
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

async function main() {
  console.log('═'.repeat(80));
  console.log('COMPREHENSIVE BASE TOKEN DISCOVERY');
  console.log('═'.repeat(80));
  
  // Fetch tokens from multiple sources
  const coinGeckoTokens = await fetchTokensFromCoinGecko();
  const baseScanTokens = await fetchTokensFromBaseScan();
  const dexScreenerTokens = await fetchTokensFromDexScreener();
  const sushiSwapTokens = await fetchTokensFromSushiSwap();
  
  // Merge all tokens
  const mergedTokens = mergeTokens(
    coinGeckoTokens,
    baseScanTokens,
    dexScreenerTokens,
    sushiSwapTokens
  );
  
  // Add known tokens
  const tokensWithKnown = addKnownTokens(mergedTokens);
  
  // Validate tokens
  const validTokens = validateTokens(tokensWithKnown);
  
  // Sort by symbol
  validTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  // Save to file
  const outputPath = path.join('data', 'base-tokens.json');
  const outputData = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    chainId: 8453,
    network: 'base',
    totalTokens: validTokens.length,
    tokens: validTokens
  };
  
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log('DISCOVERY SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total Tokens Discovered: ${validTokens.length}`);
  console.log(`Saved to: ${outputPath}`);
  console.log('\n✅ Token discovery completed!');
  
  // Show sample tokens
  console.log('\n📊 Sample tokens:');
  for (const token of validTokens.slice(0, 20)) {
    console.log(`  ${token.symbol.padEnd(10)} - ${token.address} - ${token.name}`);
  }
}

main().catch(console.error);