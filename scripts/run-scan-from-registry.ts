import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { PoolRegistryManager } from '../src/pools/registry';
import { RPCManager } from '../src/utils/rpcManager';
import { TOKENS } from '../src/config/constants';
import fs from 'fs/promises';
import path from 'path';

/**
 * Production Scan from Registry
 * 
 * This script loads pools from the existing pool-registry.json (477 pools)
 * and runs arbitrage detection without re-fetching from DEXs.
 */

class ProductionScanner {
  private provider: ethers.JsonRpcProvider;
  private registry: PoolRegistryManager;
  private logDir: string;

  constructor() {
    const rpcManager = new RPCManager();
    this.provider = rpcManager.getProvider('scanning' as any);
    this.registry = new PoolRegistryManager();
    this.logDir = './logs/detailed-scans';
  }

  private async ensureLogDir() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  async runScan(baseToken: string = 'WETH', loanAmount: bigint = BigInt('10000000000000000000')) {
    const startTime = Date.now();
    const blockNumber = await this.provider.getBlockNumber();

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║         PRODUCTION ARBITRAGE SCAN - BASE BLOCKCHAIN                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📍 Block Number: ${blockNumber}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

    // Load pool registry
    console.log('📂 Loading pool registry from data/pool-registry.json...');
    await this.registry.load();
    const pools = this.registry.getAllPools();
    console.log(`✅ Loaded ${pools.length} pools from registry\n`);

    // Display pool summary
    console.log('📊 Pool Distribution:');
    const poolsByDex: Record<string, number> = {};
    const poolsByType: Record<string, number> = {};
    
    for (const pool of pools) {
      poolsByDex[pool.dex] = (poolsByDex[pool.dex] || 0) + 1;
      poolsByType[pool.dexVersion] = (poolsByType[pool.dexVersion] || 0) + 1;
    }
    
    console.log('   By DEX:');
    for (const [dex, count] of Object.entries(poolsByDex).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${dex}: ${count}`);
    }
    console.log('   By Type:');
    for (const [type, count] of Object.entries(poolsByType).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${type}: ${count}`);
    }
    console.log('');

    // Check pool state data
    let poolsWithState = 0;
    let poolsMissingState = 0;
    
    for (const pool of pools) {
      if (pool.dexVersion === 'v3' || pool.dexVersion === 'v3-like') {
        if (pool.sqrtPriceX96 && pool.liquidity) {
          poolsWithState++;
        } else {
          poolsMissingState++;
        }
      } else if (pool.dexVersion === 'v2') {
        if (pool.reserve0 && pool.reserve1) {
          poolsWithState++;
        } else {
          poolsMissingState++;
        }
      }
    }
    
    console.log(`📊 Pool State Data:`);
    console.log(`   Pools with valid state: ${poolsWithState}`);
    console.log(`   Pools missing state: ${poolsMissingState}`);
    console.log('');

    // Initialize opportunity finder
    console.log('🔍 Initializing OpportunityFinder...');
    const opportunityFinder = new OpportunityFinder(this.provider, baseToken);
    await opportunityFinder.initialize();
    console.log('✅ OpportunityFinder initialized\n');

    // Build snapshot from registry
    console.log('📸 Building block snapshot from pool registry...');
    
    // Import StateSnapshotManager to build snapshot
    const { StateSnapshotManager } = await import('../src/dex/stateSnapshot');
    const snapshotManager = new StateSnapshotManager(this.provider);
    
    // Convert pools to pool states
    const poolStates: any[] = [];
    for (const pool of pools) {
      if (pool.dexVersion === 'v3' || pool.dexVersion === 'v3-like') {
        if (pool.sqrtPriceX96 && pool.liquidity) {
          poolStates.push({
            address: pool.address,
            dex: pool.dex,
            dexVersion: pool.dexVersion,
            token0: pool.token0,
            token1: pool.token1,
            fee: pool.fee,
            liquidity: pool.liquidity,
            sqrtPriceX96: pool.sqrtPriceX96,
            tick: pool.tick
          });
        }
      } else if (pool.dexVersion === 'v2') {
        if (pool.reserve0 && pool.reserve1) {
          poolStates.push({
            address: pool.address,
            dex: pool.dex,
            dexVersion: pool.dexVersion,
            token0: pool.token0,
            token1: pool.token1,
            reserve0: pool.reserve0,
            reserve1: pool.reserve1
          });
        }
      }
    }
    
    console.log(`✅ Snapshot built with ${poolStates.length} pools\n`);

    // Run strategies
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                        ARBITRAGE STRATEGIES                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const allOpportunities: any[] = [];

