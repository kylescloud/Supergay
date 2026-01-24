# Production-Ready Arbitrage Bot Guide

## Overview

This guide explains how to run the production-ready arbitrage bot with all advanced features enabled, including:

- ✅ **Pool Discovery System** - Automatic pool state fetching from all configured DEXs
- ✅ **Real-Time Logging** - Comprehensive logging with detailed opportunity tracking
- ✅ **Telegram Alerts** - Instant notifications for opportunities and executions
- ✅ **Performance Monitoring** - Track metrics and optimize performance
- ✅ **Multi-RPC System** - Reliable scanning and execution with failover
- ✅ **Automatic Execution** - Execute profitable opportunities automatically

## Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration](#configuration)
3. [Features](#features)
4. [Running the Bot](#running-the-bot)
5. [Monitoring](#monitoring)
6. [Telegram Setup](#telegram-setup)
7. [Performance Optimization](#performance-optimization)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
# Base Network Configuration
BASE_RPC_URL=https://mainnet.base.org

# Private RPC Nodes (recommended for execution)
PRIVATE_RPC_1=https://your-private-rpc-1.com
PRIVATE_RPC_2=https://your-private-rpc-2.com

# Private Key (for execution)
PRIVATE_KEY=your_private_key_here

# Telegram Bot (optional - for alerts)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### 3. Run the Bot

```bash
npm run bot
```

The bot will:
- Initialize pool discovery
- Start continuous scanning
- Log all opportunities to `./logs/`
- Send Telegram alerts (if configured)
- Execute profitable opportunities (if auto-execute is enabled)

---

## Configuration

### Bot Configuration (`scripts/run-production-bot.ts`)

```typescript
const config: ProductionBotConfig = {
  // Scanning Configuration
  scanInterval: 30000,              // 30 seconds between scans
  refreshPoolsEvery: 10,            // Refresh pools every 10 scans
  baseToken: 'WETH',                // Base token for flash loans
  loanAmount: BigInt('10000000000000000000'), // 10 WETH
  
  // Execution Configuration
  minProfitThreshold: BigInt('50000000000000000'), // 0.05 ETH minimum
  autoExecute: false,               // Set to true to enable auto-execution
  maxGasPrice: BigInt('5000000000'), // 5 gwei max gas price
  
  // Logging Configuration
  logDir: './logs',
  
  // Telegram Configuration
  telegramConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: true,
  },
  
  // Performance Monitoring
  enablePerformanceMonitoring: true,
};
```

### Key Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `scanInterval` | Time between scans (ms) | 30000 (30s) |
| `refreshPoolsEvery` | How often to refresh pool states | 10 scans |
| `loanAmount` | Flash loan amount | 10 WETH |
| `minProfitThreshold` | Minimum profit to execute | 0.05 ETH |
| `autoExecute` | Enable automatic execution | false |
| `maxGasPrice` | Maximum gas price (wei) | 5 gwei |

---

## Features

### 1. Pool Discovery System

The bot automatically discovers and tracks pools from all configured DEXs:

- **Uniswap V2/V3/V4**
- **SushiSwap V2/V3**
- **PancakeSwap V2/V3**
- **Aerodrome**
- **Curve**
- **BaseSwap**

Pool states are refreshed periodically to ensure accurate opportunity detection.

### 2. Real-Time Logging

Every opportunity is logged with comprehensive details:

#### Log Entry Includes:

- **Timestamp and Block Number**
- **Flash Loan Details**
  - Asset and amount
  - Aave V3 flash loan premium fee
- **Arbitrage Strategy**
  - Strategy name (e.g., Multi-Hop, Fee-Tier)
  - Strategy score
- **Token Path**
  - Token symbols, addresses, and decimals
- **DEX Route**
  - DEX used for each hop
- **Profit Calculation**
  - Gross profit
  - Net profit after fees
- **Fee Breakdown**
  - Slippage
  - Swap fees
  - Gas cost
  - Flash loan premium
  - Total fees
- **Execution Decision**
  - Whether opportunity meets threshold
  - Decision (EXECUTE or SKIP)

#### Log File Format:

```
logs/arbitrage-opportunities-2024-01-15T10-30-00-000Z.log
```

### 3. Telegram Alerts

Get instant notifications for:

#### Opportunity Alerts
- New arbitrage opportunities detected
- Profit calculations and fee breakdown
- Execution decision

#### Execution Alerts
- Transaction submission
- Execution results (success/failed)
- Actual profit earned

#### Error Alerts
- Scan errors
- Execution failures
- RPC connection issues

#### Alert Example:

```
🎯 ARBITRAGE OPPORTUNITY

📊 Strategy: Multi-Hop Arbitrage
🔢 Block: 12345678
⚡ Score: 0.8750

💰 Flash Loan: 10.0 WETH

🔄 Route:
  1. WETH via Uniswap V3
  2. USDC via SushiSwap V3
  3. DAI via Curve
  4. WETH via Aerodrome

💵 Profit:
  Gross: 0.123456 ETH
  Net: 0.087654 ETH
  Threshold: 0.050000 ETH

📊 Fees:
  Slippage: 0.002000 ETH
  Swap Fees: 0.008000 ETH
  Gas: 0.015000 ETH
  Flash Fee: 0.009000 ETH

🎯 Decision: ✅ EXECUTE
```

### 4. Performance Monitoring

Track bot performance with real-time metrics:

#### Metrics Tracked:
- **Uptime** - How long the bot has been running
- **Scan Count** - Total number of scans performed
- **Opportunities Found** - Total opportunities detected
- **Executions** - Number of execution attempts
- **Success Rate** - Percentage of successful executions
- **Total Profit** - Cumulative profit earned
- **Total Gas Cost** - Cumulative gas costs
- **Average Scan Time** - Average time per scan

#### View Metrics:

Press `Ctrl+C` to stop the bot and see the performance summary:

```
================================================================================
📊 PERFORMANCE METRICS
================================================================================
Uptime:                2h 30m
Total Scans:           300
Opportunities Found:   45
Executions:            12
Success Rate:          91.67%
Total Profit:          1.234567 ETH
Total Gas Cost:        0.123456 ETH
Average Scan Time:     2.45s
================================================================================
```

### 5. Multi-RPC System

The bot uses 8 public RPC nodes for scanning and 2 private RPC nodes for execution:

#### Benefits:
- **Reliability** - Automatic failover if a node fails
- **Performance** - Load balancing across multiple nodes
- **Cost Savings** - Use public RPCs for free scanning
- **Execution Quality** - Private RPCs for reliable transaction execution

#### Health Monitoring:
- Continuous health checks every 30 seconds
- Automatic marking of unhealthy nodes
- Round-robin load balancing
- Response time tracking

---

## Running the Bot

### Basic Usage

```bash
# Run the production bot
npm run bot

# Run a quick test scan
npm run bot:test
```

### Graceful Shutdown

Press `Ctrl+C` to gracefully stop the bot. The bot will:
1. Stop scanning
2. Complete any pending operations
3. Log performance metrics
4. Close all connections
5. Send shutdown notification (if Telegram is enabled)

### Background Execution

To run the bot in the background:

```bash
# Using nohup
nohup npm run bot > bot.log 2>&1 &

# Using screen
screen -S arbitrage-bot
npm run bot
# Press Ctrl+A then D to detach

# Using tmux
tmux new -s arbitrage-bot
npm run bot
# Press Ctrl+B then D to detach
```

---

## Monitoring

### Log Files

Logs are stored in the `./logs/` directory:

```bash
# View latest log
tail -f logs/arbitrage-opportunities-*.log

# Search for successful executions
grep "EXECUTE" logs/arbitrage-opportunities-*.log

# View error messages
grep "ERROR" logs/arbitrage-opportunities-*.log
```

### Telegram Alerts

Configure Telegram to receive real-time alerts (see [Telegram Setup](#telegram-setup))

### Performance Metrics

The bot displays performance metrics on shutdown:

```bash
# Stop the bot
Ctrl+C

# View performance summary
```

---

## Telegram Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the **Bot Token** (starts with `botToken`)

### 2. Get Your Chat ID

1. Open Telegram and search for [@userinfobot](https://t.me/userinfobot)
2. Send `/start` command
3. Copy your **Chat ID**

### 3. Configure Environment Variables

Add to your `.env` file:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### 4. Test the Connection

The bot will automatically test the Telegram connection on startup.

---

## Performance Optimization

### Scan Interval Optimization

Adjust the scan interval based on your needs:

```typescript
// Fast scanning (more opportunities, higher RPC costs)
scanInterval: 10000, // 10 seconds

// Balanced scanning
scanInterval: 30000, // 30 seconds (recommended)

// Slow scanning (fewer opportunities, lower RPC costs)
scanInterval: 60000, // 60 seconds
```

### Pool Refresh Frequency

Balance between accuracy and performance:

```typescript
// Refresh pools frequently (more accurate, higher cost)
refreshPoolsEvery: 5, // Every 5 scans

// Balanced refresh
refreshPoolsEvery: 10, // Every 10 scans (recommended)

// Refresh pools infrequently (less accurate, lower cost)
refreshPoolsEvery: 20, // Every 20 scans
```

### Profit Threshold Optimization

Set minimum profit threshold based on your risk tolerance:

```typescript
// Aggressive (more executions, higher risk)
minProfitThreshold: BigInt('10000000000000000'), // 0.01 ETH

// Conservative (fewer executions, lower risk)
minProfitThreshold: BigInt('100000000000000000'), // 0.1 ETH
```

### Gas Price Management

Avoid expensive transactions:

```typescript
// Low gas limit (may miss opportunities during high gas)
maxGasPrice: BigInt('2000000000'), // 2 gwei

// Medium gas limit
maxGasPrice: BigInt('5000000000'), // 5 gwei (recommended)

// High gas limit (catch more opportunities, higher cost)
maxGasPrice: BigInt('10000000000'), // 10 gwei
```

---

## Troubleshooting

### Bot Won't Start

**Problem**: Bot fails to initialize

**Solutions**:
1. Check RPC connections are working
2. Verify private key is correct (if using auto-execute)
3. Ensure all dependencies are installed: `npm install`
4. Check logs for specific error messages

### No Opportunities Found

**Problem**: Bot scans but finds no opportunities

**Solutions**:
1. Lower the `minProfitThreshold`
2. Increase the `loanAmount`
3. Check if pools are being discovered: look at pool count in logs
4. Verify RPC nodes are returning current data

### Telegram Alerts Not Working

**Problem**: Not receiving Telegram alerts

**Solutions**:
1. Verify bot token and chat ID are correct
2. Check that the bot has permissions to send messages
3. Test the connection: send a message to your bot
4. Check logs for Telegram-related errors

### High Gas Costs

**Problem**: Executions are too expensive

**Solutions**:
1. Lower `maxGasPrice`
2. Increase `minProfitThreshold`
3. Optimize transaction encoding
4. Use Flashbots for MEV protection

### RPC Connection Issues

**Problem**: Frequent RPC connection failures

**Solutions**:
1. Add more public RPC nodes
2. Use private RPC nodes for better reliability
3. Increase `requestTimeout` in RPC config
4. Check your internet connection

### Memory Issues

**Problem**: Bot uses too much memory

**Solutions**:
1. Increase `refreshPoolsEvery` to reduce pool updates
2. Reduce scan interval
3. Limit number of DEXs being monitored
4. Check for memory leaks in custom code

---

## Advanced Configuration

### Custom Strategy Configuration

Modify strategy parameters in `src/strategies/`:

```typescript
// Example: Multi-hop strategy
this.multiHopStrategy = new MultiHopArbitrageStrategy(
  provider,
  4,      // Max hops
  0.01    // Minimum profit margin
);
```

### Custom Logging

Extend the logging system in `src/utils/logger.ts`:

```typescript
// Add custom log fields
interface CustomLogEntry extends OpportunityLogEntry {
  customField: string;
}
```

### Custom Alert Formatting

Modify alert templates in `src/utils/telegramAlert.ts`:

```typescript
private formatOpportunityMessage(entry: OpportunityLogEntry): string {
  // Custom formatting here
}
```

---

## Security Best Practices

1. **Never commit private keys** - Keep `.env` file secure
2. **Use private RPCs** - For execution to avoid front-running
3. **Enable MEV protection** - Use Flashbots for sensitive transactions
4. **Monitor gas prices** - Set reasonable limits to avoid losses
5. **Test thoroughly** - Test with small amounts before scaling
6. **Keep dependencies updated** - Regularly run `npm audit fix`
7. **Monitor logs** - Regularly review logs for unusual activity
8. **Use firewalls** - Restrict access to your execution servers

---

## Support

For issues and questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review the logs in `./logs/`
3. Check GitHub issues
4. Contact the development team

---

## License

See LICENSE file for details.