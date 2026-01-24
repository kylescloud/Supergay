# Base Chain DEX Integration - Architecture & Implementation Plan

## Overview

This document outlines the architecture and implementation plan for integrating multiple DEXs on Base chain into the flash loan arbitrage bot. Base is an Ethereum Layer 2 (L2) network with significantly lower gas costs, making it ideal for arbitrage operations.

## Base Chain Characteristics

### Network Details
- **Network**: Base (Coinbase's L2)
- **RPC URL**: https://mainnet.base.org
- **Chain ID**: 8453
- **Native Token**: ETH
- **Block Time**: ~2 seconds
- **Average Gas Cost**: ~0.001-0.01 gwei (significantly lower than Ethereum)

### Advantages for Arbitrage
1. **Low Gas Costs**: Enables profitable arbitrage on smaller price differences
2. **Fast Confirmations**: ~2s block time allows rapid execution
3. **High Throughput**: Can handle many transactions per block
4. **EVM Compatible**: Same tooling as Ethereum mainnet

## Supported DEXs on Base

### 1. Uniswap V3
**Type**: Concentrated Liquidity AMM

**Key Contracts**:
- Router: `0xE592427A0AEce92De3Edee1F18E0157C05861564`
- Factory: `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`
- Quoter V2: `0x61fFE014bA17989E743c5F643B21F4792A3cc2e1`
- NonfungiblePositionManager: `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`
- SwapRouter02: `0x2626664c2603336E57B271c5C0b26F421741e481`

**Integration Approach**:
- Use Quoter V2 for accurate price quotes
- Direct pool interaction for swaps (v3.core)
- Handle multiple fee tiers (0.01%, 0.05%, 0.3%, 1%)
- Fetch pool data via factory and multicall

**ABI Functions Needed**:
```solidity
// Quoter V2
function quoteExactInputSingle(QuoteExactInputSingleParams calldata params) external returns (uint256 amountOut);

// Router
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint160 amountOutMinimum;
}
function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

// Pool
function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
function liquidity() external view returns (uint128);
```

### 2. PancakeSwap V3
**Type**: Concentrated Liquidity AMM (Uniswap V3 fork)

**Key Contracts**:
- Router: `0x1b81D678ffb9C0263b24A97847620C99d213eB14`
- Factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
- Quoter V2: `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`

**Integration Approach**:
- Nearly identical to Uniswap V3
- Same interface and ABI
- Can use shared V3 integration code

### 3. Aerodrome
**Type**: MetaDEX (Combines Uniswap V3 + Curve + Convex)

**Key Contracts**:
- Router: `0xcF77a3Ba9A5CA399B7C97c4f56bB1f4d5511CF08`
- Factory: `0x420DD381b31aEf6683db6B902084c0F5F77229b3`
- Quoter: `0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0`

**Integration Approach**:
- Two pool types: Classic (V2-style) and Slipstream (V3-style)
- Use appropriate router based on pool type
- Slipstream pools use Uniswap V3 interface
- Classic pools use V2 interface

**ABI Functions Needed**:
```solidity
// SlipStream Quoter (V3-style)
function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut);

// Classic Router (V2-style)
function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts);
function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts);
```

### 4. SushiSwap
**Type**: Constant Product AMM (V2-style)

**Key Contracts**:
- Router: `0xd015D512849cFd9Ef1c681A407E837dEfcaF85F8`
- Factory: `0xc35DADB65012eC5796536bD9864eD8773aBc74C4`

**Integration Approach**:
- Standard V2 AMM implementation
- Simple constant product formula
- Fetch reserves from factory or directly from pair contracts

**ABI Functions Needed**:
```solidity
// Router
function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts);
function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts);

// Pair
function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
```

### 5. Balancer V2
**Type**: Weighted Pool AMM

**Key Contracts**:
- Vault: `0xBA12222222228d8Ba445958a75a0704d566BF2C8`
- WeightedPoolFactory: `0x8E9aa87E45e28badbc5On1E2e0b8170ea7C8670E6`

**Integration Approach**:
- All pools managed through Vault
- Supports weighted, stable, and meta-stable pools
- Batch swaps for efficient multi-hop arbitrage

**ABI Functions Needed**:
```solidity
// Vault
struct SingleSwap {
    bytes32 poolId;
    SwapKind kind;
    address assetIn;
    address assetOut;
    uint256 amount;
    bytes userData;
}
struct FundManagement {
    address sender;
    bool fromInternalBalance;
    address recipient;
    bool toInternalBalance;
}
function swap(SingleSwap memory singleSwap, FundManagement memory funds, uint256 limit, uint256 deadline) external payable returns (uint256);

// Pool
enum SwapKind { GIVEN_IN, GIVEN_OUT }
function getPoolId() external view returns (bytes32);
```

### 6. Curve Finance
**Type**: Stableswap AMM

**Key Contracts**:
- Router: `0x4f37A9d177470499A2dD084621020b023fcffc1F`
- AddressProvider: `0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98`
- MetaRegistry: (Fetch from AddressProvider ID=7)
- Stableswap Factory: `0xd2002373543Ce3527023C75e7518C274A51ce712`
- Twocrypto Factory: `0xc9Fe0C63Af9A39402e8a5514f9c43Af0322b665F`
- Tricrypto Factory: `0xA5961898870943c68037F6848d2D866Ed2016bcB`

**Integration Approach**:
- Three pool types: Stableswap, Twocrypto, Tricrypto
- Use MetaRegistry for pool discovery
- Router supports multi-hop swaps
- Best for stablecoin arbitrage

**ABI Functions Needed**:
```solidity
// Router
function exchange(address _pool, int128 _i, int128 _j, uint256 _dx, uint256 _min_dy) external returns (uint256);
function exchange_underlying(address _pool, int128 _i, int128 _j, uint256 _dx, uint256 _min_dy) external returns (uint256);
function get_dy(address _pool, int128 _i, int128 _j, uint256 _dx) external view returns (uint256);

// MetaRegistry
function find_pool_for_coins(address from, address to) external view returns (address);
function get_coin_indices(address pool, address from, address to) external view returns (uint256, uint256);
function pools(uint256) external view returns (address);

// Pool
function coins(uint256 i) external view returns (address);
function balances(uint256 i) external view returns (uint256);
```

## Arbitrage Bot Architecture

### High-Level Flow

```
1. Monitor Prices
   ├─ Fetch prices from all DEXs
   ├─ Calculate effective rates
   └─ Update local price cache

2. Identify Opportunities
   ├─ Compare prices across DEXs
   ├─ Calculate potential profit
   ├─ Account for flash loan fee (0.05%)
   ├─ Account for gas costs
   ├─ Account for slippage
   └─ Filter profitable opportunities

3. Simulate Execution
   ├─ Construct swap path
   ├─ Calculate expected output
   ├─ Estimate gas cost
   ├─ Verify profitability after fees
   └─ Optimize route if needed

4. Execute Arbitrage
   ├─ Borrow flash loan from Aave
   ├─ Execute swaps across DEXs
   ├─ Repay flash loan + fee
   ├─ Keep profit
   └─ Handle failures gracefully
```

### Smart Contract Structure

```solidity
// FlashLoanReceiver.sol - Main arbitrage contract
contract FlashLoanReceiver is IFlashLoanReceiver, Ownable {
    // Flash loan provider
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    
    // DEX integrations
    IUniswapV3Router public uniswapRouter;
    IPancakeV3Router public pancakeRouter;
    IAerodromeRouter public aerodromeRouter;
    ISushiRouter public sushiRouter;
    IBalancerVault public balancerVault;
    ICurveRouter public curveRouter;
    
    // Configuration
    uint256 public minProfitThreshold; // Minimum profit in wei
    uint256 public maxProfitThreshold; // Maximum profit in wei
    uint256 public constant FLASH_LOAN_FEE = 5; // 0.05%
    
    // Events
    event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit);
    event ArbitrageFailed(address indexed token, uint256 amount, string reason);
    
    constructor(
        address _addressesProvider,
        address _uniswapRouter,
        address _pancakeRouter,
        address _aerodromeRouter,
        address _sushiRouter,
        address _balancerVault,
        address _curveRouter
    ) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressesProvider);
        uniswapRouter = IUniswapV3Router(_uniswapRouter);
        // ... initialize other routers
    }
    
    // Flash loan callback
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(initiator == address(this), "Invalid initiator");
        require(msg.sender == address(POOL), "Unauthorized");
        
        // Decode params
        ArbitrageParams memory arbParams = abi.decode(params, (ArbitrageParams));
        
        // Execute arbitrage
        uint256 finalAmount = executeArbitrage(arbParams);
        
        // Verify profit
        uint256 profit = finalAmount - amounts[0] - premiums[0];
        require(profit >= minProfitThreshold && profit <= maxProfitThreshold, "Insufficient profit");
        
        // Approve flash loan repayment
        IERC20(assets[0]).approve(address(POOL), amounts[0] + premiums[0]);
        
        return true;
    }
    
    // Main arbitrage execution
    function executeArbitrage(ArbitrageParams memory params) internal returns (uint256) {
        uint256 amountIn = params.amount;
        
        // Execute first swap
        uint256 amountOut = executeSwap(
            params.dex1,
            params.tokenIn,
            params.tokenOut,
            amountIn,
            params.dex1Params
        );
        
        // Execute second swap (reverse)
        uint256 finalAmount = executeSwap(
            params.dex2,
            params.tokenOut,
            params.tokenIn,
            amountOut,
            params.dex2Params
        );
        
        return finalAmount;
    }
    
    // Execute swap on specific DEX
    function executeSwap(
        DEXType dex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata params
    ) internal returns (uint256) {
        if (dex == DEXType.UniswapV3) {
            return executeUniswapV3Swap(tokenIn, tokenOut, amountIn, params);
        } else if (dex == DEXType.PancakeSwapV3) {
            return executePancakeV3Swap(tokenIn, tokenOut, amountIn, params);
        }
        // ... handle other DEXs
    }
    
    // Start arbitrage from off-chain
    function startArbitrage(ArbitrageParams calldata params) external onlyOwner {
        IPool pool = IPool(ADDRESSES_PROVIDER.getPool());
        address[] memory assets = new address[](1);
        assets[0] = params.tokenIn;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.amount;
        
        pool.flashLoan(
            address(this),
            assets,
            amounts,
            new uint256[](1), // interest rate modes
            address(0), // on behalf of
            abi.encode(params), // params
            0 // referral code
        );
    }
}

struct ArbitrageParams {
    address tokenIn;
    address tokenOut;
    uint256 amount;
    DEXType dex1;
    DEXType dex2;
    bytes dex1Params;
    bytes dex2Params;
}

enum DEXType {
    UniswapV3,
    PancakeSwapV3,
    AerodromeClassic,
    AerodromeSlipstream,
    SushiSwap,
    Balancer,
    CurveStableswap,
    CurveTwocrypto,
    CurveTricrypto
}
```

### Off-Chain Scanner Architecture

```typescript
// scanner.ts - Price monitoring and opportunity detection
interface DexConfig {
  name: string;
  type: string;
  router: string;
  quoter?: string;
  factory?: string;
}

class ArbitrageScanner {
  private configs: Map<string, DexConfig> = new Map();
  private prices: Map<string, Map<string, bigint>> = new Map();
  
  constructor(configs: DexConfig[]) {
    configs.forEach(config => {
      this.configs.set(config.name, config);
      this.prices.set(config.name, new Map());
    });
  }
  
  // Fetch prices from all DEXs
  async fetchAllPrices(tokenIn: string, tokenOut: string): Promise<void> {
    const promises = Array.from(this.configs.values()).map(config =>
      this.fetchPrice(config, tokenIn, tokenOut)
    );
    await Promise.all(promises);
  }
  
  // Fetch price from specific DEX
  async fetchPrice(config: DexConfig, tokenIn: string, tokenOut: string): Promise<void> {
    try {
      let price: bigint;
      
      switch(config.type) {
        case 'UniswapV3':
        case 'PancakeSwapV3':
        case 'AerodromeSlipstream':
          price = await this.fetchV3Price(config, tokenIn, tokenOut);
          break;
        case 'SushiSwap':
        case 'AerodromeClassic':
          price = await this.fetchV2Price(config, tokenIn, tokenOut);
          break;
        case 'Balancer':
          price = await this.fetchBalancerPrice(config, tokenIn, tokenOut);
          break;
        case 'Curve':
          price = await this.fetchCurvePrice(config, tokenIn, tokenOut);
          break;
      }
      
      this.prices.get(config.name)!.set(`${tokenIn}-${tokenOut}`, price);
    } catch (error) {
      console.error(`Failed to fetch price from ${config.name}:`, error);
    }
  }
  
  // Find arbitrage opportunities
  findOpportunities(tokenIn: string, tokenOut: string, flashLoanAmount: bigint): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const dexNames = Array.from(this.configs.keys());
    
    for (let i = 0; i < dexNames.length; i++) {
      for (let j = i + 1; j < dexNames.length; j++) {
        const dex1 = dexNames[i];
        const dex2 = dexNames[j];
        
        const price1 = this.prices.get(dex1)?.get(`${tokenIn}-${tokenOut}`);
        const price2 = this.prices.get(dex2)?.get(`${tokenIn}-${tokenOut}`);
        
        if (!price1 || !price2) continue;
        
        // Calculate potential profit
        const amountOut1 = (flashLoanAmount * price1) / BigInt(10 ** 18);
        const amountOut2 = (amountOut1 * price2) / BigInt(10 ** 18);
        const profit = amountOut2 - flashLoanAmount;
        
        // Account for flash loan fee (0.05%)
        const flashLoanFee = (flashLoanAmount * BigInt(5)) / BigInt(10000);
        const netProfit = profit - flashLoanFee;
        
        if (netProfit > 0n) {
          opportunities.push({
            dex1,
            dex2,
            tokenIn,
            tokenOut,
            amountIn: flashLoanAmount,
            expectedProfit: netProfit,
            profitPercentage: (Number(netProfit) * 100) / Number(flashLoanAmount)
          });
        }
      }
    }
    
    return opportunities.sort((a, b) => Number(b.expectedProfit) - Number(a.expectedProfit));
  }
  
  // V3 price fetching
  private async fetchV3Price(config: DexConfig, tokenIn: string, tokenOut: string): Promise<bigint> {
    // Try multiple fee tiers
    const feeTiers = [100, 500, 3000, 10000];
    
    for (const fee of feeTiers) {
      try {
        const quote = await this.quoteV3(config, tokenIn, tokenOut, BigInt(10 ** 18), fee);
        return quote;
      } catch (error) {
        // Pool doesn't exist, try next fee tier
      }
    }
    
    throw new Error(`No V3 pool found for ${tokenIn}/${tokenOut}`);
  }
  
  private async quoteV3(config: DexConfig, tokenIn: string, tokenOut: string, amountIn: bigint, fee: number): Promise<bigint> {
    const quoterContract = new Contract(config.quoter!, QUOTER_V3_ABI, this.provider);
    const amountOut = await quoterContract.quoteExactInputSingle(
      tokenIn,
      tokenOut,
      fee,
      amountIn,
      0
    );
    return BigInt(amountOut.toString());
  }
  
  // V2 price fetching
  private async fetchV2Price(config: DexConfig, tokenIn: string, tokenOut: string): Promise<bigint> {
    const routerContract = new Contract(config.router, ROUTER_V2_ABI, this.provider);
    const amounts = await routerContract.getAmountsOut(BigInt(10 ** 18), [tokenIn, tokenOut]);
    return BigInt(amounts[1].toString());
  }
  
  // Balancer price fetching
  private async fetchBalancerPrice(config: DexConfig, tokenIn: string, tokenOut: string): Promise<bigint> {
    // Query vault for pool
    // Use multicall to fetch pool data
    // Calculate expected output
    return 0n;
  }
  
  // Curve price fetching
  private async fetchCurvePrice(config: DexConfig, tokenIn: string, tokenOut: string): Promise<bigint> {
    // Query router for best pool
    // Get exchange rate
    // Calculate expected output
    return 0n;
  }
}

interface ArbitrageOpportunity {
  dex1: string;
  dex2: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  expectedProfit: bigint;
  profitPercentage: number;
}
```

## Implementation Roadmap

### Phase 1: Infrastructure Setup (Week 1)
- [ ] Set up development environment
- [ ] Configure Base chain RPC endpoints
- [ ] Deploy mock contracts for testing
- [ ] Set up test accounts with test ETH
- [ ] Implement basic logging and monitoring

### Phase 2: DEX Integrations (Week 2-3)
- [ ] Implement Uniswap V3 integration
- [ ] Implement PancakeSwap V3 integration
- [ ] Implement Aerodrome integration (both Classic and Slipstream)
- [ ] Implement SushiSwap integration
- [ ] Implement Balancer integration
- [ ] Implement Curve integration
- [ ] Write integration tests for each DEX

### Phase 3: Scanner Development (Week 4)
- [ ] Build price fetcher for all DEXs
- [ ] Implement opportunity detection logic
- [ ] Add profit calculation with fees
- [ ] Implement rate limiting and caching
- [ ] Build monitoring dashboard

### Phase 4: Smart Contract Development (Week 5-6)
- [ ] Deploy Aave V3 flash loan receiver
- [ ] Implement arbitrage execution logic
- [ ] Add security checks and validations
- [ ] Write comprehensive tests
- [ ] Deploy to Base testnet

### Phase 5: Integration & Testing (Week 7)
- [ ] Connect scanner to smart contract
- [ ] Test end-to-end on testnet
- [ ] Optimize gas costs
- [ ] Stress test with various scenarios
- [ ] Implement fail-safes and error handling

### Phase 6: Production Deployment (Week 8)
- [ ] Final security audit
- [ ] Deploy to Base mainnet
- [ ] Start with small flash loan amounts
- [ ] Monitor and adjust parameters
- [ ] Scale up gradually

## Risk Management

### Smart Contract Risks
- **Reentrancy**: Use OpenZeppelin's ReentrancyGuard
- **Flash Loan Attack Detection**: Implement checks for circular flash loans
- **Oracle Manipulation**: Use multiple price sources and TWAP
- **Slippage Protection**: Implement minimum output amounts

### Operational Risks
- **MEV Competition**: Use Flashbots or similar protection
- **Failed Transactions**: Implement retry logic with increasing gas
- **High Gas Prices**: Monitor gas and pause if too high
- **Liquidity Issues**: Check pool depths before executing

### Financial Risks
- **Impermanent Loss**: Not applicable (no liquidity provision)
- **Flash Loan Fee**: 0.05% on BNB Chain Aave
- **Slippage**: Variable based on pool depth
- **Failed Arbitrage**: Loss of gas fees only

## Performance Optimization

### Gas Optimization
- Use assembly for critical calculations
- Minimize storage operations
- Batch operations with multicall
- Optimize swap paths

### Execution Speed
- Use dedicated RPC endpoints
- Implement parallel price fetching
- Cache frequently accessed data
- Use efficient data structures

### Profit Maximization
- Optimize flash loan amount based on pool depth
- Choose most profitable route automatically
- Consider multi-hop arbitrage
- Batch multiple opportunities if possible

## Monitoring & Analytics

### Key Metrics to Track
- Number of opportunities found
- Success rate of arbitrage attempts
- Average profit per successful arbitrage
- Total gas costs
- ROI (Return on Investment)
- Competition level (other bots in mempool)

### Alerts to Configure
- New high-profit opportunity alert
- Failed transaction alert
- Low balance alert
- Gas price spike alert
- Unusual behavior detection

## Conclusion

This architecture provides a robust foundation for a flash loan arbitrage bot on Base chain. The modular design allows for easy addition of new DEXs and optimization of existing integrations. With careful implementation and testing, this system can be profitable while maintaining security and reliability.

Key success factors:
1. Fast and accurate price discovery
2. Efficient execution to beat competition
3. Robust error handling and monitoring
4. Continuous optimization and adaptation to market conditions
5. Proper risk management and security measures