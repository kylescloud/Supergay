import { ethers } from 'ethers';
import { Pool } from '../pools/types.js';
import { PoolRegistryManager } from '../pools/registry.js';

// Aave V3 Flash Loan supported assets on Base
export const AAVE_V3_ASSETS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  DAI: '0x50C5725949A6F0c72E6C4a641F24049A917DB0Cb',
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  LINK: '0x8836d1EA270fC2E369AdAC27B0aA3d607aF890877'
} as const;

export const FLASH_LOAN_FEE = 0.0009; // 0.09%

export interface TokenNode {
  address: string;
  symbol: string;
  decimals: number;
  price: bigint; // In USD (scaled by 1e8)
}

export interface PoolEdge {
  fromToken: string;
  toToken: string;
  pool: Pool;
  exchangeRate: bigint; // Scaled by 1e18
  inverseRate: bigint; // Scaled by 1e18
  liquidity: bigint; // In USD
  fee: number;
  dex: string;
}

export interface ArbitragePath {
  id: string;
  steps: PathStep[];
  totalHops: number;
  estimatedProfit: bigint; // In USD (scaled by 1e8)
  gasCost: bigint; // In USD (scaled by 1e8)
  netProfit: bigint; // In USD (scaled by 1e8)
  roi: number; // Percentage
  flashLoanAmount: bigint;
  flashLoanToken: string;
  confidence: number; // 0-1
}

export interface PathStep {
  fromToken: string;
  toToken: string;
  pool: Pool;
  amountIn: bigint;
  expectedAmountOut: bigint;
  dex: string;
  fee: number;
}

export class ArbitrageGraph {
  private nodes: Map<string, TokenNode> = new Map();
  private edges: Map<string, PoolEdge[]> = new Map();
  private reverseEdges: Map<string, PoolEdge[]> = new Map();
  private poolRegistry: PoolRegistryManager;

  constructor(poolRegistry: PoolRegistryManager) {
    this.poolRegistry = poolRegistry;
  }

  /**
   * Build arbitrage graph from pool registry
   */
  async buildGraph(minLiquidity: bigint = BigInt(10000 * 1e18), maxFee: number = 0.01): Promise<void> {
    console.log('🏗️  Building arbitrage graph...');
    
    const pools = this.poolRegistry.getAllPools();
    const poolsWithState = pools.filter(p => 
      (p.reserve0 && p.reserve1) || (p.liquidity && p.sqrtPriceX96)
    );

    console.log(`📊 Processing ${poolsWithState.length} pools with state data...`);
    console.log(`   Minimum liquidity threshold: $${Number(minLiquidity).toLocaleString()}`);
    console.log(`   Maximum fee: ${(maxFee / 100).toFixed(2)}%`);

    let skippedLiquidity = 0;
    let skippedFee = 0;
    let skippedError = 0;
    let addedPools = 0;

    for (const pool of poolsWithState) {
      try {
        // Calculate liquidity in USD
        const liquidityUSD = this.calculatePoolLiquidityUSD(pool);
        
        // Skip low liquidity pools
        if (liquidityUSD < minLiquidity) {
          skippedLiquidity++;
          continue;
        }

        // Skip high fee pools
        if (pool.fee && pool.fee > maxFee) {
          skippedFee++;
          continue;
        }

        // Add tokens as nodes
        this.addNode(pool.token0);
        this.addNode(pool.token1);

        // Add pool edges (both directions)
        const edge = this.createPoolEdge(pool, liquidityUSD);
        this.addEdge(edge);
        this.addReverseEdge(edge);
        addedPools++;

      } catch (error) {
        // Skip invalid pools
        skippedError++;
        continue;
      }
    }

    console.log(`✅ Graph built with ${this.nodes.size} tokens and ${this.countEdges()} edges`);
    console.log(`   Added: ${addedPools} pools`);
    console.log(`   Skipped (low liquidity): ${skippedLiquidity} pools`);
    console.log(`   Skipped (high fee): ${skippedFee} pools`);
    console.log(`   Skipped (error): ${skippedError} pools`);
    
    // Show first few tokens for debugging
    const tokens = Array.from(this.nodes.keys()).slice(0, 10);
    console.log(`   First 10 tokens: ${tokens.join(', ')}`);
  }

