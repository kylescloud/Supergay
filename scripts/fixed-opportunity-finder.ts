import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IMPROVED Opportunity Finder
 * Fixes common issues that prevent finding arbitrage opportunities
 */

interface Pool {
  address: string;
  token0: string;
  token1: string;
  dex: string;
  fee?: number;
  reserve0?: string;
  reserve1?: string;
}

interface ArbitrageOpportunity {
  type: 'triangular' | 'multi-hop' | 'cross-dex' | 'flash-swap';
  pools: string[];
  path: string[];
  estimatedProfit: bigint;
  profitBps: number;
  gasEstimate: bigint;
  netProfit: bigint;
  dexes: string[];
}

export class ImprovedOpportunityFinder {
  private provider: ethers.JsonRpcProvider;
  private pools: Pool[] = [];
  private priceCache: Map<string, { price: bigint; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 2000; // 2 seconds
  
  // LOWERED THRESHOLDS FOR MORE OPPORTUNITIES
  private readonly MIN_PROFIT_BPS = 10; // 0.1% (was probably 50-100 before)
  private readonly MIN_NET_PROFIT_WEI = ethers.parseEther('0.0001'); // $0.30 at $3000/ETH
  private readonly MAX_GAS_GWEI = 50;
  
  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.loadPools();
  }

  private loadPools(): void {
    try {
      const poolsPath = path.join(process.cwd(), 'data', 'base-pools.json');
      
      if (!fs.existsSync(poolsPath)) {
        console.warn('⚠️  No pool data found. Run: npm run scan:pools');
        return;
      }

      const poolData = JSON.parse(fs.readFileSync(poolsPath, 'utf-8'));
      this.pools = poolData.pools || [];
      
      console.log(`✅ Loaded ${this.pools.length} pools`);
      
      // Group by token pairs for easier lookup
      this.buildTokenPairIndex();
    } catch (error) {
      console.error('Failed to load pools:', error);
    }
  }

  private tokenPairIndex: Map<string, Pool[]> = new Map();

  private buildTokenPairIndex(): void {
    for (const pool of this.pools) {
      const key = this.getTokenPairKey(pool.token0, pool.token1);
      
      if (!this.tokenPairIndex.has(key)) {
        this.tokenPairIndex.set(key, []);
      }
      
      this.tokenPairIndex.get(key)!.push(pool);
    }
    
    console.log(`📊 Built index with ${this.tokenPairIndex.size} unique token pairs`);
  }

  private getTokenPairKey(token0: string, token1: string): string {
    return [token0.toLowerCase(), token1.toLowerCase()].sort().join('-');
  }

  /**
   * MAIN SCANNING FUNCTION - IMPROVED LOGIC
   */
  async findOpportunities(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    console.log(`🔍 Scanning ${this.pools.length} pools...`);
    
    // Strategy 1: Cross-DEX arbitrage (most common)
    const crossDexOpps = await this.findCrossDEXArbitrage();
    opportunities.push(...crossDexOpps);
    
    // Strategy 2: Triangular arbitrage
    const triangularOpps = await this.findTriangularArbitrage();
    opportunities.push(...triangularOpps);
    
    // Strategy 3: Multi-hop arbitrage
    const multiHopOpps = await this.findMultiHopArbitrage();
    opportunities.push(...multiHopOpps);
    
    console.log(`✅ Found ${opportunities.length} opportunities`);
    
    // Sort by net profit
    opportunities.sort((a, b) => Number(b.netProfit - a.netProfit));
    
    return opportunities;
  }

