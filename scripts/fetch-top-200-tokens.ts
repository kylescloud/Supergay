import axios from 'axios';

interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
}

interface TokenAddress {
  id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  market_cap: number;
  market_cap_rank: number;
}

async function fetchTop200BaseTokens(): Promise<CoinGeckoToken[]> {
  console.log('Fetching top 200 Base tokens from CoinGecko...');
  
  const response = await axios.get(
    'https://api.coingecko.com/api/v3/coins/markets',
    {
      params: {
        vs_currency: 'usd',
        category: 'base-ecosystem',
        order: 'market_cap_desc',
        per_page: 200,
        page: 1,
        sparkline: false,
      },
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  console.log(`✅ Found ${response.data.length} tokens`);
  return response.data;
}

async function getTokenAddresses(tokens: CoinGeckoToken[]): Promise<TokenAddress[]> {
  console.log('\nFetching contract addresses for tokens...');
  
  const tokensWithAddresses: TokenAddress[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      // Get token details to find contract addresses
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${token.id}`,
        {
          params: {
            localization: false,
            tickers: false,
            market_data: false,
            community_data: false,
            developer_data: false,
            sparkline: false,
          },
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      const tokenData = response.data;
      
      // Find Base contract address
      const platforms = tokenData.platforms || {};
      let baseAddress = platforms['base'];
      
      // If no Base address found, try common alternatives
      if (!baseAddress) {
        // Check for ethereum-mainnet or other variations
        const possibleKeys = Object.keys(platforms).filter(
          key => key.includes('base') || key.includes('ethereum')
        );
        
        if (possibleKeys.length > 0) {
          baseAddress = platforms[possibleKeys[0]];
        }
      }

      if (baseAddress && baseAddress !== '') {
        tokensWithAddresses.push({
          id: token.id,
          symbol: token.symbol.toUpperCase(),
          name: token.name,
          address: baseAddress,
          decimals: 18, // Default to 18, will be verified later
          market_cap: token.market_cap,
          market_cap_rank: token.market_cap_rank,
        });
        console.log(`✅ ${token.symbol}: ${baseAddress}`);
      } else {
        errors.push(`${token.symbol} (${token.id}): No Base address found`);
        console.log(`❌ ${token.symbol}: No Base address found`);
      }

      // Rate limiting - CoinGecko allows ~10 calls/minute for free tier
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      const errorMsg = `${token.symbol} (${token.id}): ${error}`;
      errors.push(errorMsg);
      console.log(`❌ ${token.symbol}: ${error}`);
    }
  }

  console.log(`\n✅ Successfully fetched ${tokensWithAddresses.length} token addresses`);
  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} tokens failed:\n`);
    errors.forEach(err => console.log(`  - ${err}`));
  }

  return tokensWithAddresses;
}

function generateTokenConfig(tokens: TokenAddress[]): string {
  // Separate tokens into categories
  const flashLoanAssets = [
    'WETH', 'cbETH', 'USDbC', 'wstETH', 'USDC', 'weETH', 'cbBTC', 
    'ezETH', 'GHO', 'wrsETH', 'LBTC', 'EURC', 'AAVE', 'tBTC'
  ];

  const baseTokens = tokens.filter(t => flashLoanAssets.includes(t.symbol));
  const quoteTokens = tokens.filter(t => !flashLoanAssets.includes(t.symbol));

  let output = `// Top 200 Base Tokens - Generated on ${new Date().toISOString()}\n`;
  output += `// Base: ${baseTokens.length} flash loan assets | Quote: ${quoteTokens.length} tokens\n\n`;

  // Generate TOKENS object (14 flash loan assets only - using existing addresses)
  output += `// Aave V3 Flash Loan Borrowable Assets on Base (14 tokens)\n`;
  output += `export const FLASH_LOAN_ASSETS = {\n`;
  baseTokens.forEach((token, index) => {
    const comma = index < baseTokens.length - 1 ? ',' : '';
    output += `  ${token.symbol}: '${token.address}'${comma} // Rank #${token.market_cap_rank} - ${token.name}\n`;
  });
  output += `} as const;\n\n`;

  // Generate QUOTE_TOKENS object (top 186 tokens)
  output += `// Top Quote Tokens on Base (excluding flash loan assets)\n`;
  output += `export const QUOTE_TOKENS = {\n`;
  quoteTokens.forEach((token, index) => {
    const comma = index < quoteTokens.length - 1 ? ',' : '';
    output += `  ${token.symbol}: '${token.address}'${comma} // Rank #${token.market_cap_rank} - ${token.name}\n`;
  });
  output += `} as const;\n\n`;

  // Generate TOKEN_METADATA
  output += `// Token Metadata (for pool discovery and swaps)\n`;
  output += `export const TOKEN_METADATA: Record<string, { decimals: number; symbol: string; name: string }> = {\n`;
  tokens.forEach((token, index) => {
    const comma = index < tokens.length - 1 ? ',' : '';
    output += `  ${token.symbol}: { decimals: ${token.decimals}, symbol: '${token.symbol}', name: '${token.name}' }${comma}\n`;
  });
  output += `} as const;\n\n`;

  // Generate all tokens combined
  output += `// All tokens combined for convenience\n`;
  output += `export const ALL_TOKENS = { ...FLASH_LOAN_ASSETS, ...QUOTE_TOKENS } as const;\n\n`;

  return output;
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('       TOP 200 BASE TOKENS FETCHER');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const tokens = await fetchTop200BaseTokens();
    const tokensWithAddresses = await getTokenAddresses(tokens);

    // Generate config file
    const config = generateTokenConfig(tokensWithAddresses);
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '..', 'data', 'top-200-base-tokens.ts');
    
    fs.writeFileSync(outputPath, config, 'utf8');
    console.log(`\n✅ Token configuration saved to: ${outputPath}`);
    
    // Also save as JSON for reference
    const jsonPath = path.join(__dirname, '..', 'data', 'top-200-base-tokens.json');
    fs.writeFileSync(jsonPath, JSON.stringify(tokensWithAddresses, null, 2), 'utf8');
    console.log(`✅ JSON data saved to: ${jsonPath}`);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`       SUMMARY: ${tokensWithAddresses.length} tokens processed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();