  /**
   * Add token node to graph
   */
  private addNode(token: any): void {
    if (!this.nodes.has(token.address)) {
      this.nodes.set(token.address, {
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        price: BigInt(0) // Will be updated with price oracle
      });
    }
  }

  /**
   * Create pool edge with exchange rates
   */
  private createPoolEdge(pool: Pool, liquidityUSD: bigint): PoolEdge {
    let exchangeRate: bigint;
    let inverseRate: bigint;
    let fee: number;

    if (pool.reserve0 && pool.reserve1) {
      // Convert reserves to BigInt
      const reserve0 = BigInt(pool.reserve0);
      const reserve1 = BigInt(pool.reserve1);
      
      // V2 pool: exchange rate = reserve1/reserve0
      exchangeRate = (reserve1 * BigInt(1e18)) / reserve0;
      inverseRate = (reserve0 * BigInt(1e18)) / reserve1;
      fee = (pool.fee || 300) / 10000; // Convert basis points to percentage (300 = 0.3%)
    } else if (pool.liquidity && pool.sqrtPriceX96) {
      // Convert to BigInt
      const liquidity = BigInt(pool.liquidity);
      const sqrtPriceX96 = BigInt(pool.sqrtPriceX96);
      
      // V3 pool: calculate from sqrtPriceX96
      const price = (sqrtPriceX96 * sqrtPriceX96) >> 192n;
      exchangeRate = price;
      inverseRate = (BigInt(1e18) * BigInt(1e18)) / price;
      fee = (pool.fee || 300) / 10000; // Convert basis points to percentage
    } else {
      throw new Error('Pool has no state data');
    }

    return {
      fromToken: pool.token0.address,
      toToken: pool.token1.address,
      pool,
      exchangeRate,
      inverseRate,
      liquidity: liquidityUSD,
      fee,
      dex: pool.dex
    };
  }

  /**
   * Add edge to graph
   */
  private addEdge(edge: PoolEdge): void {
    if (!this.edges.has(edge.fromToken)) {
      this.edges.set(edge.fromToken, []);
    }
    this.edges.get(edge.fromToken)!.push(edge);
  }

  /**
   * Add reverse edge to graph
   */
  private addReverseEdge(edge: PoolEdge): void {
    const reverseEdge: PoolEdge = {
      fromToken: edge.toToken,
      toToken: edge.fromToken,
      pool: edge.pool,
      exchangeRate: edge.inverseRate,
      inverseRate: edge.exchangeRate,
      liquidity: edge.liquidity,
      fee: edge.fee,
      dex: edge.dex
    };
    
    if (!this.reverseEdges.has(reverseEdge.fromToken)) {
      this.reverseEdges.set(reverseEdge.fromToken, []);
    }
    this.reverseEdges.get(reverseEdge.fromToken)!.push(reverseEdge);
  }

  /**
   * Calculate pool liquidity in USD
   */
  private calculatePoolLiquidityUSD(pool: Pool): bigint {
    // Simplified calculation - in production, use price oracle
    // For now, estimate based on token symbols
    const stablecoins = ['USDC', 'USDbC', 'DAI', 'USDT'];
    const isToken0Stable = stablecoins.includes(pool.token0.symbol.toUpperCase());
    const isToken1Stable = stablecoins.includes(pool.token1.symbol.toUpperCase());

    if (pool.reserve0 && pool.reserve1) {
      // Convert reserves to BigInt
      const reserve0 = BigInt(pool.reserve0);
      const reserve1 = BigInt(pool.reserve1);
      
      if (isToken0Stable) {
        // Token0 is stablecoin - use reserve0
        // Reserve is in wei, so divide by 10^decimals for actual value
        const divisor = BigInt(10 ** pool.token0.decimals);
        const actualReserve = reserve0 / divisor;
        return actualReserve * 2n; // Total liquidity = 2 * reserve
      } else if (isToken1Stable) {
        // Token1 is stablecoin - use reserve1
        const divisor = BigInt(10 ** pool.token1.decimals);
        const actualReserve = reserve1 / divisor;
        return actualReserve * 2n;
      } else {
        // Estimate - both tokens volatile
        const divisor0 = BigInt(10 ** pool.token0.decimals);
        const divisor1 = BigInt(10 ** pool.token1.decimals);
        const actualReserve0 = reserve0 / divisor0;
        const actualReserve1 = reserve1 / divisor1;
        return (actualReserve0 + actualReserve1) / 2n;
      }
    } else if (pool.liquidity && pool.sqrtPriceX96) {
      // V3 pool - rough estimate
      return BigInt(pool.liquidity);
    }
    
    return BigInt(0);
  }

