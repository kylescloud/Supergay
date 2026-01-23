# Architecture Documentation

## System Overview

This is a production-ready arbitrage bot for the Base blockchain that uses Aave V3 flash loans to execute profitable arbitrage opportunities across multiple DEXs.

## Core Components

### 1. Mathematical Engine (`src/math/`)

#### Effective Rate Calculation
- **Purpose**: Calculates the actual exchange rate accounting for AMM curves, fees, and slippage
- **Key Insight**: Uses `effectiveRate(amount) = amountOut(amount) / amount` instead of simple price ratios
- **Supports**: Uniswap V2 (constant product), Uniswap V3 (concentrated liquidity), Curve (stable swap)
- **File**: `effectiveRate.ts`

#### Graph Theory (`graph.ts`)
- **Purpose**: Builds token exchange graph and detects profitable cycles
- **Algorithm**: Bellman-Ford for negative cycle detection
- **Transformation**: Converts multiplicative arbitrage to additive problem using log-space
- **Key Formula**: Negative cycle ⇔ Σ(-ln(rate)) ⇔ Π(rate) > 1
- **Classes**: `ExchangeGraph`, `GraphNode`, `GraphEdge`

### 2. DEX Integration Layer (`src/dex/`)

#### Uniswap V3 (`uniswapV3.ts`)
- **Features**: Concentrated liquidity support, tick-based pricing, multiple fee tiers
- **Classes**: `UniswapV3Pool`, `UniswapV3Factory`
- **Key Methods**: `getPoolState()`, `quoteSwap()`, `calculateOutputAmount()`

#### Uniswap V2 (`uniswapV2.ts`)
- **Features**: Constant product formula, reserve-based pricing
- **Classes**: `UniswapV2Pair`, `UniswapV2Factory`
- **Key Methods**: `getPoolState()`, `quoteSwap()`, `calculateOutputAmount()`

#### Curve (`curve.ts`)
- **Features**: Stable swap curve, low slippage for stablecoins
- **Classes**: `CurvePool`, `CurveRegistry`
- **Key Methods**: `getPoolState()`, `quoteSwap()`, `calculateOutputAmount()`

#### State Snapshot (`stateSnapshot.ts`)
- **Purpose**: Captures DEX states at specific block heights for accurate replay
- **Key Feature**: Historical block state fetching without latest state bias
- **Class**: `StateSnapshotManager`

### 3. Arbitrage Strategies (`src/strategies/`)

#### Base Strategy (`baseStrategy.ts`)
- **Interface**: `IArbitrageStrategy`
- **Class**: `BaseStrategy` (abstract base class)
- **Common Methods**: `validateOpportunity()`, `calculateFlashFee()`

#### Multi-Hop Cyclic Arbitrage (`multiHopArbitrage.ts`)
- **Strategy**: Detects negative log-weight cycles in token graph
- **Max Hops**: 4 (configurable)
- **Key Feature**: Finds cycles pairwise scanners miss

#### Fee-Tier Mispricing (`feeTierArbitrage.ts`)
- **Strategy**: Exploits different Uniswap V3 fee tiers for same pair
- **Key Formula**: R = (√P_out / √P_in)² * (1 - f)
- **Edge**: Captures transient arbitrage before liquidity rebalances

#### Liquidity Fragmentation (`liquidityFragmentation.ts`)
- **Strategy**: Buys in low-slope pools, sells in high-slope pools
- **Key Metric**: Marginal rate dy/dx, not just price
- **Invariant**: dy/dx = -y/x for constant product AMMs

#### Stable-Volatile Arbitrage (`stableVolatileArbitrage.ts`)
- **Strategy**: Exploits second derivative differences
- **Stable Pools**: d²y/dx² ≈ 0 (resists movement)
- **Volatile Pools**: d²y/dx² ≠ 0 (overshoots)
- **Paths**: Stable → Stable → Volatile → Stable

#### Flash Loan Optimizer (`flashLoanOptimizer.ts`)
- **Purpose**: Optimizes loan size for maximum profit
- **Method**: Binary search over profit function
- **Formula**: π(x) = x * Π(rate(x)) - x - costs(x)
- **Optimal**: dπ/dx = 0 and d²π/dx² < 0

