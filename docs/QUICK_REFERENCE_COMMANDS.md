# ⚡ Quick Reference Commands
## Production Mainnet Deployment

---

## 🚀 Initial Setup Commands

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt-get install -y git

# Clone repository
git clone https://github.com/kylescloud/Supergay.git
cd Supergay
git checkout SupergayV2

# Install dependencies
npm install

# Verify installation
npm run build
npm test
```

---

## ⚙️ Configuration Commands

```bash
# Create environment file
cp .env.example .env
nano .env

# Required .env variables:
# PRIVATE_KEY=your_private_key_here
# PRIVATE_RPC_1=https://your-quicknode-endpoint.quiknode.pro/your-key/
# PRIVATE_RPC_2=https://base-mainnet.g.alchemy.com/v2/your-alchemy-key/
# QUICKNODE_RPC=https://your-quicknode-endpoint.quiknode.pro/your-key/
# ALCHEMY_RPC=https://base-mainnet.g.alchemy.com/v2/your-alchemy-key/
# CHAIN_ID=8453
# AAVE_V3_POOL_ADDRESS=0xA238Dd80C259a72e81d7e4b422E3588869B8325B
# FLASH_LOAN_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

---

## 📜 Smart Contract Deployment

```bash
# Compile contracts
npm run compile

# Deploy to Base mainnet
npx hardhat run scripts/deploy-flash-loan-contract.ts --network base

# Verify deployment
cat data/deployment-info.json

# Test contract interaction
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  const paused = await contract.paused();
  console.log("Contract paused:", paused);
}
EOF
```

---

## 🤖 Bot Configuration

```bash
# Update pool registry
npm run update-pools

# Diagnose pools
npm run diagnose-pools

# Test opportunity scanner
node scripts/run-opportunity-scanner.ts

# Test continuous scanner (1 minute)
timeout 60 node scripts/continuous-opportunity-scanner.ts

# Test FlashLoanExecutor (all 4 strategies)
node scripts/test-comprehensive-execution.ts

# Test RPC health
npm run test-rpc-health

# Estimate gas costs
npm run estimate-gas
```

---

## 🧪 Pre-Deployment Testing

```bash
# Test on Base Sepolia testnet (optional but recommended)
npx hardhat run scripts/deploy-flash-loan-contract.ts --network base_sepolia
npx hardhat run scripts/test-execution-on-testnet.ts --network base_sepolia

# Verify gas costs
npm run estimate-gas

# Verify RPC failover
npm run test-rpc-health

# Dry run mode (set "dryRun": true in config.json)
npm run automated-executor

# Security check
git status | grep .env
grep -r "private_key" . --exclude-dir=node_modules --exclude-dir=.git
```

---

## 🚀 Production Deployment

```bash
# Fund wallet with ETH (via Base bridge)
# Verify balance
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Wallet balance:", ethers.formatEther(balance), "ETH");
}
EOF

# Configure for production (set "executionEnabled": true, "dryRun": false in config.json)
nano config.json

# Start automated executor
npm run automated-executor

# Or use PM2 for production
npm install -g pm2
pm2 start npm --name "arbitrage-bot" -- run automated-executor
pm2 monit
pm2 save
pm2 startup
```

---

## 📊 Monitoring Commands

```bash
# Real-time logs
tail -f logs/execution.log

# Check successful executions
tail -n 1000 logs/execution.log | grep "Execution successful"

# Check recent opportunities
tail -n 100 logs/execution.log | grep "Opportunity found"

# PM2 monitoring
pm2 monit
pm2 logs arbitrage-bot
pm2 status

# TMUX monitoring (if using tmux)
tmux attach -t arbitrage-bot
tmux list-sessions
```

---

## 🏥 Health Check Script

```bash
#!/bin/bash
# Save as health-check.sh
chmod +x health-check.sh

echo "=== Health Check $(date) ==="

# Check if bot is running
if pgrep -f "automated-executor" > /dev/null; then
    echo "✅ Bot is running"
else
    echo "❌ Bot is NOT running"
    exit 1
fi

# Check RPC health
echo "=== RPC Health ==="
npm run test-rpc-health

# Check wallet balance
echo "=== Wallet Balance ==="
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
}
EOF

# Check recent executions
echo "=== Recent Executions ==="
tail -n 20 logs/execution.log | grep "Execution successful"

# Set up cron job (run every hour)
# (crontab -l 2>/dev/null; echo "0 * * * * /path/to/health-check.sh >> logs/health-check.log 2>&1") | crontab -
```

