# Top 200 Base Tokens - Pool Discovery Guide

## Overview

This guide explains the enhanced pool discovery system that supports arbitrage opportunities across the top 200 Base tokens. The system discovers pools for 14 flash loan assets paired with 186 additional quote tokens across 10 different DEXs on Base.

## Architecture

### Token Structure

The system uses a two-tier token structure:

1. **Base Tokens (Flash Loan Assets)**: 14 tokens available for Aave V3 flash loans
2. **Quote Tokens**: 186 additional tokens by market cap

**Total Token Combinations**: 14 × 186 = 2,604 trading pairs

### Supported DEXs

The system discovers pools across 10 DEXs:

1. Uniswap V4 (CL AMM)
2. Uniswap V3 (CL AMM)
3. Uniswap V2 (AMM)
4. Curve Finance (Stableswap)
5. SushiSwap V3 (CL AMM)
6. PancakeSwap V3 (CL AMM)
7. Aerodrome (V2-style)
8. Aerodrome SlipStream (V3-style CL AMM)
9. Aerodrome SlipStream 2 (V3-style CL AMM)
10. BaseSwap (V2-style)

**Total Potential Pools**: 2,604 pairs × 10 DEXs = 26,040 potential pools

## Configuration

### Flash Loan Assets

Located in `src/config/constants.ts`:

```typescript
export const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  weETH: '0x04C0599Ae5A44757c0af6F9eC3B93da8976c150A',
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  ezETH: '0x2416092f143378750bb29b79eD961ab195CcEea5',
  GHO: '0xc4bF5CbDaBE595361438F8cD74434c1978525A66',
  wrsETH: '0x657E8B86fC848E6eA977343C34d172ADc4d1B014',
  LBTC: '0xecAcaF1E1c1cbB7C039711F7e07fC7F4A1EaA1c1',
  EURC: '0x60a3e35c9B3F2E0E8D5dD0e29B5D9E9E26f4db42',
  AAVE: '0x6370E0331e9C9dF4398f5a8e7d69c5F269dd7c1b',
  tBTC: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b',
} as const;
```

### Quote Tokens

Located in `src/config/top-200-tokens.ts`:

```typescript
export const QUOTE_TOKENS = {
  WBTC: '0x1cea84203673764244e05693e42e6ace62be9ba5',
  WEETH: '0x04C0599Ae5A44757c0af6F9eC3B93da8976c150A',
  LINK: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196',
  // ... 186 total tokens
} as const;
```

## Usage

### Running Pool Discovery

```bash
# Discover pools for all Top 200 tokens
npx ts-node scripts/discover-and-test.ts
```

### Custom Discovery Options

```typescript
import { Top200PoolDiscovery } from './src/pools/discoveryTop200';

const discovery = new Top200PoolDiscovery(
  rpcUrls,
  dexConfigs
);

const result = await discovery.discoverAllPools({
  batchSize: 50,              // Pairs per batch
  delayBetweenBatches: 200,   // Delay between batches (ms)
  delayBetweenDEXs: 500,      // Delay between DEXs (ms)
  skipDEXs: [],               // DEXs to skip
  minLiquidity: 1000n * 10n ** 18n  // Minimum liquidity ($1000)
});

console.log(`Found ${result.pools.length} pools`);
```

## Pool Discovery Process

### 1. Token Pair Generation

The system generates all possible trading pairs:

```typescript
generateTokenPairs(): TokenPair[] {
  const pairs: TokenPair[] = [];
  
  for (const [baseSymbol, baseAddress] of this.baseTokens.entries()) {
    for (const [quoteSymbol, quoteAddress] of this.quoteTokens.entries()) {
      if (baseAddress.toLowerCase() !== quoteAddress.toLowerCase()) {
        pairs.push({
          baseToken: baseAddress,
          baseSymbol,
          quoteToken: quoteAddress,
          quoteSymbol
        });
      }
    }
  }
  
  return pairs;
}
```

### 2. Batch Processing

Pairs are processed in batches to manage rate limiting:

```typescript
// Default: 50 pairs per batch
const batches = this.batchPairs(pairs, 50);

for (const batch of batches) {
  const pools = await this.discoverPoolsForBatch(fetcher, dexName, batch);
  // Process pools...
  await this.sleep(200); // Rate limiting delay
}
```

### 3. Pool Discovery per DEX

Each DEX has a dedicated fetcher:

- `UniswapV2Fetcher` - Uses factory contract
- `UniswapV3Fetcher` - Uses factory + quoter
- `UniswapV4Fetcher` - Uses pool manager
- `CurveFetcher` - Uses metapool factory
- And more...

### 4. Pool State Fetching

For each discovered pool, the system fetches:

- **Reserves** (V2): token0 and token1 balances
- **Liquidity** (V3): active liquidity
- **SqrtPriceX96** (V3): current price
- **Tick** (V3): current tick
- **Fee**: trading fee (0.01%, 0.05%, 0.3%, 1%)

### 5. Pool Filtering

Pools are filtered based on:

- Minimum liquidity threshold
- Non-zero reserves/liquidity
- Active status

## Pool Registry

Discovered pools are stored in a JSON registry:

```json
{
  "version": "1.0.0",
  "lastUpdated": 1737812345678,
  "blockNumber": 12345678,
  "network": "base",
  "chainId": 8453,
  "pools": [
    {
      "address": "0x...",
      "dex": "uniswapV3",
      "dexVersion": "v3",
      "token0": {
        "address": "0x...",
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "decimals": 18
      },
      "token1": {
        "address": "0x...",
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6
      },
      "fee": 3000,
      "liquidity": "1234567890123456789",
      "sqrtPriceX96": "1234567890123456789",
      "tick": -123456,
      "isActive": true,
      "lastUpdated": 1737812345678
    }
  ],
  "stats": {
    "totalPools": 12345,
    "poolsByDEX": {
      "uniswapV3": 2345,
      "aerodrome": 1890,
      ...
    },
    "poolsByToken": {
      "WETH": 1234,
      "USDC": 1890,
      ...
    },
    "activePools": 12000
  }
}
```

## Opportunity Finder Integration

The opportunity finder uses the enhanced pool registry to find arbitrage:

```typescript
import { OpportunityFinder } from './src/opportunity/opportunityFinder';

const finder = new OpportunityFinder(rpcUrl, {
  minProfitThreshold: 0.01,  // $0.01 minimum
  maxGasPrice: 10n * 10n ** 9n,  // 10 gwei
  maxSlippage: 0.01  // 1% max
});

const opportunities = await finder.findOpportunities({
  baseToken: '0x4200000000000000000000000000000000000006',  // WETH
  maxHops: 4,
  minProfit: 0.01
});

console.log(`Found ${opportunities.length} opportunities`);
```

## Performance Optimization

### Rate Limiting

The system implements intelligent rate limiting:

```typescript
const rpcManager = new EnhancedRPCManager(rpcUrls, {
  rateLimitPerSecond: 5,    // 5 requests per second
  rateLimitBurst: 10,       // Allow bursts of 10
  maxRetries: 3,            // Retry failed requests
  retryDelay: 1000,         // Initial retry delay
  retryBackoffMultiplier: 2,  // Exponential backoff
  maxRetryDelay: 10000      // Max retry delay
});
```

### Batching Strategy

- **Small batches** (50 pairs): Reduces memory usage
- **Delays between batches**: Avoids rate limiting
- **Parallel DEX processing**: Faster overall discovery
- **Duplicate removal**: Clean final dataset

### Expected Performance

- **Total pairs**: 2,604
- **Total potential pools**: 26,040
- **Expected active pools**: ~5,000-8,000
- **Discovery time**: ~10-20 minutes (depending on network conditions)

## Token Data Sources

The top 200 Base tokens are sourced from:

1. **CoinGecko API**: Market cap ranking
2. **On-chain verification**: Contract addresses
3. **Manual curation**: Token metadata validation

### Updating Token List

To update the token list:

1. Fetch latest data from CoinGecko
2. Verify contract addresses on Base
3. Update `src/config/top-200-tokens.ts`
4. Re-run pool discovery

```bash
# Fetch latest tokens
npx ts-node scripts/fetch-top-200-tokens.ts
```

## Troubleshooting

### Common Issues

1. **Rate Limiting Errors**
   - Increase delays between batches
   - Add more RPC endpoints
   - Reduce batch size

2. **Zero Liquidity Pools**
   - Increase `minLiquidity` threshold
   - Filter pools in post-processing

3. **Duplicate Pools**
   - Check token address normalization
   - Verify DEX-specific deduplication

4. **Memory Issues**
   - Reduce batch size
   - Process DEXs sequentially
   - Clear caches between batches

## Monitoring and Logging

The system provides detailed logging:

```
═══════════════════════════════════════════════════════════════
TOP 200 BASE TOKENS POOL DISCOVERY
═══════════════════════════════════════════════════════════════
Base Tokens: 14 (flash loan assets)
Quote Tokens: 186
Total DEXs: 10
Total Pairs: 2604
═══════════════════════════════════════════════════════════════

[uniswapV3] Processing batch 1/53 (50 pairs)...
[uniswapV3] Batch 1: Found 42/50 pools
[uniswapV3] Processing batch 2/53 (50 pairs)...
...

═══════════════════════════════════════════════════════════════
DISCOVERY COMPLETE
═══════════════════════════════════════════════════════════════
Successful DEXs: 10/10
Total Pairs Checked: 2604
Total Pools Found: 6234
Execution Time: 845.32s
```

## Best Practices

1. **Start Small**: Test with 1-2 DEXs first
2. **Monitor Gas**: Keep gas prices low for testing
3. **Validate Data**: Check pool state after discovery
4. **Regular Updates**: Refresh pool data periodically
5. **Backup Registry**: Save pool registry before updates

## Future Enhancements

Potential improvements:

1. **Real-time Updates**: WebSocket-based pool monitoring
2. **Predictive Analysis**: ML-based opportunity prediction
3. **Cross-chain**: Support for other L2s
4. **Advanced Filtering**: More sophisticated pool filtering
5. **Cache Layer**: Redis-based pool state caching

## Contributing

To contribute to the pool discovery system:

1. Add new DEX fetchers in `src/pools/fetchers/`
2. Update `src/pools/discoveryTop200.ts` to include new DEXs
3. Add tests for new functionality
4. Update documentation

## License

This code is part of the Base BNB Flash Loan Arbitrage Bot project.

---

For questions or issues, please refer to the main README or open an issue on GitHub.