#### Gas Convexity Filter (`gasConvexityFilter.ts`)
- **Purpose**: Filters opportunities by gas efficiency
- **Key Check**: Δprofit < Δgas * riskFactor
- **Features**: Convex gas cost modeling, MEV bait detection

#### Time Decay Scoring (`timeDecayScoring.ts`)
- **Purpose**: Scores opportunities based on freshness
- **Formula**: score = profit * e^(-latency * λ)
- **Lambda**: 0.1 (decay constant)
- **Feature**: Prevents stale opportunity execution

### 4. Opportunity Finder (`src/opportunity/`)

#### Opportunity Finder (`opportunityFinder.ts`)
- **Purpose**: Coordinates all strategies to find opportunities
- **Workflow**:
  1. Build block snapshot
  2. Run all strategies
  3. Remove duplicates
  4. Optimize flash loan sizes
  5. Filter by gas convexity
  6. Score by time decay
  7. Return top opportunities

### 5. Execution Engine (`src/execution/`)

#### Arbitrage Executor (`executor.ts`)
- **Purpose**: Executes arbitrage opportunities with MEV protection
- **Features**:
  - Private RPC integration (Flashbots)
  - Gas optimization
  - Transaction building
  - Profit validation
- **Key Methods**: `executeOpportunity()`, `buildTransaction()`

### 6. Block Replay & Backtesting (`src/replay/`)

#### Backtest Engine (`backtest.ts`)
- **Purpose**: Tests strategies on historical blocks
- **Workflow**:
  1. Choose block range [b_0, b_n]
  2. For each block:
     - Fetch pool states at block height
     - Build rate graph
     - Run opportunity finder
     - Simulate execution with historical gas
  3. Compare detected vs executable vs realized profit
- **Output**: CSV with performance metrics

### 7. Smart Contract (`contracts/`)

#### FlashLoanArbitrage.sol
- **Purpose**: On-chain arbitrage execution with Aave V3 flash loans
- **Inherits**: `FlashLoanSimpleReceiverBase`
- **Features**:
  - Atomic execution
  - Profit validation (reverts if not profitable)
  - Gas price limits
  - Emergency controls
  - MEV protection
- **Key Function**: `executeArbitrage(address asset, uint256 amount, bytes calldata swapData)`

## Data Flow

```
1. Block Event
   ↓
2. State Snapshot
   ↓
3. Opportunity Finder
   ├─→ Multi-Hop Strategy
   ├─→ Fee-Tier Strategy
   ├─→ Fragmentation Strategy
   └─→ Stable-Volatile Strategy
   ↓
4. Flash Loan Optimizer
   ↓
5. Gas Convexity Filter
   ↓
6. Time Decay Scorer
   ↓
7. Opportunity Validator
   ↓
8. Transaction Builder
   ↓
9. Execution (via Aave Flash Loan)
   ↓
10. Profit Tracking
```

## MEV Protection Strategy

### 1. Private RPC
- Uses Flashbots-style private mempool
- Prevents transaction frontrunning

### 2. Path Entropy
- Calculates uniqueness of arbitrage path
- Higher entropy = harder to copy
- Formula: H = -Σ p_i log(p_i)

### 3. Single Transaction
- Atomic execution with flash loan
- No separate approvals
- Reverts if not profitable

### 4. On-Chain Safety Check
```solidity
require(
  IERC20(asset).balanceOf(address(this)) > amount + premium,
  "NOT_PROFITABLE"
);
```

### 5. Gas Optimization
- Convex gas cost modeling
- Maximum gas price limits
- Gas efficiency filtering

## Mathematical Proofs

### 1. Multi-Hop Cyclic Arbitrage
**Proposition**: Given a directed graph of exchange rates, a negative log-weight cycle implies strictly profitable arbitrage.

**Proof**:
- Let each swap have effective rate: R_i = amountOut_i / amountIn_i
- Transform to log space: w_i = -ln(R_i)
- Cycle product: ∏ R_i > 1 ⇔ Σ ln(R_i) > 0 ⇔ Σ -ln(R_i) < 0
- Thus: Negative cycle ⇔ guaranteed profit before costs