---

## 🚨 Emergency Commands

```bash
# STOP BOT IMMEDIATELY

# Method 1: PM2
pm2 stop arbitrage-bot

# Method 2: Kill process
pkill -f "automated-executor"

# Method 3: TMUX
tmux kill-session -t arbitrage-bot

# PAUSE SMART CONTRACT
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  console.log("Pausing contract...");
  const tx = await contract.pause();
  await tx.wait();
  console.log("Contract paused!");
  console.log("TX:", tx.hash);
}
EOF

# EMERGENCY WITHDRAW FUNDS
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  
  const ethBalance = await ethers.provider.getBalance(
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  console.log("ETH Balance:", ethers.formatEther(ethBalance), "ETH");
  
  if (ethBalance > 0n) {
    console.log("Withdrawing ETH...");
    const tx = await contract.emergencyWithdrawEth();
    await tx.wait();
    console.log("ETH withdrawn!");
    console.log("TX:", tx.hash);
  }
}
EOF

# UNPAUSE CONTRACT (after fix)
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  console.log("Unpausing contract...");
  const tx = await contract.unpause();
  await tx.wait();
  console.log("Contract unpaused!");
  console.log("TX:", tx.hash);
}
EOF
```

---

## 🔄 Maintenance Commands

```bash
# Daily: Check logs
tail -n 500 logs/execution.log

# Weekly: Update code and dependencies
git pull origin SupergayV2
npm update
npm run update-pools

# Test after updates (dry run mode)
# Set "dryRun": true in config.json
npm run automated-executor

# Go back to production after successful test
# Set "dryRun": false in config.json
npm run automated-executor

# Monthly: Security audit
npm audit
npm audit fix

# Rotate keys (if using software wallet)
# Update PRIVATE_KEY in .env
```

---

## 📈 Performance Analysis Commands

```bash
# Count successful executions
grep "Execution successful" logs/execution.log | wc -l

# Count failed executions
grep "Execution failed" logs/execution.log | wc -l

# Calculate success rate
SUCCESS=$(grep "Execution successful" logs/execution.log | wc -l)
TOTAL=$(grep "Execution" logs/execution.log | wc -l)
RATE=$(echo "scale=2; $SUCCESS / $TOTAL * 100" | bc)
echo "Success rate: $RATE%"

# Average profit per execution
grep "Profit:" logs/execution.log | awk '{print $NF}' | sed 's/\$//' | awk '{sum+=$1; count++} END {print "Average profit:", sum/count}'

# Average scan time
grep "Scan time" logs/execution.log | awk '{print $3}' | sed 's/ms//' | awk '{sum+=$1; count++} END {print "Average scan time:", sum/count, "ms"}'

# Hourly execution rate
grep "Execution successful" logs/execution.log | cut -d' ' -f1,2 | uniq -c | awk '{print "Hour:", $2, $3, "Executions:", $1}'

# Total profit
grep "Profit:" logs/execution.log | awk '{print $NF}' | sed 's/\$//' | awk '{sum+=$1} END {print "Total profit: $", sum}'
```

---

## 🧪 Testing Commands

```bash
# Test all components
npm test

# Test opportunity detection
node scripts/run-opportunity-scanner.ts

# Test continuous scanning
timeout 60 node scripts/continuous-opportunity-scanner.ts

# Test execution with all 4 strategies
node scripts/test-comprehensive-execution.ts

# Test RPC connectivity
npm run test-rpc-health

# Test contract interaction
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  console.log("Contract paused:", await contract.paused());
  console.log("Aave Pool:", await contract.aavePool());
  console.log("Owner:", await contract.owner());
}
EOF
```

---

## 🎯 One-Line Quick Start

```bash
# Complete setup and deployment (for experienced users)
git clone https://github.com/kylescloud/Supergay.git && \
cd Supergay && \
git checkout SupergayV2 && \
npm install && \
cp .env.example .env && \
nano .env && \
npm run compile && \
npx hardhat run scripts/deploy-flash-loan-contract.ts --network base && \
npm run update-pools && \
node scripts/test-comprehensive-execution.ts && \
nano config.json && \
pm2 start npm --name "arbitrage-bot" -- run automated-executor && \
pm2 monit
```

