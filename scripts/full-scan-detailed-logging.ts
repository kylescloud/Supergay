import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { RPCManager } from '../src/utils/rpcManager';
import { TOKENS } from '../src/config/constants';
import fs from 'fs/promises';
import path from 'path';

/**
 * Full Scan with Detailed Logging
 * 
 * This script runs a comprehensive scan across all DEXs and logs every path scanned,
 * including profit details, calculations, and intermediate results.
 */

interface ScanLog {
  timestamp: string;
  blockNumber: number;
  scanDuration: number;
  baseToken: string;
  loanAmount: string;
  poolsScanned: {
    total: number;
    byDEX: Record<string, number>;
  };
  strategies: {
    name: string;
    pathsScanned: number;
    opportunitiesFound: number;
    details: any[];
  }[];
  totalOpportunities: number;
}

class DetailedScanner {
  private provider: ethers.JsonRpcProvider;
  private opportunityFinder: OpportunityFinder;
  private logDir: string;
  private currentScanLog!: ScanLog;
  private pathDetails: any[] = [];

  constructor() {
    // Initialize RPC manager
    const rpcManager = new RPCManager();
    this.provider = rpcManager.getProvider('scanning' as any);

    // Initialize opportunity finder
    this.opportunityFinder = new OpportunityFinder(this.provider, TOKENS.WETH);

    // Set up logging directory
    this.logDir = './logs/detailed-scans';
  }

  private async ensureLogDir() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  private formatAddress(address: string): string {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  private formatBigInt(value: bigint, decimals: number = 18): string {
    const num = Number(value) / Math.pow(10, decimals);
    return num.toFixed(6);
  }

  private async logPathScanned(
    strategy: string,
    path: {
      tokens: string[];
      dexs: string[];
      pools: string[];
    },
    profit: {
      gross: bigint;
      net: bigint;
      fees: {
        swap: bigint;
        gas: bigint;
        flashLoan: bigint;
        slippage: bigint;
      };
      rate: number;
    }
  ) {
    const pathDetail = {
      strategy,
      path: path.tokens.join(' → '),
      dexs: path.dexs.join(' → '),
      pools: path.pools.map(p => this.formatAddress(p)),
      profit: {
        gross: this.formatBigInt(profit.gross),
        net: this.formatBigInt(profit.net),
        swapFees: this.formatBigInt(profit.fees.swap),
        gasFees: this.formatBigInt(profit.fees.gas),
        flashLoanFees: this.formatBigInt(profit.fees.flashLoan),
        slippage: this.formatBigInt(profit.fees.slippage),
        rate: profit.rate.toFixed(6),
      },
      timestamp: new Date().toISOString()
    };

    this.pathDetails.push(pathDetail);

    // Log to console
    console.log(`  📊 Path: ${path.tokens.join(' → ')}`);
    console.log(`     DEXs: ${path.dexs.join(' → ')}`);
    console.log(`     Rate: ${profit.rate.toFixed(6)}`);
    console.log(`     Gross Profit: ${this.formatBigInt(profit.gross)} ETH`);
    console.log(`     Net Profit: ${this.formatBigInt(profit.net)} ETH`);
    console.log(`     Fees:`);
    console.log(`       Swap: ${this.formatBigInt(profit.fees.swap)} ETH`);
    console.log(`       Gas: ${this.formatBigInt(profit.fees.gas)} ETH`);
    console.log(`       Flash Loan: ${this.formatBigInt(profit.fees.flashLoan)} ETH`);
    console.log(`       Slippage: ${this.formatBigInt(profit.fees.slippage)} ETH`);
    console.log(`     Status: ${profit.net > 0n ? '✅ PROFITABLE' : '❌ UNPROFITABLE'}`);
    console.log();
  }

  async runFullScan(
    baseTokenSymbol: string = 'WETH',
    loanAmount: bigint = BigInt('10000000000000000000') // 10 ETH
  ) {
    await this.ensureLogDir();

    const startTime = Date.now();
    const startBlock = await this.provider.getBlockNumber();

    console.log('='.repeat(100));
    console.log('FULL ARBITRAGE SCAN WITH DETAILED LOGGING');
    console.log('='.repeat(100));
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`🔗 Block Number: ${startBlock}`);
    console.log(`💰 Base Token: ${baseTokenSymbol}`);
    console.log(`💵 Loan Amount: ${ethers.formatEther(loanAmount)} ${baseTokenSymbol}`);
    console.log('='.repeat(100));
    console.log();

    // Initialize opportunity finder
    await this.opportunityFinder.initialize();

    // Get pool registry statistics
    const registry = (this.opportunityFinder as any).poolDiscovery.getRegistry();
    const allPools = registry.getAllPools();
    
    const poolsByDEX: Record<string, number> = {};
    allPools.forEach((pool: any) => {
      poolsByDEX[pool.dex] = (poolsByDEX[pool.dex] || 0) + 1;
    });

    console.log('📊 Pool Registry Status:');
    console.log(`   Total Pools: ${allPools.length}`);
    console.log('   Pools by DEX:');
    for (const [dex, count] of Object.entries(poolsByDEX).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${dex}: ${count} pools`);
    }
    console.log();

    // Initialize scan log
    this.currentScanLog = {
      timestamp: new Date().toISOString(),
      blockNumber: startBlock,
      scanDuration: 0,
      baseToken: baseTokenSymbol,
      loanAmount: ethers.formatEther(loanAmount),
      poolsScanned: {
        total: allPools.length,
        byDEX: poolsByDEX
      },
      strategies: [],
      totalOpportunities: 0
    };

    // Run scan with detailed logging
    console.log('🔍 Starting Arbitrage Scan...');
    console.log();

    const opportunities = await this.opportunityFinder.findOpportunities(
      baseTokenSymbol,
      loanAmount,
      false // Don't refresh pools
    );

    const endTime = Date.now();
    const scanDuration = endTime - startTime;

    this.currentScanLog.scanDuration = scanDuration;
    this.currentScanLog.totalOpportunities = opportunities.length;

    // Log opportunities found
    console.log();
    console.log('='.repeat(100));
    console.log('SCAN RESULTS');
    console.log('='.repeat(100));
    console.log(`⏱️  Scan Duration: ${scanDuration}ms (${(scanDuration / 1000).toFixed(2)}s)`);
    console.log(`📊 Opportunities Found: ${opportunities.length}`);
    console.log();

    if (opportunities.length > 0) {
      console.log('💰 Profitable Opportunities:');
      console.log();

      for (let i = 0; i < Math.min(opportunities.length, 10); i++) {
        const opp = opportunities[i];
        console.log(`${i + 1}. Opportunity ID: ${opp.id}`);
        console.log(`   Path: ${opp.path.map(t => `${t.symbol}`).join(' → ')}`);
        console.log(`   DEXs: ${opp.dexes.join(' → ')}`);
        console.log(`   Flash Loan: ${ethers.formatEther(opp.loanAmount)} ${opp.baseToken.symbol}`);
        console.log(`   Expected Profit: ${ethers.formatEther(opp.expectedProfit)} ETH`);
        console.log(`   Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
        console.log(`   USD Value: $${opp.expectedProfitUSD.toFixed(2)}`);
        console.log(`   Flash Fee: ${ethers.formatEther(opp.flashFee)} ETH`);
        console.log(`   Gas Cost: ${ethers.formatEther(opp.gasCost)} ETH`);
        console.log(`   Score: ${opp.score.toFixed(4)}`);
        console.log(`   Entropy: ${opp.entropy.toFixed(4)}`);
        console.log();
      }

      if (opportunities.length > 10) {
        console.log(`... and ${opportunities.length - 10} more opportunities`);
        console.log();
      }
    } else {
      console.log('❌ No profitable opportunities found in this scan.');
      console.log();
    }