  /**
   * Get edges from a token
   */
  getEdges(token: string): PoolEdge[] {
    const forwardEdges = this.edges.get(token) || [];
    const reverseEdges = this.reverseEdges.get(token) || [];
    return [...forwardEdges, ...reverseEdges];
  }

  /**
   * Get reverse edges to a token
   */
  getReverseEdges(token: string): PoolEdge[] {
    return this.reverseEdges.get(token) || [];
  }

  /**
   * Check if token exists in graph
   */
  hasToken(token: string): boolean {
    return this.nodes.has(token);
  }

  /**
   * Get all tokens in graph
   */
  getAllTokens(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Count total edges
   */
  private countEdges(): number {
    let count = 0;
    for (const edges of this.edges.values()) {
      count += edges.length;
    }
    return count;
  }
}

export class ArbitragePathGenerator {
  private graph: ArbitrageGraph;
  private maxHops: number;
  private minProfitThreshold: number;

  constructor(
    graph: ArbitrageGraph,
    maxHops: number = 5,
    minProfitThreshold: number = 0.001 // 0.1% minimum profit
  ) {
    this.graph = graph;
    this.maxHops = maxHops;
    this.minProfitThreshold = minProfitThreshold;
  }

  /**
   * Generate triangular arbitrage paths (3-hop)
   */
  generateTriangularPaths(flashLoanToken: string): ArbitragePath[] {
    console.log(`🔺 Generating triangular paths for ${flashLoanToken}...`);
    
    const paths: ArbitragePath[] = [];
    const visited = new Set<string>();
    const startToken = flashLoanToken;

    if (!this.graph.hasToken(startToken)) {
      console.log(`⚠️  Token ${startToken} not found in graph`);
      return paths;
    }

    const edges = this.graph.getEdges(startToken);
    console.log(`   Found ${edges.length} edges from ${flashLoanToken}`);
    
    for (const firstEdge of edges) {
      const secondToken = firstEdge.toToken;
      if (visited.has(secondToken)) continue;
      visited.add(secondToken);

      const secondEdges = this.graph.getEdges(secondToken);
      
      for (const secondEdge of secondEdges) {
        const thirdToken = secondEdge.toToken;
        if (visited.has(thirdToken)) continue;

        // Check if we can return to start token
        const thirdEdges = this.graph.getEdges(thirdToken);
        for (const thirdEdge of thirdEdges) {
          if (thirdEdge.toToken === startToken) {
            // Found a triangle
            const path = this.createTriangularPath(
              [firstEdge, secondEdge, thirdEdge],
              flashLoanToken
            );
            if (path && this.isProfitable(path)) {
              paths.push(path);
            }
          }
        }
      }
    }

    console.log(`✅ Generated ${paths.length} triangular paths`);
    return paths;
  }

  /**
   * Generate multi-hop arbitrage paths (4-6 hops)
   */
  generateMultiHopPaths(flashLoanToken: string): ArbitragePath[] {
    console.log(`🔄 Generating multi-hop paths for ${flashLoanToken}...`);
    
    const paths: ArbitragePath[] = [];
    const startToken = flashLoanToken;

    if (!this.graph.hasToken(startToken)) {
      console.log(`⚠️  Token ${startToken} not found in graph`);
      return paths;
    }

    // Use BFS to find paths with 4-6 hops
    for (let targetHops = 4; targetHops <= Math.min(this.maxHops, 6); targetHops++) {
      const foundPaths = this.findPathsBFS(startToken, startToken, targetHops);
      paths.push(...foundPaths);
    }

    console.log(`✅ Generated ${paths.length} multi-hop paths`);
    return paths;
  }

