# Automated Flash Loan Arbitrage Execution Guide

## Overview

This guide explains how to use the automated flash loan arbitrage execution system for Base Network. The system automatically detects profitable arbitrage opportunities and executes them using Aave V3 flash loans.

## Architecture

### Components

1. **FlashLoanExecutor** (`src/execution/FlashLoanExecutor.ts`)
   - Handles flash loan execution
   - Manages transaction submission
   - Tracks execution history

2. **AutomatedExecutor** (`scripts/run-automated-executor.ts`)
   - Continuous opportunity scanner
   - Automatic execution based on thresholds
   - Performance monitoring

3. **FlashLoanArbitrageEnhanced** (`contracts/FlashLoanArbitrageEnhanced.sol`)
   - Smart contract for flash loan arbitrage
   - Multi-DEX swap execution
   - Profit validation

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- npm or yarn
- Private key with ETH on Base Network
- Deployed FlashLoanArbitrageEnhanced contract

### 2. Environment Configuration

Create a `.env` file with the following variables:

```env
# RPC Configuration
RPC_URL=https://base-rpc.publicnode.com

# Wallet Configuration
PRIVATE_KEY=your_private_key_here

# Contract Addresses
FLASH_LOAN_CONTRACT=your_deployed_contract_address
AAVE_POOL=0xA238Dd80C259a72e81d7e4b422E3588869B8325B

# DEX Router Addresses
UNISWAP_V2_ROUTER=0x4752ba5DBC23f44D87826276BF6Fd6b1C1252c36
UNISWAP_V3_ROUTER=0x33128a8fC17869897dcE68Ed026d694621f6FDfD
AERODROME_ROUTER=0xcfE90b3E7d4C8b2d11C5115D6240226F2F5fd937
ALIENBASE_ROUTER=0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7
SWAPBASED_ROUTER=0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066
```

### 3. Deploy the Smart Contract

```bash
# Deploy the enhanced flash loan contract
npm run deploy:enhanced
```

This will:
- Deploy the FlashLoanArbitrageEnhanced contract
- Configure all DEX routers
- Save deployment information to `data/deployment-info.json`
- Update `.env` with contract addresses

### 4. Update Configuration

Edit `config.json` to set your preferences:

```json
{
  "minProfitPercent": 0.1,
  "minProfitAfterGas": 0.3,
  "maxGasPrice": 50000000000,
  "scanning": {
    "interval": 2000,
    "maxConcurrentScans": 5
  },
  "flashLoan": {
    "enabled": true,
    "provider": "aave",
    "minProfitAfterFlashLoan": 0.1,
    "maxFlashLoanAmount": 1000000
  },
  "executionEnabled": true,
  "strategies": {
    "multiHop": {
      "minProfit": 0.1,
      "maxHops": 4
    },
    "feeTier": {
      "minProfit": 0.15
    },
    "liquidityFragmentation": {
      "minProfit": 0.2
    },
    "stableVolatile": {
      "minProfit": 0.05
    }
  }
}
```

## Usage

### 1. Start the Automated Executor

```bash
# Start continuous scanning and execution
npm run executor:start
```

The executor will:
- Scan for opportunities every 2 seconds
- Filter opportunities based on profit thresholds
- Execute the most profitable opportunity
- Track execution history
- Monitor performance metrics

### 2. Monitor Execution

View real-time statistics in the console:

```
[Execution #1]
  Running time: 10.5s
  Executions: 5
  Successful: 3 (0.85% avg profit)
  Failed: 1
  Skipped: 1
  Total profit: 2.55%
  Executions per second: 0.48
```

### 3. Check Execution History

Execution history is saved to `data/execution-history.json`:

```json
[
  {
    "opportunityId": "opp-1769437131116-t8srrn7b5",
    "timestamp": 1769437131116,
    "strategy": "Multi-Hop Cyclic",
    "profitPercent": 0.174,
    "profitAfterGas": 0.124,
    "txHash": "0x123...",
    "blockNumber": 41323891,
    "gasUsed": "150000",
    "status": "executed"
  }
]
```

### 4. View Reports

