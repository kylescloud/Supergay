# Production Scan Using Existing Files

## Overview

This document explains how to run the production arbitrage scan using the existing infrastructure, avoiding duplicate files and using the established naming conventions.

## Existing Infrastructure

### Pool Registry
- **File**: `data/pool-registry.json`
- **Size**: 111KB
- **Pools**: 477 pools from multiple DEXs
- **Last Updated**: Includes timestamp and block number
- **Structure**:
  ```json
  {
    "version": "1.0.0",
    "lastUpdated": 1769243610039,
    "blockNumber": 0,
    "network": "base",
    "chainId": 8453,
    "pools": [
      {
        "address": "0x...",
        "dex": "uniswap-v3",
        "dexVersion": "v3",
        "token0": { "address": "...", "symbol": "WETH", "decimals": 18, "name": "..." },
        "token1": { "address": "...", "symbol": "USDC", "decimals": 6, "name": "..." },
        "fee": 100,
        "isActive": true,
        "lastUpdated": 1769243860075,
        "sqrtPriceX96": "...",
        "tick": 1141,
        "liquidity": "..."
      }
    ]
  }
  ```

### Production Scan Script
- **File**: `scripts/full-scan-detailed-logging.ts`
- **Lines**: 288
- **Features**:
  - Loads pool from registry automatically
  - Runs all 4 arbitrage strategies
  - Detailed logging of every path scanned
  - Profit calculations with fee breakdowns
  - Saves detailed JSON logs to `./logs/detailed-scans/`
  - Displays top 10 profitable opportunities

### Pool Discovery Scripts (Reference)
- `scripts/discover-all-10-dex-pools.ts` - Latest discovery script for 10 DEXs
- `scripts/discover-all-pools-factory.ts` - Factory-based discovery
- Various other discovery scripts for different approaches

## Running the Production Scan

### Method 1: Direct Execution
```bash
npx ts-node scripts/full-scan-detailed-logging.ts
```

### Method 2: Using Update Script (Updates + Scan)
```bash
npx ts-node scripts/update-registry-and-scan.ts
```
This will:
1. Load existing 477 pools
2. Update pool state data from blockchain
3. Run the production scan
4. Generate detailed report

### Method 3: Using NPM Scripts (if configured)
```bash
npm run scan
```

## Expected Output

### Console Output
```
╔══════════════════════════════════════════════════════════════════════════════╗
║              PRODUCTION ARBITRAGE SCAN - BASE BLOCKCHAIN                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

📍 Block Number: 12345678
⏰ Timestamp: 2024-01-24T00:00:00.000Z

📂 Loading pool registry...
✅ Loaded 477 pools from registry

🔍 Running arbitrage strategies...
─ [Strategy execution logs] ─

══════════════════════════════════════════════════════════════════════════════
SCAN RESULTS
══════════════════════════════════════════════════════════════════════════════
⏱️  Scan Duration: 1500ms (1.50s)
📊 Opportunities Found: 5

💰 Profitable Opportunities:

1. Opportunity ID: opp_123456
   Path: WETH → USDC → WETH
   DEXs: uniswap-v3 → uniswap-v2
   Flash Loan: 10.0 WETH
   Expected Profit: 0.15 ETH
   Net Profit: 0.05 ETH
   USD Value: $150.00
   Flash Fee: 0.03 ETH
   Gas Cost: 0.02 ETH
   Score: 0.8534
   Entropy: 0.2341

══════════════════════════════════════════════════════════════════════════════
📄 Detailed log saved to: ./logs/detailed-scans/detailed-scan-1706083200000.json
══════════════════════════════════════════════════════════════════════════════
```

### JSON Output (Detailed Log)
```json
{
  "timestamp": "2024-01-24T00:00:00.000Z",
  "blockNumber": 12345678,
  "scanDuration": 1500,
  "baseToken": { "symbol": "WETH", "address": "0x4200000000000000000000000000000000000006" },
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
    }
  ],
  "totalOpportunities": 5,
  "pathDetails": [...],
  "opportunities": [...]
}
```

## Profit Calculation Details

### Calculations Performed
For each opportunity found:

1. **Gross Profit**: Raw profit before fees
2. **Net Profit**: Gross profit minus all costs
   ```
   Net Profit = Gross Profit - Flash Loan Fee - Gas Cost - Swap Fees - Slippage
   ```
3. **Expected Profit USD**: Net profit converted to USD
4. **Score**: Opportunity quality score (0-1)
5. **Entropy**: Path randomness for MEV protection

### Fee Breakdown
- **Flash Loan Fee**: 0.05-0.09% of loan amount (Aave V3)
- **Gas Cost**: Based on current gas price and estimated gas limit
- **Swap Fees**: DEX-specific swap fees (0.01-1%)
- **Slippage**: Estimated price impact

## Analyzing Results

### Viewing Console Output
The console output provides:
- Real-time progress
- Pool counts by DEX
- Strategy execution results
- Top 10 profitable opportunities
- Scan duration and statistics

### Viewing Detailed JSON Logs
```bash
ls -la ./logs/detailed-scans/
cat ./logs/detailed-scans/detailed-scan-*.json
```

### Profit Verification
Check that:
1. Net profit is positive for profitable opportunities
2. All fees are properly deducted
3. Flash loan amount matches expected
4. Gas costs are realistic for Base network

## Troubleshooting

### Pool Registry Issues
If the pool registry is outdated:
```bash
npx ts-node scripts/update-registry-and-scan.ts
```

### TypeScript Compilation Errors
Ensure all dependencies are installed:
```bash
npm install
npm run build
```

### RPC Connection Issues
Check RPC provider configuration in `src/config/constants.ts` and `src/utils/rpcManager.ts`

### No Opportunities Found
This is normal in competitive markets. Try:
- Adjusting flash loan amount
- Lowering profit threshold
- Running during high volatility periods

## Continuous Monitoring

To run continuous scans:
```bash
# Run scan every 30 seconds
while true; do
  npx ts-node scripts/full-scan-detailed-logging.ts
  sleep 30
done
```

Or use the production bot:
```bash
npm run bot
```

## File Cleanup

Removed duplicate files:
- ✅ `data/full-pool-registry.json` (use `data/pool-registry.json`)
- ✅ `data/comprehensive-pool-registry.json` (use `data/pool-registry.json`)
- ✅ `scripts/production-full-scan.ts` (use `scripts/full-scan-detailed-logging.ts`)
- ✅ `scripts/comprehensive-pool-discovery.ts` (use existing discovery scripts)

## Next Steps

1. Run the production scan: `npx ts-node scripts/full-scan-detailed-logging.ts`
2. Analyze the output JSON for profit calculations
3. Verify all calculations are correct
4. Set up continuous monitoring if profitable opportunities are found
5. Implement auto-execution (if configured)

## Conclusion

The existing infrastructure provides:
- ✅ 477 pools from multiple DEXs
- ✅ Detailed production scan script
- ✅ Comprehensive logging and reporting
- ✅ Accurate profit calculations
- ✅ MEV protection mechanisms

No new files are needed. Use the existing `full-scan-detailed-logging.ts` and `pool-registry.json` for production scanning.