  /**
   * CROSS-DEX ARBITRAGE - Same token pair, different DEXs
   * This is the easiest to find and most profitable
   */
  private async findCrossDEXArbitrage(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // For each token pair, compare prices across DEXs
    for (const [pairKey, pools] of this.tokenPairIndex.entries()) {
      if (pools.length < 2) continue; // Need at least 2 DEXs
      
      // Get prices from all pools
      const poolPrices: Array<{ pool: Pool; price: bigint }> = [];
      
      for (const pool of pools) {
        try {
          const price = await this.getPoolPrice(pool);
          if (price > 0n) {
            poolPrices.push({ pool, price });
          }
        } catch (error) {
          // Skip pools with errors
          continue;
        }
      }
      
      if (poolPrices.length < 2) continue;
      
      // Find best buy and sell prices
      poolPrices.sort((a, b) => Number(a.price - b.price));
      const cheapest = poolPrices[0];
      const mostExpensive = poolPrices[poolPrices.length - 1];
      
      // Calculate profit
      const priceDiff = mostExpensive.price - cheapest.price;
      const profitBps = Number((priceDiff * 10000n) / cheapest.price);
      
      if (profitBps >= this.MIN_PROFIT_BPS) {
        const tradeAmount = ethers.parseEther('0.1'); // Test with 0.1 ETH
        const estimatedProfit = (tradeAmount * BigInt(profitBps)) / 10000n;
        const gasEstimate = ethers.parseUnits('200000', 'gwei') * BigInt(this.MAX_GAS_GWEI);
        const netProfit = estimatedProfit - gasEstimate;
        
        if (netProfit > this.MIN_NET_PROFIT_WEI) {
          opportunities.push({
            type: 'cross-dex',
            pools: [cheapest.pool.address, mostExpensive.pool.address],
            path: [cheapest.pool.token0, cheapest.pool.token1],
            estimatedProfit,
            profitBps,
            gasEstimate,
            netProfit,
            dexes: [cheapest.pool.dex, mostExpensive.pool.dex]
          });
        }
      }
    }
    
    console.log(`   Cross-DEX: ${opportunities.length} opportunities`);
    return opportunities;
  }

