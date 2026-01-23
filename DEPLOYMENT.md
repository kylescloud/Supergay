# Deployment Guide

## Prerequisites

Before deploying the arbitrage bot, ensure you have:

1. **Node.js 20+** installed
2. **npm or yarn** package manager
3. **Base RPC URL** (Alchemy, Infura, or public)
4. **Private key** with ETH for gas and deployment
5. **BaseScan API key** (optional, for contract verification)

## Step 1: Installation

```bash
# Clone the repository
git clone <repository-url>
cd base-aave-flashloan-arbitrage

# Install dependencies
npm install
```

## Step 2: Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Required Environment Variables

```env
# Base Network Configuration
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=your_basescan_api_key

# Private Key (NEVER commit this file)
PRIVATE_KEY=your_private_key_here

# Aave V3 Configuration
AAVE_V3_POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5

# Bot Configuration
MIN_PROFIT_THRESHOLD=0.01  # Minimum profit in USD
MAX_GAS_PRICE=20000000000  # 20 gwei maximum
FLASH_LOAN_PREMIUM=0.0009  # 0.09% Aave fee
SLIPPAGE_TOLERANCE=0.003   # 0.3% slippage

# MEV Protection
USE_FLASHBOTS=true
FLASHBOTS_RPC=https://rpc.flashbots.net

# Monitoring (Optional)
ENABLE_ALERTS=true
WEBHOOK_URL=your_webhook_url
```

## Step 3: Compile Contracts

```bash
# Compile TypeScript and Solidity
npm run build

# This will:
# - Compile Solidity contracts
# - Generate TypeScript type definitions
# - Compile TypeScript to JavaScript
```

## Step 4: Deploy Smart Contract

### Mainnet Deployment

```bash
# Deploy to Base mainnet
npm run deploy
```

This will:
1. Deploy `FlashLoanArbitrage.sol` to Base
2. Approve WETH for trading
3. Output contract address and transaction hash

### Testnet Deployment (Optional)

```bash
# Deploy to Base Goerli testnet
npx hardhat run scripts/deploy.ts --network baseGoerli
```

### Example Deployment Output

```
Deploying FlashLoanArbitrage contract to Base...
Deploying with account: 0x1234...
Account balance: 1.5 ETH

FlashLoanArbitrage deployed to: 0xabcd...

Waiting for block confirmations...
Transaction confirmed: 0x1234...

Deployment Info:
- Owner: 0x1234...
- Pool: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
- Min Profit: 0.001 ETH
- Max Gas Price: 20000000000 wei

=== Deployment Complete ===
Contract Address: 0xabcd...
Transaction Hash: 0x1234...
```

## Step 5: Verify Contract

```bash
# Verify contract on BaseScan
npm run verify
```

