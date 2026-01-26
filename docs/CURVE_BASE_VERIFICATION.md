# Curve Finance on Base Blockchain - Verification Report

## Executive Summary

This document verifies the deployment of Curve Finance contracts on the Base blockchain and provides the correct contract addresses for pool discovery.

## Verified Contract Addresses

### Curve Address Provider
**Address:** `0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98`
- Acts as the entry point for all Curve registries
- Provides access to factories, registries, and other Curve components
- Verified on Base mainnet

### Key Contracts for Pool Discovery

#### 1. Exchange Router
**ID:** 2
**Address:** `0x4f37A9d177470499A2dD084621020b023fcffc1F`
- Used for executing swaps on Curve pools
- Required for arbitrage execution

#### 2. Stableswap Metapool Factory
**ID:** 3
**Address:** `0x3093f9B57A428F3EB6285a589cb35bEA6e78c336`
- Creates stablecoin pools (e.g., USDC/USDbC/DAI)
- Primary factory for stable pool discovery
- **Critical for pool discovery**

#### 3. Fee Distributor
**ID:** 4
**Address:** `0xe8269B33E47761f552E1a3070119560d5fa8bBD6`
- Distributes trading fees to liquidity providers
- Used for tracking pool rewards

#### 4. Twocrypto Factory
**ID:** 6
**Address:** `0x5EF72230578b3e399E6C6F4F6360edF95e83BBfd`
- Creates 2-asset pools with volatile tokens
- Alternative to Stableswap for non-stable pairs
- **Critical for pool discovery**

## Integration Implementation

### Update Constants File

Update `src/config/constants.ts` with the following Curve configuration:

```typescript
curve: {
  addressProvider: '0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98',
  exchangeRouter: '0x4f37A9d177470499A2dD084621020b023fcffc1F',
  stableswapMetapoolFactory: '0x3093f9B57A428F3EB6285a589cb35bEA6e78c336',
  twocryptoFactory: '0x5EF72230578b3e399E6C6F4F6360edF95e83BBfd',
  feeDistributor: '0xe8269B33E47761f552E1a3070119560d5fa8bBD6',
  version: 'curve',
},
```

### Update Curve Fetcher

Update `src/pools/fetchers/curve.ts` to use the verified addresses:

1. Use `stableswapMetapoolFactory` for stable pool discovery
2. Use `twocryptoFactory` for volatile pool discovery
3. Query the Address Provider to get the latest registry addresses

## Pool Discovery Strategy

### Stableswap Pools
- Query `stableswapMetapoolFactory` for pool count
- Iterate through pools and fetch pool data
- Filter by liquidity and token pairs
- Focus on stablecoin pairs (USDC/USDbC/DAI)

### Twocrypto Pools
- Query `twocryptoFactory` for pool count
- Iterate through pools and fetch pool data
- Filter by liquidity and token pairs
- Include volatile token pairs (WETH/USDC, etc.)

## RPC Rate Limiting Notes

- **Issue:** Public RPC nodes have strict rate limits
- **Solution:** Use the Enhanced RPC Manager for retry logic
- **Recommendation:** Use private/paid RPC nodes for production
- **Alternative:** Use subgraphs or APIs for pool data

## Next Steps

1. ✅ Verify Curve contract addresses on Base
2. ⏳ Update constants with verified addresses
3. ⏳ Implement pool discovery using verified factories
4. ⏳ Test pool discovery with rate limiting
5. ⏳ Integrate Curve pools into the arbitrage bot

## Conclusion

Curve Finance is deployed on Base with the following key contracts verified:
- **Address Provider:** `0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98`
- **Stableswap Factory:** `0x3093f9B57A428F3EB6285a589cb35bEA6e78c336`
- **Twocrypto Factory:** `0x5EF72230578b3e399E6C6F4F6360edF95e83BBfd`

These addresses should be used for pool discovery and integration.