### 2. Fee-Tier Mispricing
**Observation**: For same token pair, two pools with different fee tiers cannot both be optimal.

**Proof**:
- Rate formula: R = (√P_out / √P_in)² * (1 - f)
- If R_p1 > R_p2: Rational flow moves through p1
- Liquidity rebalancing lags block time
- Transient arbitrage exists until dP/dt_p1 = dP/dt_p2

### 3. Liquidity Fragmentation
**Key Invariant**: Constant-product AMMs satisfy x·y = k ⇒ dy/dx = -y/x

**Result**:
- Two pools with same price but different reserves
- ∣dy/dx∣_1 ≠ ∣dy/dx∣_2
- Buy in low-slope pool, sell in high-slope pool
- Profit exists even at equal spot price

### 4. Stable-Volatile Arbitrage
**Stable AMM**: x³y + y³x = k ⇒ d²y/dx² ≈ 0 near peg

**Volatile AMMs**: d²y/dx² ≠ 0

**Result**:
- Stable pools resist price movement
- Volatile pools overshoot
- Creates directional arbitrage under low volatility

## Configuration

### Environment Variables (.env)
- `BASE_RPC_URL`: Base network RPC endpoint
- `PRIVATE_KEY`: Wallet private key for signing transactions
- `AAVE_V3_POOL`: Aave V3 pool address on Base
- `FLASH_LOAN_RECEIVER`: Deployed contract address
- `MIN_PROFIT_THRESHOLD`: Minimum profit in USD
- `MAX_GAS_PRICE`: Maximum gas price in wei
- `USE_FLASHBOTS`: Enable private RPC (true/false)

### Constants (src/config/constants.ts)
- Token addresses (WETH, USDC, DAI, WBTC, etc.)
- DEX addresses (Uniswap V2/V3, Curve)
- Fee tiers (100, 500, 2500, 3000, 10000)
- Gas limits and prices
- Arbitrage parameters (max hops, min liquidity)

## Deployment

### 1. Smart Contract Deployment
```bash
npm run deploy
```

### 2. Contract Verification
```bash
npm run verify
```

### 3. Fund Contract
Send ETH for gas to contract address

### 4. Run Bot
```bash
npm run continuous  # Continuous mode
npm run scan        # Single scan
npm run backtest <start> <end>  # Backtest
```

## Performance Metrics

### Tracked Metrics
- Total opportunities found
- Successful arbitrages
- Net profit (after gas and fees)
- Gas costs
- Success rate
- Average profit per arbitrage
- Profit per block

### Backtest Output
- CSV file with block-by-block results
- Summary statistics
- Profit distribution
- Success rate analysis

## Safety Features

### On-Chain Safety
- Profit validation before execution
- Revert on insufficient profit
- Gas price limits
- Emergency pause

### Off-Chain Safety
- Opportunity validation
- Gas convexity filtering
- MEV bait detection
- Time decay scoring
- Slippage tolerance

### Risk Mitigation
- Maximum gas price limits
- Minimum profit thresholds
- Flash loan size optimization
- Path uniqueness scoring
- Historical backtesting

## Monitoring & Logging

### Console Logging
- Block processing events
- Opportunity detection
- Execution results
- Error messages

### Performance Tracking
- Real-time profit tracking
- Gas usage monitoring
- Success rate calculation
- Opportunity statistics

## Future Enhancements

### Potential Improvements
- Additional DEX integrations (Balancer, 1inch)
- Multi-chain support
- Advanced MEV protection (Flashbots bundles)
- Machine learning for opportunity prediction
- Real-time dashboard
- Alert system (Telegram, Discord)
- Advanced backtesting with slippage modeling
- Position sizing optimization

### Scalability
- Parallel opportunity detection
- Caching layer for pool states
- Optimized gas estimation
- Batch execution support < 0 ⇔ Π(rate) > 1

#### Flash Loan Optimization
- **Purpose**: Finds optimal loan size for maximum profit
- **Algorithm**: Binary search on profit function
- **Profit Function**: π(x) = x * Π(rate(x)) - x - costs(x)
- **Optimality**: dπ/dx = 0 and d²π/dx² < 0