Or manually verify on [BaseScan](https://basescan.org):

1. Go to your contract address
2. Click "Verify and Publish"
3. Select compiler version: 0.8.20
4. Enable optimization (200 runs)
5. Paste contract source code
6. Click "Verify"

## Step 6: Fund Contract

Send ETH to the deployed contract address for gas:

```bash
# Using cast (Foundry)
cast send <CONTRACT_ADDRESS> --value 0.1ether --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY

# Using ethers.js
npx hardhat run scripts/fund-contract.ts --network base
```

**Recommended Initial Funding**: 0.1 - 0.5 ETH

## Step 7: Update Configuration

Add the deployed contract address to `.env`:

```env
FLASH_LOAN_RECEIVER=0xYourContractAddress
```

## Step 8: Test Deployment

### Single Scan Test

```bash
# Run a single scan to test opportunity detection
npm run scan
```

Expected output:
```
=== Running Single Scan ===
Building block snapshot...
Snapshot: 150 pools captured

[Strategy 1] Running Multi-Hop Cyclic Arbitrage...
Found 2 multi-hop opportunities

[Strategy 2] Running Fee-Tier Mispricing Arbitrage...
Found 1 fee-tier opportunities

=== Top 3 Opportunities ===

[1] WETH-USDC-WETH
    Profit: $0.0250
    Score: 0.8500
    Path: WETH → USDC → WETH
    DEXs: uniswap-v3 → uniswap-v2
```

### Backtest Test

```bash
# Test on recent blocks
npm run backtest 18000000 18000010
```

Expected output:
```
=== Starting Backtest ===
Block Range: 18000000 to 18000010

--- Processing Block 18000000 ---
Opportunities Found: 3
Successful Arbitrages: 2
Net Profit: 0.0025 ETH
Success Rate: 66.67%

=== Backtest Summary ===
Total Blocks: 10
Total Opportunities: 25
Total Successful: 18
Total Net Profit: 0.0250 ETH
Success Rate: 72.00%
```

## Step 9: Run in Production

### Continuous Mode

```bash
# Start bot in continuous monitoring mode
npm run continuous
```

The bot will:
- Monitor each new block
- Find arbitrage opportunities
- Execute profitable arbitrages
- Track profits and performance

### Using Process Manager (Recommended)

#### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start bot with PM2
pm2 start dist/index.js --name "arbitrage-bot" -- run continuous

# Monitor logs
pm2 logs arbitrage-bot

# Check status
pm2 status

# Stop bot
pm2 stop arbitrage-bot

# Restart bot
pm2 restart arbitrage-bot
```

#### Using Docker

```bash
# Build Docker image
docker build -t arbitrage-bot .

# Run container
docker run -d \
  --name arbitrage-bot \
  --env-file .env \
  arbitrage-bot

# View logs
docker logs -f arbitrage-bot

# Stop container
docker stop arbitrage-bot
```

## Step 10: Monitor Performance

### Check Bot Status

```bash
npm run status
```

### View Logs

```bash
# Tail logs
tail -f logs/arbitrage-bot.log

# Filter for successful arbitrages
grep "Arbitrage successful" logs/arbitrage-bot.log

# Filter for errors
grep "Error" logs/arbitrage-bot.log
```

### Monitor on Chain

Use [BaseScan](https://basescan.org) to monitor:
- Contract transactions
- Gas usage
- ETH balance
- Profit accumulation

## Troubleshooting

### Deployment Fails

**Issue**: Insufficient funds
```bash
# Check balance
cast balance $PRIVATE_KEY --rpc-url $BASE_RPC_URL

# Fund wallet (need at least 0.05 ETH for deployment)
```

**Issue**: Gas price too high
```bash
# Lower max gas price in .env
MAX_GAS_PRICE=10000000000  # 10 gwei
```

### No Opportunities Found

**Issue**: Pool states not fetching
```bash
# Check RPC connectivity
curl -X POST $BASE_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**Issue**: Minimum profit threshold too high
```bash
# Lower threshold in .env
MIN_PROFIT_THRESHOLD=0.001  # $0.001
```

### Transaction Reverts

**Issue**: Insufficient gas
```bash
# Fund contract with more ETH
cast send <CONTRACT_ADDRESS> --value 0.1ether --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

**Issue**: Slippage too high
```bash
# Increase slippage tolerance in .env
SLIPPAGE_TOLERANCE=0.005  # 0.5%
```

## Security Best Practices

### 1. Private Key Security
- **NEVER** commit `.env` file to version control
- Use environment-specific config files
- Consider using a hardware wallet for production
- Rotate private keys periodically

### 2. Contract Security
- Verify contract on BaseScan
- Audit contract code
- Use emergency pause functionality
- Set reasonable limits on gas and profit thresholds

### 3. Operational Security
- Monitor bot performance continuously
- Set up alerts for unusual activity
- Keep software updated
- Test changes on testnet first
- Use rate limiting on RPC calls

### 4. Financial Security
- Start with small amounts
- Set stop-loss limits
- Diversify across multiple strategies
- Monitor profit vs gas costs
- Rebalance regularly

## Maintenance

### Regular Updates

```bash
# Update dependencies
npm update

# Rebuild
npm run build

# Restart bot
pm2 restart arbitrage-bot
```

### Backup Configuration

```bash
# Backup .env file
cp .env .env.backup

# Backup configuration
tar -czf config-backup.tar.gz .env constants.ts
```

### Log Rotation

Set up log rotation to prevent disk space issues:

```bash
# Install logrotate
sudo apt-get install logrotate

# Create logrotate config
cat > /etc/logrotate.d/arbitrage-bot << EOF
/path/to/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

## Performance Tuning

### Optimization Tips

1. **Increase RPC throughput**:
   ```env
   # Use high-throughput RPC provider
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   ```

2. **Adjust profit threshold**:
   ```env
   # Lower threshold for more opportunities
   MIN_PROFIT_THRESHOLD=0.005  # $0.005
   ```

3. **Optimize gas limits**:
   ```ts
   // Adjust in src/config/constants.ts
   GAS_LIMITS = {
     FLASH_LOAN_OVERHEAD: 100000,  // Reduce if stable
     SWAP_PER_HOP: 80000,         // Fine-tune based on actual usage
   }
   ```

4. **Enable caching**:
   ```ts
   // Cache pool states to reduce RPC calls
   // Implementation in stateSnapshot.ts
   ```

## Production Checklist

Before going to production:

- [ ] Tested on testnet
- [ ] Backtested on historical data
- [ ] Contract verified on BaseScan
- [ ] Private key secured
- [ ] Monitoring set up
- [ ] Alerts configured
- [ ] Emergency procedures documented
- [ ] Gas limits optimized
- [ ] Profit thresholds tuned
- [ ] Backup procedures in place
- [ ] Team trained on operations

## Support

For deployment issues:
1. Check logs: `tail -f logs/arbitrage-bot.log`
2. Review this guide
3. Check GitHub issues
4. Contact support team

## Post-Deployment

After successful deployment:

1. **Monitor Performance**
   - Track profit per block
   - Monitor success rate
   - Analyze gas costs

2. **Optimize Parameters**
   - Adjust profit thresholds
   - Fine-tune gas limits
   - Optimize loan sizes

3. **Scale Up**
   - Increase loan amounts
   - Add more DEXs
   - Deploy to multiple chains

4. **Report Issues**
   - Document any bugs
   - Suggest improvements
   - Share successful strategies

---

**Congratulations!** Your arbitrage bot is now deployed and ready to execute profitable arbitrages on Base.