---

## ⚠️ Safety Commands

```bash
# Verify .env is not committed
git status | grep .env

# Check for exposed secrets
grep -r "private_key" . --exclude-dir=node_modules --exclude-dir=.git

# Verify contract is not paused
npx hardhat run --network base << 'EOF'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const contract = await ethers.getContractAt(
    "FlashLoanArbitrage",
    process.env.FLASH_LOAN_CONTRACT_ADDRESS!
  );
  const paused = await contract.paused();
  if (paused) {
    console.error("ERROR: Contract is paused!");
    process.exit(1);
  }
  console.log("✅ Contract is not paused");
}
EOF

# Check wallet balance before deployment
npx hardhat run --network base << 'EOFS'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  const ethBalance = ethers.formatEther(balance);
  console.log("Wallet balance:", ethBalance, "ETH");
  if (parseFloat(ethBalance) < 0.001) {
    console.error("ERROR: Insufficient balance! Need at least 0.001 ETH for gas fees");
    process.exit(1);
  }
  console.log("✅ Sufficient balance (minimum 0.001 ETH)");
  console.log("💡 Recommended: 0.01 ETH for comfortable buffer");
}
EOFS
```

---

## 📞 Useful Links

- Base Network: https://www.base.org/
- BaseScan: https://basescan.org/
- Aave V3: https://docs.aave.com/
- QuickNode: https://www.quicknode.com/
- Alchemy: https://www.alchemy.com/

---

## 📝 Configuration Templates

### config.json (Production)
```json
{
  "executionEnabled": true,
  "dryRun": false,
  "minProfitPercent": 0.3,
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
  }
}
```

**Important Notes:**
- Flash loans provide the principal amount (no upfront capital needed)
- You only need ETH for gas fees (minimum 0.001 ETH ~$3-5 USD)
- Recommended: 0.01 ETH (~$30 USD) for comfortable buffer
- Gas token must be ETH - no other tokens accepted

### config.json (Dry Run / Testing)
```json
{
  "executionEnabled": false,
  "dryRun": true,
  "minProfitPercent": 0.3,
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
  }
}
```

---

## ✅ Pre-Deployment Checklist

```bash
# Run all checks at once

echo "=== Pre-Deployment Checklist ==="

# 1. Check Node.js version
echo -n "Node.js version: "
node --version

# 2. Check npm version
echo -n "npm version: "
npm --version

# 3. Check dependencies
echo -n "Dependencies installed: "
if [ -d "node_modules" ]; then echo "✅"; else echo "❌"; fi

# 4. Check .env exists
echo -n ".env file: "
if [ -f ".env" ]; then echo "✅"; else echo "❌"; fi

# 5. Check .env not in git
echo -n ".env not committed: "
if ! git ls-files .env | grep -q .env; then echo "✅"; else echo "❌"; fi

# 6. Check contract deployed
echo -n "Contract address configured: "
if grep -q "FLASH_LOAN_CONTRACT_ADDRESS" .env; then echo "✅"; else echo "❌"; fi

# 7. Check RPC configured
echo -n "RPC endpoints configured: "
if grep -q "PRIVATE_RPC_1" .env && grep -q "PRIVATE_RPC_2" .env; then echo "✅"; else echo "❌"; fi

# 8. Check pool registry
echo -n "Pool registry exists: "
if [ -f "data/pool-registry.json" ]; then echo "✅"; else echo "❌"; fi

# 9. Run tests
echo "Running tests..."
npm test

# 10. Check wallet balance
echo "Checking wallet balance..."
npx hardhat run --network base << 'EOFS'
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  const ethBalance = ethers.formatEther(balance);
  console.log("Wallet balance:", ethBalance, "ETH");
  if (parseFloat(ethBalance) < 0.001) {
    console.error("ERROR: Insufficient balance! Need at least 0.001 ETH for gas fees");
    process.exit(1);
  }
  console.log("✅ Sufficient balance (minimum 0.001 ETH)");
  console.log("💡 Recommended: 0.01 ETH for comfortable buffer");
  console.log("💡 Flash loans provide principal - you only need ETH for gas fees");
}
EOFS

echo "=== Checklist Complete ==="
```

---

*Last updated: $(date)*
*For the complete guide, see: PRODUCTION_MAINNET_DEPLOYMENT_GUIDE.md*