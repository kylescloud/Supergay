# Production Scan Execution Guide

## Quick Start

### Running the Production Scan

```bash
# From the /workspace directory:
npx ts-node scripts/full-scan-detailed-logging.ts
```

### Expected Execution Time
- **Initial load**: 2-5 seconds
- **Pool loading**: 477 pools
- **Strategy execution**: 5-15 seconds (depends on market conditions)
- **Total scan time**: 10-30 seconds

## What Happens During the Scan

### Phase 1: Initialization (2-3 seconds)
```
╔══════════════════════════════════════════════════════════════════════════════╗
║              PRODUCTION ARBITRAGE SCAN - BASE BLOCKCHAIN                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

📍 Block Number: 12345678
⏰ Timestamp: 2024-01-24T00:00:00.000Z
```

### Phase 2: Pool Registry Loading (1-2 seconds)
```
📂 Loading pool registry...
✅ Loaded 477 pools from registry

📊 Pool Distribution:
   Total Pools: 477
   Uniswap V3: ~200 pools
   Uniswap V2: ~150 pools
   SushiSwap V3: ~50 pools
   PancakeSwap V3: ~40 pools
   Aerodrome: ~37 pools
   Other DEXs: ~50 pools
```

### Phase 3: Strategy Execution (5-15 seconds)

#### Strategy 1: Multi-Hop Cyclic Arbitrage
```
🔄 [Strategy 1] Multi-Hop Cyclic Arbitrage
   Description: Detects negative cycles in exchange graph
   Formula: Σ(-ln(rate)) < 0 ⇔ Π(rate) > 1

   Scanning paths...
   ✅ Paths scanned: 1234
   ✅ Opportunities found: 2
```

#### Strategy 2: Fee-Tier Mispricing
```
🎯 [Strategy 2] Fee-Tier Mispricing
   Description: Exploits price differences between fee tiers
   Formula: R = (√P_out / √P_in)² * (1 - f)

   Scanning fee tiers...
   ✅ Pairs scanned: 456
   ✅ Opportunities found: 1
```

#### Strategy 3: Liquidity Fragmentation
```
💧 [Strategy 3] Liquidity Fragmentation
   Description: Exploits price differences from fragmented liquidity
   Formula: Uses marginal rate (slope)

   Analyzing liquidity...
   ✅ Pools analyzed: 477
   ✅ Opportunities found: 1
```

#### Strategy 4: Stable-Volatile Arbitrage
```
⚖️  [Strategy 4] Stable-Volatile Arbitrage
   Description: Exploits second derivative differences
   Formula: Stable (d²y/dx² ≈ 0) vs Volatile (d²y/dx² ≠ 0)

   Detecting opportunities...
   ✅ Pairs analyzed: 123
   ✅ Opportunities found: 1
```

### Phase 4: Results Display (2-3 seconds)
```
══════════════════════════════════════════════════════════════════════════════
SCAN RESULTS
══════════════════════════════════════════════════════════════════════════════
⏱️  Scan Duration: 12.5s
📊 Opportunities Found: 5

💰 Profitable Opportunities:

1. Opportunity ID: opp_123456
   Path: WETH → USDC → WBTC → WETH
   DEXs: uniswap-v3 → uniswap-v2 → uniswap-v3
   Flash Loan: 10.0 WETH
   Expected Profit: 0.15 ETH
   Net Profit: 0.05 ETH
   USD Value: $150.00
   Flash Fee: 0.03 ETH
   Gas Cost: 0.02 ETH
   Score: 0.8534
   Entropy: 0.2341

2. Opportunity ID: opp_123457
   Path: USDC → WETH → USDbC → USDC
   DEXs: sushiswap-v3 → uniswap-v3 → uniswap-v2
   Flash Loan: 10000.0 USDC
   Expected Profit: 0.08 ETH
   Net Profit: 0.02 ETH
   USD Value: $60.00
   Flash Fee: 0.04 ETH
   Gas Cost: 0.015 ETH
   Score: 0.7892
   Entropy: 0.3124

[... 3 more opportunities ...]

📄 Detailed log saved to: ./logs/detailed-scans/detailed-scan-1706083200000.json
```

## Output Files Generated

### 1. Console Output
Real-time display of:
- Scan progress
- Pool statistics
- Strategy results
- Top 10 opportunities
- Summary statistics

### 2. Detailed JSON Log
**Location**: `./logs/detailed-scans/detailed-scan-{timestamp}.json`