### 2. DEX Integration Layer (`src/dex/`)

#### Uniswap V3 (`uniswapV3.ts`)
- Uses `sqrtPriceX96` and `liquidity` for accurate pricing
- Supports multiple fee tiers (100, 500, 2500, 3000, 10000)
- Implements tick-based price calculations
- Pool address derivation from factory

#### Uniswap V2 (`uniswapV2.ts`)
- Uses `getReserves()` for pool state
- Implements constant product formula
- Router integration for swap quotes

#### Curve (`curve.ts`)
- Supports stable swap AMM
- Lower slippage for stablecoins
- Amplification coefficient (A) calculations

#### State Snapshot (`stateSnapshot.ts`)
- Captures pool states at specific block heights
- Supports historical block replay
- Fetches states from multiple DEXs simultaneously

### 3. Arbitrage Strategies (`src/strategies/`)

#### Base Strategy (`baseStrategy.ts`)
- Abstract base class for all strategies
- Common validation logic
- Flash loan fee calculation
- Opportunity ID generation

#### Multi-Hop Cyclic Arbitrage (`multiHopArbitrage.ts`)
- Detects profitable cycles in exchange graph
- Supports up to 4 hops
- Path entropy calculation for MEV protection
- Negative log-weight cycle detection

#### Fee-Tier Mispricing (`feeTierArbitrage.ts`)
- Exploits different fee tiers in Uniswap V3
- Rate formula: R = (√P_out / √P_in)² * (1 - f)
- Captures transient arbitrage opportunities

#### Liquidity Fragmentation (`liquidityFragmentation.ts`)
- Calculates marginal rates, not just prices
- Key invariant: dy/dx = -y/x
- Buys in low-slope pools, sells in high-slope pools
- Cross-DEX arbitrage

#### Stable-Volatile Arbitrage (`stableVolatileArbitrage.ts`)
- Exploits second derivative differences
- Stable pools: d²y/dx² ≈ 0
- Volatile pools: d²y/dx² ≠ 0
- Multi-hop: Stable → Stable → Volatile → Stable

#### Flash Loan Optimizer (`flashLoanOptimizer.ts`)
- Binary search for optimal loan size
- Accounts for slippage convexity
- Validates against pool liquidity
- Profit curve analysis

#### Gas Convexity Filter (`gasConvexityFilter.ts`)
- Models gas as stepwise, not linear
- Rejects high-convexity opportunities
- Filters MEV bait
- Gas price recommendations

#### Time Decay Scoring (`timeDecayScoring.ts`)
- Score = profit * e^(-λ * latency)
- Filters stale opportunities
- Priority-based execution
- Freshness calculation

### 4. Opportunity Finding (`src/opportunity/`)

#### Opportunity Finder (`opportunityFinder.ts`)
- Orchestrates all strategies
- Combines opportunities from multiple sources
- Removes duplicates
- Scores and ranks opportunities
- Validates before execution

### 5. Execution Engine (`src/execution/`)

#### Arbitrage Executor (`executor.ts`)
- Builds transaction calldata
- Encodes swap paths
- Gas optimization
- MEV-aware execution
- Private RPC support

### 6. Backtesting (`src/replay/`)

#### Backtest Engine (`backtest.ts`)
- Historical block replay
- State fetching at exact block heights
- Profit simulation
- Performance metrics
- CSV export

### 7. Smart Contracts (`contracts/`)

#### FlashLoanArbitrage.sol
- Implements Aave V3 FlashLoanSimpleReceiverBase
- Executes atomic arbitrage transactions
- On-chain profit validation
- MEV protection (reverts on insufficient profit)
- Emergency controls

## Data Flow

```
1. Block Arrives
   ↓
2. State Snapshot
   - Fetch pool states at block height
   - Build exchange graph
   ↓
3. Strategy Execution
   - Multi-hop cycle detection
   - Fee-tier analysis
   - Liquidity fragmentation
   - Stable-volatile arbitrage
   ↓
4. Opportunity Aggregation
   - Combine results
   - Remove duplicates
   ↓
5. Optimization & Filtering
   - Flash loan size optimization
   - Gas convexity filtering
   - MEV bait removal
   - Time decay scoring
   ↓
6. Execution Decision
   - Validate opportunity
   - Build transaction
   - Execute via flash loan
   ↓
7. Profit Realization
   - Atomic execution
   - On-chain validation
   - Profit tracking
```