After stopping the executor (Ctrl+C), a report is generated at `reports/automated-execution-report.json`:

```json
{
  "timestamp": "2026-01-26T14:30:00.000Z",
  "summary": {
    "totalExecutions": 100,
    "runningTime": "205.3 seconds",
    "successfulExecutions": 85,
    "failedExecutions": 10,
    "skippedExecutions": 5,
    "successRate": "85.0%",
    "averageProfit": "0.85%",
    "totalProfit": "72.25%",
    "executionsPerSecond": "0.49"
  }
}
```

## Configuration Options

### Profit Thresholds

- **minProfitPercent**: Minimum profit before gas costs (default: 0.1%)
- **minProfitAfterGas**: Minimum profit after gas costs (default: 0.3%)
- **maxGasPrice**: Maximum gas price in wei (default: 50 gwei)

### Scanning Settings

- **interval**: Scan interval in milliseconds (default: 2000ms)
- **maxConcurrentScans**: Maximum concurrent scans (default: 5)

### Flash Loan Settings

- **enabled**: Enable flash loans (default: true)
- **provider**: Flash loan provider (default: "aave")
- **minProfitAfterFlashLoan**: Minimum profit after flash loan fee (default: 0.1%)
- **maxFlashLoanAmount**: Maximum flash loan amount (default: 1,000,000)

### Strategy-Specific Thresholds

Each strategy can have its own minimum profit threshold:

- **multiHop**: Multi-hop cyclic arbitrage (default: 0.1%)
- **feeTier**: Fee-tier mispricing (default: 0.15%)
- **liquidityFragmentation**: Liquidity fragmentation (default: 0.2%)
- **stableVolatile**: Stable-volatile arbitrage (default: 0.05%)

## Risk Management

### Gas Price Protection

The executor automatically checks gas prices before execution:

```javascript
if (gasPrice > maxGasPrice) {
  console.log('Gas price too high, skipping execution');
  return;
}
```

### Profit Validation

Before execution, the system validates:

1. **Minimum profit**: Opportunity must exceed `minProfitAfterGas`
2. **Gas cost estimation**: Actual gas costs are calculated
3. **Final profit**: Profit after all costs must exceed threshold

### Slippage Protection

The smart contract includes slippage protection:

```solidity
require(block.timestamp <= deadline, "Transaction expired");
require(amountOut >= minAmount, "Insufficient output");
```

## Supported DEXs

The system supports trading on:

1. **Uniswap V2** - Classic AMM
2. **Uniswap V3** - Concentrated liquidity
3. **Aerodrome** - Base DEX
4. **AlienBase** - Base DEX
5. **SwapBased** - Base DEX

## Troubleshooting

### No Opportunities Detected

**Problem**: Executor reports "No opportunities detected"

**Solutions**:
1. Check pool registry has enough pools (should have 200+)
2. Verify profit thresholds are not too high
3. Ensure markets are active (check DEX volumes)
4. Try lowering `minProfitPercent` to 0.05%

### Execution Failures

**Problem**: Transactions fail or revert

**Solutions**:
1. Check wallet has enough ETH for gas
2. Verify contract has necessary token approvals
3. Check pool liquidity is sufficient
4. Review error messages in execution history

### Gas Price Too High

**Problem**: "Gas price too high, skipping execution"

**Solutions**:
1. Increase `maxGasPrice` in config
2. Wait for gas prices to drop
3. Use gas price oracle for dynamic adjustment

### Insufficient Balance

**Problem**: "Insufficient balance to repay flash loan"

**Solutions**:
1. Check arbitrage calculations are correct
2. Verify pool reserves are accurate
3. Reduce flash loan amount
4. Improve swap routing

## Best Practices

### 1. Start Small

- Begin with small flash loan amounts ($1,000-$5,000)
- Test with manual execution first
- Gradually increase amounts as you gain confidence

### 2. Monitor Gas Prices

- Set appropriate `maxGasPrice` threshold
- Use gas price oracles for dynamic adjustment
- Consider gas cost in profit calculations

### 3. Regular Maintenance

