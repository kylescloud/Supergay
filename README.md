# Base Chain Aave V3 Flash Loan Arbitrage Bot

A production-ready arbitrage bot built for the Base blockchain that utilizes Aave V3 flash loans to execute profitable arbitrage opportunities across multiple DEXs including Uniswap V2/V3, SushiSwap, and Curve.

## 🎯 Features

### Core Strategies (7 Mathematical Proofs)

1. **Multi-Hop Cyclic Arbitrage**
   - Uses negative log-weight cycle detection
   - Mathematical guarantee: Σ(-ln(rate)) < 0 ⇒ Π(rate) > 1
   - Detects cycles that pairwise scanners miss

2. **Fee-Tier Mispricing Arbitrage**
   - Exploits different fee tiers in Uniswap V3
   - Rate formula: R = (√P_out / √P_in)² * (1 - f)
   - Captures transient arbitrage before liquidity rebalances

3. **Liquidity Fragmentation Arbitrage**
   - Calculates marginal rates, not just prices
   - Key invariant: dy/dx = -y/x
   - Buys in low-slope pools, sells in high-slope pools

4. **Stable ↔ Volatile Curve Arbitrage**
   - Exploits second derivative differences
   - Stable pools: d²y/dx² ≈ 0 (resists movement)
   - Volatile pools: d²y/dx² ≠ 0 (overshoots)

5. **Flash Loan Size Optimization**
   - Optimizes loan size using binary search
   - Profit function: π(x) = x * Π(rate(x)) - x - costs(x)
   - Finds argmax_x π(x) for maximum profit

6. **Gas Convexity Filter**
   - Accounts for stepwise gas costs
   - Rejects trades where Δprofit < Δgas * riskFactor
   - Avoids MEV bait

7. **Time-Decay Opportunity Scoring**
   - Score = profit * e^(-latency * λ)
   - Only executes highest-score opportunities
   - Prevents stale opportunity execution

### MEV Protection

- **Private RPC Integration**: Flashbots-style private mempool
- **Path Entropy Calculation**: Higher entropy = harder to copy
- **Single Transaction**: Atomic execution with no approvals
- **On-Chain Safety Check**: Reverts if profit < expected
- **Gas Optimization**: Convex gas cost modeling

### Block Replay & Backtesting

- **Historical State Fetching**: Exact block replay
- **Profit Validation**: Removes hindsight bias
- **Execution Simulation**: Tests with historical gas prices
- **Performance Metrics**: Success rate, profit per block

## 📋 Prerequisites

- Node.js 20+
- npm or yarn
- Base RPC URL (Alchemy, Infura, or public)
- Private key with ETH for gas
- (Optional) Flashbots RPC for MEV protection

## 🚀 Installation

```bash
# Clone repository
git clone <repository-url>
cd base-aave-flashloan-arbitrage

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## ⚙️ Configuration

Edit `.env` file:

```env
# Base Network
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=your_basescan_api_key

# Private Key
PRIVATE_KEY=your_private_key_here

# Aave V3
AAVE_V3_POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5

# Contract Address (after deployment)
FLASH_LOAN_RECEIVER=0x...

# Bot Configuration
MIN_PROFIT_THRESHOLD=0.01  # $0.01 minimum profit
MAX_GAS_PRICE=20000000000  # 20 gwei
FLASH_LOAN_PREMIUM=0.0009  # 0.09% Aave fee
SLIPPAGE_TOLERANCE=0.003   # 0.3%

# MEV Protection
USE_FLASHBOTS=true
FLASHBOTS_RPC=https://rpc.flashbots.net
```

## 🏗️ Deployment

### 1. Deploy Smart Contract

```bash
npm run deploy
```

This will:
- Deploy `FlashLoanArbitrage.sol` to Base
- Approve WETH for trading
- Output contract address

### 2. Verify Contract

```bash
npm run verify
```

### 3. Fund Contract

Send ETH to contract address for gas:

```bash
cast send <CONTRACT_ADDRESS> --value 0.1ether --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

### 4. Update .env

Add contract address to `.env`:

```env
FLASH_LOAN_RECEIVER=0xYourContractAddress
```

## 📖 Usage

### Continuous Mode (Production)

Monitor blocks continuously and execute profitable arbitrages:

```bash
npm run continuous
```

### Single Scan

Run a one-time scan for opportunities:

```bash
npm run scan
```

### Backtesting

Test strategies on historical blocks:

```bash
npm run backtest <startBlock> <endBlock>
```

Example:

```bash
npm run backtest 18000000 18000050
```

This will:
- Replay each block
- Find opportunities at each block
- Simulate execution with historical gas
- Generate performance report
- Save results to `backtest_results.csv`

### Build

Compile TypeScript and Solidity:

```bash
npm run build
```

## 🧪 Testing

Run unit tests:

```bash
npm test
```

## 📊 Architecture

```
src/
├── config/              # Configuration and constants
├── dex/                 # DEX interfaces (Uniswap V2/V3, Curve)
├── math/                # Mathematical models
│   ├── effectiveRate.ts # Effective rate calculation
│   └── graph.ts         # Graph theory for cycle detection
├── strategies/          # Arbitrage strategies
│   ├── baseStrategy.ts
│   ├── multiHopArbitrage.ts
│   ├── feeTierArbitrage.ts
│   ├── liquidityFragmentation.ts
│   ├── stableVolatileArbitrage.ts
│   ├── flashLoanOptimizer.ts
│   ├── gasConvexityFilter.ts
│   └── timeDecayScoring.ts
├── opportunity/         # Opportunity finding
│   └── opportunityFinder.ts
├── execution/           # Execution engine
│   └── executor.ts
├── replay/             # Block replay & backtesting
│   └── backtest.ts
└── index.ts            # Main entry point

contracts/
├── FlashLoanArbitrage.sol
└── interfaces/
    └── IDEXRouter.sol
```

## 🔬 Mathematical Foundation

### Effective Rate Calculation

Instead of price: `price = reserveOut / reserveIn` ❌

We use: `effectiveRate(amount) = amountOut(amount) / amount` ✓

This embeds:
- AMM curve dynamics
- Trading fees
- Slippage
- Liquidity shape

### Negative Cycle Detection

Transform to log space:
```
weight = -ln(effectiveRate)
```

Properties:
- Multiplication → addition
- Arbitrage → negative cycle
- Gas, flash fees → additive penalties

### Profit Optimization

```
π(x) = x * Π(rate(x)) - x - costs(x)

Optimal: dπ/dx = 0 and d²π/dx² < 0
```

### MEV-Aware Scoring

```
score = (profit / gas) * e^(-λ * latency) * (1 + entropy)
```

Where:
- λ = latency decay constant (0.1)
- entropy = path uniqueness metric

## 🛡️ Safety Features

### On-Chain Protection

```solidity
require(
  IERC20(asset).balanceOf(address(this)) > amount + premium,
  "NOT_PROFITABLE"
);
```

Converts MEV attacks into free reverts, not losses.

### Gas Convexity Filter

- Rejects trades with high gas convexity
- Prevents execution when profit margin too thin
- Accounts for gas price volatility

### Time Decay Scoring

- Old opportunities get lower scores
- Only executes highest-score opportunities
- Prevents stale opportunity execution

## 📈 Performance Metrics

The bot tracks:
- Total opportunities found
- Successful arbitrages
- Net profit (after gas and fees)
- Gas costs
- Success rate
- Average profit per arbitrage

## 🔒 Security

- Private key stored in `.env` (never commit)
- On-chain profit validation
- MEV protection mechanisms
- Gas optimization
- Slippage tolerance
- Maximum gas price limits

## 🐛 Troubleshooting

### Contract Deployment Fails

Ensure you have sufficient ETH in your wallet:
```bash
cast balance $PRIVATE_KEY --rpc-url $BASE_RPC_URL
```

### No Opportunities Found

- Check if pool states are being fetched correctly
- Verify DEX addresses in `constants.ts`
- Try increasing loan amount
- Check minimum profit threshold

### Transaction Reverts

- Check gas price settings
- Verify contract has enough ETH for gas
- Check pool liquidity
- Review transaction error messages

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## ⚠️ Disclaimer

This software is provided as-is for educational and research purposes. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this software. Always test thoroughly with small amounts before deploying with significant capital.

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation
- Review code comments

---

Built with ❤️ by NinjaTech AI