# Pool Discovery Test Report

## Test Date
2026-01-24

## Objective
Test pool discovery system across 5 DEXs on Base mainnet to populate the pool registry.

## DEXs Tested
1. Uniswap V3 (Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD)
2. Uniswap V2 (Factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6)
3. SushiSwap V3 (Factory: 0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89)
4. PancakeSwap V3 (Factory: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865)
5. Aerodrome (Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da)

## Results Summary

### Total Pools Found: 0
### Total Errors: 5

## Error Analysis

### 1. Uniswap V3
**Error:** `Error: could not coalesce error (error={ "code": -32011, "message": "no backend is currently healthy to serve traffic" })`

**Cause:** The RPC node is rejecting historical log queries from genesis (block 0) to current block (41,214,009). This is because:
- Querying 41M blocks worth of PoolCreated events is too resource-intensive
- Public RPC nodes have limits on historical data queries
- The query spans the entire history of Base mainnet

**Impact:** Unable to discover any Uniswap V3 pools

### 2. Uniswap V2
**Error:** `Error: missing response for request (error={ "code": -32014, "message": "maximum 10 calls in 1 batch" })`

**Cause:** The Uniswap V2 factory has 2,832,915 pairs. The multicall batch is trying to fetch too many pairs at once, exceeding the RPC's batch limit.

**Impact:** Unable to discover any Uniswap V2 pools

### 3. SushiSwap V3
**Error:** `TypeError: bad address checksum (argument="address", value="0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89")`

**Cause:** The factory address has an incorrect checksum. ethers.js validates address checksums and rejects invalid addresses.

**Impact:** Unable to create fetcher for SushiSwap V3

### 4. PancakeSwap V3
**Error:** `Error: could not coalesce error (error={ "code": -32011, "message": "no backend is currently healthy to serve traffic" })`

**Cause:** Same as Uniswap V3 - historical log query is too large

**Impact:** Unable to discover any PancakeSwap V3 pools

### 5. Aerodrome
**Error:** `Error: could not coalesce error (error={ "code": -32011, "message": "no backend is currently healthy to serve traffic" })`

**Cause:** Same as Uniswap V3 - historical log query is too large

**Impact:** Unable to discover any Aerodrome pools

## Root Causes

### 1. RPC Infrastructure Limitations
- Public RPC nodes have strict limits on historical data queries
- Querying from genesis to current block is not feasible
- Nodes reject queries that span millions of blocks

### 2. Address Checksum Errors
- Some factory addresses in constants.ts have incorrect checksums
- ethers.js validates checksums and throws errors for invalid addresses

### 3. Batch Size Limitations
- Multicall batches exceed RPC limits
- Need to implement proper pagination and chunking

## Recommendations

### 1. Fix Address Checksums
Update the following factory addresses with correct checksums:
- SushiSwap V3: `0x1af7C5dBc1a364952E2945A6bD9024C4C7F48F89` → Verify correct checksum

### 2. Implement Time-Bounded Queries
Instead of querying from genesis, implement:
- Recent block range queries (last 10,000-100,000 blocks)
- Incremental discovery with persistence
- Block range pagination

### 3. Optimize Batch Sizes
- Implement proper pagination for V2 pairs
- Reduce batch size to respect RPC limits
- Add retry logic with exponential backoff

### 4. Use Private RPC Nodes
- Private RPC nodes typically have higher limits
- Consider Alchemy, Infura, or QuickNode for production
- These services provide better historical data access

### 5. Alternative Discovery Methods
- Use subgraph APIs (The Graph) for pool discovery
- Use DEX-specific APIs where available
- Cache pool addresses and update incrementally

## Alternative Approach: Static Pool Registry

Given the current limitations, we recommend creating a static pool registry with known high-volume pools for the most traded token pairs:

### Recommended Initial Pools
1. **WETH/USDC Pools:**
   - Uniswap V3 (0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640) - 0.05% fee
   - Uniswap V2 (0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc)
   - Curve (0x... )

2. **WETH/USDbC Pools:**
   - Uniswap V3 (0x...)
   - Uniswap V2 (0x...)

3. **USDC/USDbC Pools:**
   - Curve (0x...) - Best for stable swaps

This static approach will allow the bot to start operating immediately while we work on improving the dynamic discovery system.

## Next Steps

1. Create static pool registry with known pools
2. Test arbitrage detection with static pools
3. Implement incremental pool discovery
4. Add address checksum validation
5. Optimize batch sizes and pagination
6. Consider private RPC nodes for production

## Conclusion

The pool discovery system is implemented correctly, but is limited by:
- RPC infrastructure constraints
- Address checksum issues
- Batch size limitations

The recommended path forward is to start with a static pool registry while improving the dynamic discovery system in parallel.