  /**
   * Generate cross-DEX arbitrage paths
   */
  generateCrossDEXPaths(flashLoanToken: string): ArbitragePath[] {
    console.log(`🌐 Generating cross-DEX paths for ${flashLoanToken}...`);
    
    const paths: ArbitragePath[] = [];
    const startToken = flashLoanToken;

    if (!this.graph.hasToken(startToken)) {
      console.log(`⚠️  Token ${startToken} not found in graph`);
      return paths;
    }

    // Find paths that use multiple DEXs
    const allPaths = this.findPathsWithMultipleDEXs(startToken, startToken, 4);
    
    for (const path of allPaths) {
      if (this.usesMultipleDEXs(path) && this.isProfitable(path)) {
        paths.push(path);
      }
    }

    console.log(`✅ Generated ${paths.length} cross-DEX paths`);
    return paths;
  }

  /**
   * Find paths using BFS
   */
  private findPathsBFS(startToken: string, endToken: string, maxHops: number): ArbitragePath[] {
    const paths: ArbitragePath[] = [];
    const queue: Array<{currentToken: string; path: PoolEdge[]}> = [];
    
    queue.push({currentToken: startToken, path: []});

    while (queue.length > 0) {
      const {currentToken, path} = queue.shift()!;

      if (path.length === maxHops) {
        if (currentToken === endToken && path.length > 0) {
          const arbitragePath = this.createPathFromEdges(path, startToken);
          if (arbitragePath && this.isProfitable(arbitragePath)) {
            paths.push(arbitragePath);
          }
        }
        continue;
      }

      const edges = this.graph.getEdges(currentToken);
      for (const edge of edges) {
        // Avoid cycles
        const visitedTokens = new Set(path.map(e => e.fromToken));
        visitedTokens.add(currentToken);
        
        if (!visitedTokens.has(edge.toToken)) {
          queue.push({
            currentToken: edge.toToken,
            path: [...path, edge]
          });
        }
      }
    }

    return paths;
  }

  /**
   * Find paths that use multiple DEXs
   */
  private findPathsWithMultipleDEXs(startToken: string, endToken: string, maxHops: number): ArbitragePath[] {
    const allPaths = this.findPathsBFS(startToken, endToken, maxHops);
    return allPaths.filter(path => this.usesMultipleDEXs(path));
  }

  /**
   * Check if path uses multiple DEXs
   */
  private usesMultipleDEXs(path: ArbitragePath): boolean {
    const dexs = new Set(path.steps.map(step => step.dex));
    return dexs.size > 1;
  }

  /**
   * Create triangular arbitrage path
   */
  private createTriangularPath(edges: PoolEdge[], flashLoanToken: string): ArbitragePath | null {
    if (edges.length !== 3) return null;

    const steps: PathStep[] = [];
    let currentAmount = ethers.parseUnits('1', 18); // Start with 1 unit
    let flashLoanAmount = currentAmount;

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const amountAfterFee = currentAmount * BigInt(Math.floor((1 - edge.fee) * 1e18)) / BigInt(1e18);
      const amountOut = (amountAfterFee * edge.exchangeRate) / BigInt(1e18);

      steps.push({
        fromToken: edge.fromToken,
        toToken: edge.toToken,
        pool: edge.pool,
        amountIn: currentAmount,
        expectedAmountOut: amountOut,
        dex: edge.dex,
        fee: edge.fee
      });

      currentAmount = amountOut;
    }

    // Calculate profit
    const profit = currentAmount - flashLoanAmount;
    const flashLoanFee = flashLoanAmount * BigInt(Math.floor(FLASH_LOAN_FEE * 1e18)) / BigInt(1e18);
    const netProfit = profit - flashLoanFee;

    if (netProfit <= 0) return null;

    return {
      id: this.generatePathId(steps),
      steps,
      totalHops: steps.length,
      estimatedProfit: profit,
      gasCost: BigInt(0), // Will be calculated later
      netProfit,
      roi: Number(netProfit) / Number(flashLoanAmount),
      flashLoanAmount,
      flashLoanToken,
      confidence: this.calculateConfidence(steps)
    };
  }