  /**
   * TRIANGULAR ARBITRAGE - A → B → C → A
   */
  private async findTriangularArbitrage(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const commonBaseTokens = [
      '0x4200000000000000000000000000000000000006', // WETH
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
    ];
    
    for (const baseToken of commonBaseTokens) {
      // Find all pools with this base token
      const poolsWithBase = this.pools.filter(p => 
        p.token0.toLowerCase() === baseToken.toLowerCase() || 
        p.token1.toLowerCase() === baseToken.toLowerCase()
      );
      
      // Try combinations
      for (let i = 0; i < Math.min(poolsWithBase.length, 50); i++) {
        for (let j = i + 1; j < Math.min(poolsWithBase.length, 50); j++) {
          const pool1 = poolsWithBase[i];
          const pool2 = poolsWithBase[j];
          
          // Check if they form a triangle
          const intermediateToken = this.findCommonToken(pool1, pool2, baseToken);
          if (!intermediateToken) continue;
          
          // Find pool to close the triangle
          const pool3 = this.findPoolForPair(baseToken, intermediateToken);
          if (!pool3) continue;
          
          // Calculate if profitable
          try {
            const profit = await this.calculateTriangularProfit([pool1, pool2, pool3], baseToken);
            
            if (profit.profitBps >= this.MIN_PROFIT_BPS && profit.netProfit > this.MIN_NET_PROFIT_WEI) {
              opportunities.push({
                type: 'triangular',
                pools: [pool1.address, pool2.address, pool3.address],
                path: profit.path,
                estimatedProfit: profit.estimatedProfit,
                profitBps: profit.profitBps,
                gasEstimate: profit.gasEstimate,
                netProfit: profit.netProfit,
                dexes: [pool1.dex, pool2.dex, pool3.dex]
              });
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
    
    console.log(`   Triangular: ${opportunities.length} opportunities`);
    return opportunities;
  }

  /**
   * MULTI-HOP ARBITRAGE - Simple 2-hop opportunities
   */
  private async findMultiHopArbitrage(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Focus on WETH pairs
    const weth = '0x4200000000000000000000000000000000000006';
    const wethPools = this.pools.filter(p => 
      p.token0.toLowerCase() === weth.toLowerCase() || 
      p.token1.toLowerCase() === weth.toLowerCase()
    );
    
    for (let i = 0; i < Math.min(wethPools.length, 30); i++) {
      for (let j = i + 1; j < Math.min(wethPools.length, 30); j++) {
        const pool1 = wethPools[i];
        const pool2 = wethPools[j];
        
        // Check if different DEXs
        if (pool1.dex === pool2.dex) continue;
        
        // Check if they share a token
        const sharedToken = this.findCommonToken(pool1, pool2, weth);
        if (!sharedToken) continue;
        
        try {
          const price1 = await this.getPoolPrice(pool1);
          const price2 = await this.getPoolPrice(pool2);
          
          if (price1 === 0n || price2 === 0n) continue;
          
          // Simple profit calculation
          const priceDiff = price1 > price2 ? price1 - price2 : price2 - price1;
          const avgPrice = (price1 + price2) / 2n;
          const profitBps = Number((priceDiff * 10000n) / avgPrice);
          
          if (profitBps >= this.MIN_PROFIT_BPS) {
            const tradeAmount = ethers.parseEther('0.1');
            const estimatedProfit = (tradeAmount * BigInt(profitBps)) / 10000n;
            const gasEstimate = ethers.parseUnits('300000', 'gwei') * BigInt(this.MAX_GAS_GWEI);
            const netProfit = estimatedProfit - gasEstimate;
            
            if (netProfit > this.MIN_NET_PROFIT_WEI) {
              opportunities.push({
                type: 'multi-hop',
                pools: [pool1.address, pool2.address],
                path: [weth, sharedToken, weth],
                estimatedProfit,
                profitBps,
                gasEstimate,
                netProfit,
                dexes: [pool1.dex, pool2.dex]
              });
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    console.log(`   Multi-hop: ${opportunities.length} opportunities`);
    return opportunities;
  }

  /**
   * GET POOL PRICE - Improved with caching
   */
  private async getPoolPrice(pool: Pool): Promise<bigint> {
    const cacheKey = pool.address;
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }
    
    try {
      // For Uniswap V3
      if (pool.dex.toLowerCase().includes('uniswap')) {
        const price = await this.getUniswapV3Price(pool);
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
      
      // For Uniswap V2 style (most others)
      if (pool.reserve0 && pool.reserve1) {
        const reserve0 = BigInt(pool.reserve0);
        const reserve1 = BigInt(pool.reserve1);
        
        if (reserve0 > 0n && reserve1 > 0n) {
          const price = (reserve1 * ethers.parseEther('1')) / reserve0;
          this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
          return price;
        }
      }
      
      // Fallback: fetch from contract
      const price = await this.fetchPoolPriceOnchain(pool);
      this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
      return price;
    } catch (error) {
      return 0n;
    }
  }

  private async getUniswapV3Price(pool: Pool): Promise<bigint> {
    try {
      const poolContract = new ethers.Contract(
        pool.address,
        ['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)'],
        this.provider
      );
      
      const slot0 = await poolContract.slot0();
      const sqrtPriceX96 = slot0[0];
      
      // Convert sqrtPriceX96 to price
      const price = (sqrtPriceX96 * sqrtPriceX96 * ethers.parseEther('1')) / (2n ** 192n);
      return price;
    } catch (error) {
      return 0n;
    }
  }

  private async fetchPoolPriceOnchain(pool: Pool): Promise<bigint> {
    try {
      const poolContract = new ethers.Contract(
        pool.address,
        ['function getReserves() view returns (uint112, uint112, uint32)'],
        this.provider
      );
      
      const reserves = await poolContract.getReserves();
      const reserve0 = reserves[0];
      const reserve1 = reserves[1];
      
      if (reserve0 > 0n && reserve1 > 0n) {
        return (reserve1 * ethers.parseEther('1')) / reserve0;
      }
      
      return 0n;
    } catch (error) {
      return 0n;
    }
  }

  private findCommonToken(pool1: Pool, pool2: Pool, excludeToken: string): string | null {
    const tokens1 = [pool1.token0.toLowerCase(), pool1.token1.toLowerCase()];
    const tokens2 = [pool2.token0.toLowerCase(), pool2.token1.toLowerCase()];
    const exclude = excludeToken.toLowerCase();
    
    for (const token of tokens1) {
      if (token !== exclude && tokens2.includes(token)) {
        return token;
      }
    }
    
    return null;
  }

  private findPoolForPair(token0: string, token1: string): Pool | null {
    const key = this.getTokenPairKey(token0, token1);
    const pools = this.tokenPairIndex.get(key);
    return pools && pools.length > 0 ? pools[0] : null;
  }

  private async calculateTriangularProfit(
    pools: [Pool, Pool, Pool],
    baseToken: string
  ): Promise<{
    estimatedProfit: bigint;
    profitBps: number;
    gasEstimate: bigint;
    netProfit: bigint;
    path: string[];
  }> {
    // Simulate the trade path
    let currentAmount = ethers.parseEther('0.1'); // Start with 0.1 ETH
    const path: string[] = [baseToken];
    
    for (const pool of pools) {
      const price = await this.getPoolPrice(pool);
      if (price === 0n) throw new Error('Invalid price');
      
      // Apply 0.3% fee (typical)
      const fee = (currentAmount * 3n) / 1000n;
      currentAmount = currentAmount - fee;
      
      // Calculate output
      currentAmount = (currentAmount * price) / ethers.parseEther('1');
      
      // Add to path
      const nextToken = pool.token0.toLowerCase() === path[path.length - 1].toLowerCase() 
        ? pool.token1 
        : pool.token0;
      path.push(nextToken);
    }
    
    const initialAmount = ethers.parseEther('0.1');
    const profit = currentAmount > initialAmount ? currentAmount - initialAmount : 0n;
    const profitBps = Number((profit * 10000n) / initialAmount);
    const gasEstimate = ethers.parseUnits('400000', 'gwei') * BigInt(this.MAX_GAS_GWEI);
    const netProfit = profit - gasEstimate;
    
    return {
      estimatedProfit: profit,
      profitBps,
      gasEstimate,
      netProfit,
      path
    };
  }

  /**
   * Format opportunity for display
   */
  formatOpportunity(opp: ArbitrageOpportunity): string {
    return `
${opp.type.toUpperCase()} ARBITRAGE
DEXs: ${opp.dexes.join(' → ')}
Path: ${opp.path.map(t => t.substring(0, 6) + '...').join(' → ')}
Profit: ${ethers.formatEther(opp.estimatedProfit)} ETH (${opp.profitBps / 100}%)
Gas: ${ethers.formatEther(opp.gasEstimate)} ETH
Net: ${ethers.formatEther(opp.netProfit)} ETH
`;
  }
}

// CLI usage
async function main() {
  console.log('🚀 Improved Opportunity Finder\n');
  
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const finder = new ImprovedOpportunityFinder(rpcUrl);
  
  console.log('Starting scan...\n');
  const opportunities = await finder.findOpportunities();
  
  if (opportunities.length === 0) {
    console.log('\n⚠️  No opportunities found. This could mean:');
    console.log('1. Pool data is outdated - run: npm run scan:pools');
    console.log('2. Profit thresholds are too high - check config.json');
    console.log('3. No arbitrage exists right now - wait and scan again');
    console.log('\n💡 Try lowering MIN_PROFIT_BPS in this file to find more opportunities');
  } else {
    console.log(`\n✅ Found ${opportunities.length} opportunities:\n`);
    
    // Show top 5
    for (let i = 0; i < Math.min(5, opportunities.length); i++) {
      console.log(finder.formatOpportunity(opportunities[i]));
      console.log('-'.repeat(80));
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default ImprovedOpportunityFinder;