**Structure**:
```json
{
  "timestamp": "2024-01-24T00:00:00.000Z",
  "blockNumber": 12345678,
  "scanDuration": 12500,
  "baseToken": {
    "symbol": "WETH",
    "address": "0x4200000000000000000000000000000000000006"
  },
  "loanAmount": "10.0",
  "poolsScanned": {
    "total": 477,
    "byDEX": {
      "uniswap-v3": 200,
      "uniswap-v2": 150,
      "sushiswap-v3": 50,
      "pancakeswap-v3": 40,
      "aerodrome": 37
    }
  },
  "strategies": [
    {
      "name": "multi-hop-cyclic",
      "pathsScanned": 1234,
      "opportunitiesFound": 2,
      "details": [...]
    },
    {
      "name": "fee-tier-mispricing",
      "pathsScanned": 456,
      "opportunitiesFound": 1,
      "details": [...]
    },
    {
      "name": "liquidity-fragmentation",
      "pathsScanned": 477,
      "opportunitiesFound": 1,
      "details": [...]
    },
    {
      "name": "stable-volatile",
      "pathsScanned": 123,
      "opportunitiesFound": 1,
      "details": [...]
    }
  ],
  "totalOpportunities": 5,
  "opportunities": [
    {
      "id": "opp_123456",
      "path": [
        { "symbol": "WETH", "address": "...", "decimals": 18 },
        { "symbol": "USDC", "address": "...", "decimals": 6 },
        { "symbol": "WBTC", "address": "...", "decimals": 8 },
        { "symbol": "WETH", "address": "...", "decimals": 18 }
      ],
      "dexes": ["uniswap-v3", "uniswap-v2", "uniswap-v3"],
      "pools": ["0x...", "0x...", "0x..."],
      "baseToken": {
        "symbol": "WETH",
        "address": "0x4200000000000000000000000000000000000006"
      },
      "loanAmount": "10.0",
      "expectedProfit": "0.15",
      "expectedProfitUSD": 150.00,
      "flashFee": "0.03",
      "gasCost": "0.02",
      "netProfit": "0.05",
      "score": 0.8534,
      "entropy": 0.2341,
      "blockNumber": 12345678,
      "timestamp": "2024-01-24T00:00:00.000Z"
    }
  ]
}
```

## Profit Calculation Details

### For Each Opportunity:

1. **Gross Profit Calculation**
   - Sum of swap outputs minus flash loan amount
   - Based on effective rates from each pool

2. **Fee Deductions**
   ```
   Flash Loan Fee = Loan Amount × 0.0005 to 0.0009 (0.05% to 0.09%)
   Gas Cost = Gas Price (gwei) × Gas Limit / 1e9
   Swap Fees = Sum of each swap's fee based on DEX and fee tier
   Slippage = Estimated based on pool liquidity and trade size
   ```

3. **Net Profit**
   ```
   Net Profit = Gross Profit - Flash Loan Fee - Gas Cost - Swap Fees - Slippage
   ```

4. **USD Value**
   ```
   USD Value = Net Profit × ETH Price (oracle price)
   ```

5. **Score (0-1)**
   - Higher = better opportunity
   - Based on profit margin, execution probability, MEV risk

6. **Entropy (0-1)**
   - Higher = more random path (better for MEV protection)
   - Used to prevent front-running

## Verifying Calculations

### Check 1: Pool Registry Validity
```bash
# Check pool count
cat /workspace/data/pool-registry.json | jq '.pools | length'

# Check pool structure
cat /workspace/data/pool-registry.json | jq '.pools[0]'
```

### Check 2: Scan Output
- Verify pool counts match registry
- Check that all 4 strategies ran
- Confirm opportunities found (if any)

### Check 3: Profit Calculations
For each opportunity:
1. Sum all positive swaps
2. Subtract flash loan fee
3. Subtract gas cost
4. Subtract swap fees
5. Verify: Net Profit ≈ Expected Profit

### Check 4: Fee Reasonableness
- Flash loan fee: Should be 0.05-0.09% of loan amount
- Gas cost: Should be ~0.01-0.05 ETH on Base
- Swap fees: Should be 0.01-1% depending on DEX and fee tier

## Troubleshooting

### Issue: No Opportunities Found
**Possible causes:**
1. Market is efficient (no arbitrage)
2. Pool state data is outdated
3. Profit threshold is too high
4. Gas price is too high

**Solutions:**
```bash
# Update pool state
npx ts-node scripts/update-registry-and-scan.ts

# Try different loan amounts (edit scan script)
# Try during high volatility periods
```

### Issue: Scan Takes Too Long
**Possible causes:**
1. Too many pools being scanned
2. Network latency
3. Complex path calculations

**Solutions:**
- Reduce pool count in registry
- Use faster RPC endpoint
- Limit max path length in strategies

### Issue: Inaccurate Profit Calculations
**Possible causes:**
1. Outdated pool state
2. Incorrect gas price estimate
3. Missing fees

**Solutions:**
```bash
# Update pool state before scanning
# Verify gas price settings
# Check fee calculations in code
```

## Continuous Monitoring

### Run Scans Automatically
```bash
# Every 30 seconds
while true; do
  npx ts-node scripts/full-scan-detailed-logging.ts
  sleep 30
done

# Or use the production bot
npm run bot
```

### Monitor Results
```bash
# View latest scan logs
ls -lt ./logs/detailed-scans/ | head -10

# View scan results
cat ./logs/detailed-scans/detailed-scan-*.json | jq '.opportunities'
```

## Performance Metrics

### Expected Performance:
- **Scan time**: 10-30 seconds
- **Memory usage**: ~500MB
- **CPU usage**: Single core
- **Network calls**: ~500-1000 RPC calls per scan

### Optimization Tips:
1. Use multi-RPC system (already configured)
2. Batch RPC calls where possible
3. Cache pool state between scans
4. Use compression for large logs

## Summary

The production scan provides:
- ✅ Comprehensive pool coverage (477 pools)
- ✅ Four arbitrage strategies
- ✅ Accurate profit calculations
- ✅ Detailed logging and reporting
- ✅ MEV protection mechanisms
- ✅ Real-time monitoring capabilities

Run: `npx ts-node scripts/full-scan-detailed-logging.ts` to start scanning!