  /**
   * Create path from edges
   */
  private createPathFromEdges(edges: PoolEdge[], flashLoanToken: string): ArbitragePath | null {
    if (edges.length === 0) return null;

    const steps: PathStep[] = [];
    let currentAmount = ethers.parseUnits('1', 18);
    let flashLoanAmount = currentAmount;

    for (const edge of edges) {
      const amountAfterFee = currentAmount * BigInt(Math.floor((1 - edge.fee) * 1e18)) / BigInt(1e18);
      const amountOut = (amountAfterFee * edge.exchangeRate) / BigInt(1e18);

      steps.push({
        fromToken: edge.fromToken,
        toToken: edge.toToken,
        pool: edge.pool,
        amountIn: currentAmount,
        expectedAmountOut: amountOut,
        dex: edge.dex,
        fee: edge.fee
      });

      currentAmount = amountOut;
    }

    const profit = currentAmount - flashLoanAmount;
    const flashLoanFee = flashLoanAmount * BigInt(Math.floor(FLASH_LOAN_FEE * 1e18)) / BigInt(1e18);
    const netProfit = profit - flashLoanFee;

    if (netProfit <= 0) return null;

    return {
      id: this.generatePathId(steps),
      steps,
      totalHops: steps.length,
      estimatedProfit: profit,
      gasCost: BigInt(0),
      netProfit,
      roi: Number(netProfit) / Number(flashLoanAmount),
      flashLoanAmount,
      flashLoanToken,
      confidence: this.calculateConfidence(steps)
    };
  }

  /**
   * Check if path is profitable
   */
  private isProfitable(path: ArbitragePath): boolean {
    return path.netProfit > 0 && path.roi > this.minProfitThreshold;
  }

  /**
   * Generate unique path ID
   */
  private generatePathId(steps: PathStep[]): string {
    const pathString = steps.map(step => 
      `${step.fromToken}-${step.toToken}-${step.dex}`
    ).join('->');
    return ethers.keccak256(ethers.toUtf8Bytes(pathString)).slice(0, 10);
  }

  /**
   * Calculate path confidence score
   */
  private calculateConfidence(steps: PathStep[]): number {
    // Confidence based on:
    // 1. Pool liquidity
    // 2. Path length (shorter is better)
    // 3. DEX diversity
    // 4. Fee optimization

    let liquidityScore = 0;
    let pathLengthScore = 0;
    let dexDiversityScore = 0;
    let feeScore = 0;

    // Liquidity score (0-1)
    const avgLiquidity = steps.reduce((sum, step) => {
      const liquidity = this.calculatePoolLiquidityUSD(step.pool);
      return sum + Number(liquidity) / 1e18;
    }, 0) / steps.length;
    liquidityScore = Math.min(avgLiquidity / 100000, 1); // Normalize to 0-1

    // Path length score (0-1, shorter is better)
    pathLengthScore = Math.max(0, 1 - (steps.length / this.maxHops));

    // DEX diversity score (0-1)
    const uniqueDexs = new Set(steps.map(step => step.dex));
    dexDiversityScore = Math.min(uniqueDexs.size / steps.length, 1);

    // Fee score (0-1, lower is better)
    const avgFee = steps.reduce((sum, step) => sum + step.fee, 0) / steps.length;
    feeScore = Math.max(0, 1 - (avgFee / 0.01)); // Normalize against 1% max fee

    // Weighted average
    return (liquidityScore * 0.4) + 
           (pathLengthScore * 0.2) + 
           (dexDiversityScore * 0.2) + 
           (feeScore * 0.2);
  }

  /**
   * Calculate pool liquidity in USD (same as graph method)
   */
  private calculatePoolLiquidityUSD(pool: Pool): bigint {
    const stablecoins = ['USDC', 'USDbC', 'DAI', 'USDT'];
    const isToken0Stable = stablecoins.includes(pool.token0.symbol.toUpperCase());
    const isToken1Stable = stablecoins.includes(pool.token1.symbol.toUpperCase());

    if (pool.reserve0 && pool.reserve1) {
      if (isToken0Stable) {
        return pool.reserve0 * 2n;
      } else if (isToken1Stable) {
        return pool.reserve1 * 2n;
      } else {
        return (pool.reserve0 + pool.reserve1) / 2n;
      }
    } else if (pool.liquidity && pool.sqrtPriceX96) {
      return pool.liquidity;
    }
    
    return BigInt(0);
  }

  /**
   * Get all Aave V3 supported tokens
   */
  static getAaveV3Tokens(): string[] {
    return Object.values(AAVE_V3_ASSETS);
  }

  /**
   * Get token symbol from address
   */
  static getTokenSymbol(address: string): string {
    const entry = Object.entries(AAVE_V3_ASSETS).find(([_, addr]) => 
      addr.toLowerCase() === address.toLowerCase()
    );
    return entry ? entry[0] : 'UNKNOWN';
  }
}