## Key Innovations

### 1. Effective Rate vs Price
Traditional scanners use price ratios. This bot uses effective rates that account for:
- AMM curve shape
- Trade size impact
- Liquidity depth
- Fee structure

### 2. Log-Space Transformation
Converts multiplicative arbitrage detection to additive:
- Negative cycle = profitable arbitrage
- Gas costs = additive penalties
- Enables Bellman-Ford algorithm

### 3. Marginal Rate Analysis
Calculates derivative of amountOut with respect to amountIn:
- Reveals liquidity fragmentation
- Identifies slope differences
- Finds opportunities at equal spot prices

### 4. MEV-Aware Scoring
Multi-factor scoring:
```
score = (profit / gas) * e^(-λ * latency) * (1 + entropy)
```
- Profit per gas efficiency
- Time decay (older = lower score)
- Path entropy (unique = safer)

### 5. Flash Loan Optimization
Binary search for optimal loan size:
- Avoids fixed-size suboptimality
- Accounts for slippage convexity
- Maximizes profit per trade

### 6. Gas Convexity Modeling
Gas is stepwise, not linear:
- Second derivative analysis
- Rejects high-convexity trades
- Prevents gas price volatility losses

## Safety Mechanisms

### On-Chain
- Profit validation in contract
- Reverts on insufficient profit
- Emergency withdraw functions
- Owner controls

### Off-Chain
- Gas convexity filtering
- Time decay scoring
- MEV bait detection
- Historical validation
- Slippage tolerance

### Execution
- Single transaction atomicity
- No intermediate approvals
- Private RPC support
- Gas price limits

## Performance Optimization

### Parallel Processing
- Concurrent pool state fetching
- Parallel strategy execution
- Batch opportunity optimization

### Caching
- Pool state caching
- Graph structure reuse
- Gas price caching

### Gas Optimization
- Efficient contract code
- Optimized calldata encoding
- Gas limit estimation

## Monitoring & Observability

### Metrics Tracked
- Opportunities found
- Success rate
- Net profit
- Gas costs
- Execution time
- Block latency

### Logging Levels
- INFO: Normal operation
- WARN: Potential issues
- ERROR: Failed executions
- DEBUG: Detailed debugging

## Security Considerations

### Private Key Security
- Stored in `.env` (not committed)
- Never logged or printed
- Encrypted wallet support

### Smart Contract Security
- OpenZeppelin contracts
- Reentrancy protection
- Access control
- Verified on Block Explorer

### MEV Protection
- Private mempool support
- Path entropy scoring
- Single transaction execution
- Gas price optimization

## Deployment Architecture

### Production Environment
- Base mainnet
- Private RPC (Alchemy/Infura)
- Flashbots for MEV protection
- Monitoring dashboard

### Development Environment
- Base Goerli testnet
- Public RPC
- Local testing
- Debug logging

## Scalability

### Horizontal Scaling
- Multiple bot instances
- Different base tokens
- Separate strategy pools
- Load balancing

### Vertical Scaling
- Optimized algorithms
- Efficient data structures
- Caching strategies
- Gas optimization

## Future Enhancements

1. **Additional DEXs**
   - PancakeSwap V3
   - 1inch integration
   - Balancer V2

2. **Advanced Strategies**
   - Triangular arbitrage
   - Cross-chain arbitrage
   - Liquidation arbitrage

3. **Machine Learning**
   - Price prediction
   - Opportunity scoring
   - Risk assessment

4. **Monitoring**
   - Real-time dashboard
   - Alert systems
   - Performance analytics

## Conclusion

This architecture provides a robust, production-ready arbitrage system that:
- Uses mathematical rigor for opportunity detection
- Implements comprehensive MEV protection
- Provides accurate backtesting capabilities
- Ensures safety and security
- Scales for production use

The system is designed to be maintainable, extensible, and performant, with clear separation of concerns and well-documented components.