- Update pool registry regularly
- Monitor execution success rates
- Review profit margins
- Adjust thresholds based on performance

### 4. Risk Management

- Never invest more than you can afford to lose
- Set maximum position sizes
- Use stop-loss mechanisms
- Diversify across different strategies

### 5. Keep Logs

- Save execution history
- Monitor performance metrics
- Track gas costs
- Review failed transactions

## Advanced Features

### Dynamic Thresholds

The system supports dynamic threshold adjustment:

```javascript
dynamicThresholds: {
  enabled: true,
  minProfit: 0.1,
  maxProfit: 5.0,
  adjustmentFactor: 0.5,
  volatilityThreshold: 0.02,
  gasPriceImpact: 0.3
}
```

### Multi-Strategy Execution

Execute opportunities from multiple strategies:

```javascript
strategies: {
  multiHop: { enabled: true, minProfit: 0.1 },
  feeTier: { enabled: true, minProfit: 0.15 },
  liquidityFragmentation: { enabled: true, minProfit: 0.2 },
  stableVolatile: { enabled: true, minProfit: 0.05 }
}
```

### Performance Optimization

Enable parallel scanning:

```javascript
scanning: {
  interval: 1000,
  maxConcurrentScans: 10,
  enableCaching: true,
  cacheTimeout: 5000
}
```

## Security Considerations

### Private Key Security

- Never commit `.env` to version control
- Use hardware wallets for large amounts
- Rotate keys regularly
- Use separate keys for different environments

### Smart Contract Security

- Audit contracts before mainnet deployment
- Use tested libraries (OpenZeppelin, Aave)
- Implement pausable functionality
- Set appropriate access controls

### Execution Security

- Validate all inputs
- Check for reentrancy attacks
- Implement emergency stop
- Monitor for unusual activity

## Performance Optimization

### Reduce Gas Costs

1. **Batch transactions**: Execute multiple swaps in one transaction
2. **Optimize routes**: Use shortest paths
3. **Reduce approvals**: Revoke unnecessary approvals
4. **Use lower gas prices**: Wait for optimal times

### Improve Detection Speed

1. **Cache pool data**: Reduce redundant RPC calls
2. **Use efficient algorithms**: Optimize path finding
3. **Parallel processing**: Scan multiple opportunities simultaneously
4. **Pre-filter pools**: Remove low-liquidity pools

### Maximize Profit

1. **Optimize thresholds**: Find optimal profit levels
2. **Improve routing**: Use better path algorithms
3. **Reduce fees**: Minimize swap fees
4. **Timing**: Execute during peak volatility

## Monitoring and Alerts

### Key Metrics to Monitor

- **Success Rate**: Percentage of successful executions
- **Average Profit**: Mean profit per execution
- **Gas Costs**: Total gas spent
- **Execution Frequency**: Opportunities per hour
- **Profit per Hour**: Total profit / time

### Setting Up Alerts

Implement alerts for:

- Low success rates (< 50%)
- High failure rates (> 20%)
- Unusual gas prices
- Contract balance changes
- Large profit/loss events

## FAQ

### Q: How much ETH do I need to start?

A: You need enough ETH to pay for gas costs (typically 0.001-0.01 ETH per transaction). For testing, 0.01 ETH is sufficient.

### Q: What's the minimum profit threshold?

A: The default is 0.3% after gas costs. This accounts for flash loan fees (0.05%), swap fees (0.3%), and gas costs.

### Q: How often does the executor scan?

A: Every 2 seconds by default. You can adjust this in the config file.

### Q: Can I lose money?

A: Yes, if the arbitrage fails or gas prices spike, you can lose money. Always test with small amounts first.

### Q: How do I stop the executor?

A: Press Ctrl+C to gracefully stop the executor. It will save a final report.

### Q: Can I run multiple executors?

A: Yes, but ensure they use different wallets and contracts to avoid conflicts.

## Support

For issues or questions:

1. Check the logs in `data/execution-history.json`
2. Review the reports in `reports/`
3. Verify your configuration in `config.json`
4. Check the smart contract status on BaseScan

## License

MIT License - See LICENSE file for details