    // Strategy 1: Multi-Hop Cyclic Arbitrage
    console.log('🔄 [Strategy 1] Multi-Hop Cyclic Arbitrage');
    try {
      const cyclicOpps = await opportunityFinder['multiHopStrategy'].findArbitrage(
        poolStates,
        baseToken,
        loanAmount
      );
      console.log(`   ✅ Found ${cyclicOpps.length} opportunities`);
      allOpportunities.push(...cyclicOpps);
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Strategy 2: Fee-Tier Mispricing
    console.log('🎯 [Strategy 2] Fee-Tier Mispricing Arbitrage');
    try {
      const feeTierOpps = await opportunityFinder['feeTierStrategy'].findArbitrage(
        poolStates,
        baseToken,
        loanAmount
      );
      console.log(`   ✅ Found ${feeTierOpps.length} opportunities`);
      allOpportunities.push(...feeTierOpps);
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Strategy 3: Liquidity Fragmentation
    console.log('💧 [Strategy 3] Liquidity Fragmentation Arbitrage');
    try {
      const fragOpps = await opportunityFinder['liquidityFragmentationStrategy'].findArbitrage(
        poolStates,
        baseToken,
        loanAmount
      );
      console.log(`   ✅ Found ${fragOpps.length} opportunities`);
      allOpportunities.push(...fragOpps);
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Strategy 4: Stable-Volatile Arbitrage
    console.log('⚖️  [Strategy 4] Stable-Volatile Arbitrage');
    try {
      const stableVolatileOpps = await opportunityFinder['stableVolatileStrategy'].findArbitrage(
        poolStates,
        baseToken,
        loanAmount
      );
      console.log(`   ✅ Found ${stableVolatileOpps.length} opportunities`);
      allOpportunities.push(...stableVolatileOpps);
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    const endTime = Date.now();
    const scanDuration = endTime - startTime;

    // Filter and validate opportunities
    console.log('🔍 Validating opportunities...');
    const profitableOpps = allOpportunities.filter(opp => {
      if (!opp.expectedProfit || opp.expectedProfit <= 0n) return false;
      const profitEth = Number(ethers.formatEther(opp.expectedProfit));
      const loanEth = Number(ethers.formatEther(loanAmount));
      const profitMargin = profitEth / loanEth;
      
      // Validate profit margin (reasonable range: 0.01% to 10%)
      if (profitMargin < 0.0001 || profitMargin > 0.10) {
        console.log(`   ⚠️  Filtered: ${profitMargin.toFixed(4)} margin (unrealistic)`);
        return false;
      }
      
      return true;
    });
    
    console.log(`   ✅ ${profitableOpps.length}/${allOpportunities.length} opportunities passed validation\n`);

    // Display results
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              SCAN RESULTS                                   ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`⏱️  Scan Duration: ${scanDuration}ms (${(scanDuration / 1000).toFixed(2)}s)`);
    console.log(`📊 Total Opportunities Found: ${allOpportunities.length}`);
    console.log(`💰 Profitable Opportunities: ${profitableOpps.length}\n`);

    if (profitableOpps.length > 0) {
      console.log('🏆 Top Profitable Opportunities:\n');
      
      const sortedOpps = [...profitableOpps].sort((a, b) => 
        Number(b.expectedProfit - a.expectedProfit)
      ).slice(0, 10);
      
      sortedOpps.forEach((opp, idx) => {
        console.log(`${idx + 1}. ${opp.tokenPath?.map((t: any) => t.symbol).join(' → ') || 'Unknown'}`);
        console.log(`   Strategy: ${opp.strategy || 'Unknown'}`);
        console.log(`   DEX Path: ${opp.dexPath?.join(' → ') || 'Unknown'}`);
        console.log(`   Expected Profit: ${ethers.formatEther(opp.expectedProfit)} ETH`);
        console.log(`   Net Profit: ${ethers.formatEther(opp.netProfit || opp.expectedProfit)} ETH`);
        console.log(`   Flash Loan: ${ethers.formatEther(loanAmount)} WETH`);
        console.log('');
      });
    } else {
      console.log('❌ No profitable opportunities found in this scan.\n');
    }

    // Save results
    await this.ensureLogDir();
    const logFileName = `scan-from-registry-${Date.now()}.json`;
    const logFilePath = path.join(this.logDir, logFileName);

    const scanResult = {
      timestamp: new Date().toISOString(),
      blockNumber,
      scanDuration,
      baseToken,
      loanAmount: ethers.formatEther(loanAmount),
      poolsLoaded: pools.length,
      poolsUsed: poolStates.length,
      poolsMissingState: poolsMissingState,
      totalOpportunities: allOpportunities.length,
      profitableOpportunities: profitableOpps.length,
      opportunities: profitableOpps.map(opp => ({
        strategy: opp.strategy,
        tokenPath: opp.tokenPath?.map((t: any) => t.symbol).join(' → '),
        dexPath: opp.dexPath?.join(' → '),
        expectedProfit: ethers.formatEther(opp.expectedProfit),
        netProfit: ethers.formatEther(opp.netProfit || opp.expectedProfit),
        loanAmount: ethers.formatEther(loanAmount)
      }))
    };

    await fs.writeFile(logFilePath, JSON.stringify(scanResult, null, 2));
    console.log(`💾 Scan results saved to: ${logFilePath}\n`);

    return scanResult;
  }
}

// Main execution
async function main() {
  const scanner = new ProductionScanner();
  
  try {
    await scanner.runScan('WETH', BigInt('10000000000000000000')); // 10 WETH
    console.log('✅ Scan completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  }
}

main();