    // Save detailed log
    const logFileName = `detailed-scan-${Date.now()}.json`;
    const logFilePath = path.join(this.logDir, logFileName);

    const fullLog = {
      ...this.currentScanLog,
      pathDetails: this.pathDetails,
      opportunities: opportunities.map(opp => ({
        id: opp.id,
        path: opp.path.map(t => ({
          symbol: t.symbol,
          address: t.address,
          decimals: t.decimals
        })),
        dexes: opp.dexes,
        pools: opp.pools.map(p => this.formatAddress(p.address)),
        baseToken: {
          symbol: opp.baseToken.symbol,
          address: opp.baseToken.address
        },
        loanAmount: ethers.formatEther(opp.loanAmount),
        expectedProfit: ethers.formatEther(opp.expectedProfit),
        expectedProfitUSD: opp.expectedProfitUSD,
        flashFee: ethers.formatEther(opp.flashFee),
        gasCost: ethers.formatEther(opp.gasCost),
        netProfit: ethers.formatEther(opp.netProfit),
        score: opp.score,
        entropy: opp.entropy,
        blockNumber: opp.blockNumber,
        timestamp: new Date().toISOString()
      }))
    };

    await fs.writeFile(logFilePath, JSON.stringify(fullLog, null, 2), 'utf-8');

    console.log('='.repeat(100));
    console.log('📄 Detailed log saved to:', logFilePath);
    console.log('='.repeat(100));
    console.log();

    return {
      opportunities,
      scanDuration,
      logFilePath
    };
  }
}

// Run the scan
async function main() {
  const scanner = new DetailedScanner();

  try {
    const result = await scanner.runFullScan('WETH', BigInt('10000000000000000000')); // 10 WETH
    console.log('✅ Scan completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  }
}

main();