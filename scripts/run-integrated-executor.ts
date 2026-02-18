import { ethers } from 'ethers';
import { config } from 'dotenv';
import * as fs from 'fs';
import { FlashLoanExecutor } from '../src/execution/FlashLoanExecutor.js';
import { PRIVATE_RPC_NODES } from '../src/config/constants.js';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder.js';
import { PoolRegistryManager } from '../src/pools/registry.js';

config();

// Configuration
const RPC_URL = process.env.RPC_URL || process.env.BASE_RPC_URL || PRIVATE_RPC_NODES[0];
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const FLASH_LOAN_CONTRACT = process.env.FLASH_LOAN_CONTRACT || '';

class IntegratedExecutor {
  private executor: FlashLoanExecutor;
  private opportunityFinder: OpportunityFinder;
  private poolRegistry: PoolRegistryManager;
  private isRunning: boolean = false;
  private scanCount: number = 0;
  private executionsPerformed: number = 0;
  private successfulExecutions: number = 0;
  private failedExecutions: number = 0;
  private skippedExecutions: number = 0;
  private startTime: number = 0;
  private totalProfit: number = 0;
  private config: any;

  constructor() {
    if (!PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not set in environment variables!');
    }
    
    if (!FLASH_LOAN_CONTRACT) {
      throw new Error('FLASH_LOAN_CONTRACT not set in environment variables!');
    }

    // Use private RPC by default
    const executionRPC = process.env.QUICKNODE_RPC || RPC_URL;
    console.log(`🔗 Using RPC: ${executionRPC}`);

    this.executor = new FlashLoanExecutor(
      PRIVATE_KEY,
      FLASH_LOAN_CONTRACT,
      executionRPC
    );

    this.poolRegistry = new PoolRegistryManager();
    this.opportunityFinder = new OpportunityFinder(this.poolRegistry);

    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync('config.json')) {
      this.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } else {
      this.config = {
        minProfitPercent: 0.1,
        maxGasPrice: 50000000000,
        minProfitAfterGas: 0.3,
        executionEnabled: true,
        scanning: {
          interval: 2000
        }
      };
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Executor is already running!');
      return;
    }

    console.log('=== Starting Integrated Flash Loan Executor ===\n');

    // Test RPC connection
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const blockNumber = await provider.getBlockNumber();
      console.log(`✓ RPC connected - Current block: ${blockNumber}`);
    } catch (error) {
      console.log('✗ RPC connection failed');
      return;
    }

    // Load pool registry
    try {
      await this.poolRegistry.load();
      const pools = this.poolRegistry.getAllPools();
      console.log(`✓ Loaded ${pools.size} pools from registry`);
    } catch (error) {
      console.log('✗ Failed to load pool registry');
      return;
    }

    // Check contract balance
    try {
      const balances = await this.executor.getFlashLoanContractBalance();
      console.log(`\nFlash Loan Contract Balances:`);
      console.log(`  ETH: ${balances.ETH}`);
      console.log(`  USDC: ${balances.USDC}`);
    } catch (error) {
      console.log(`⚠️  Could not fetch contract balances`);
    }

    // Check wallet balance
    try {
      const balances = await this.executor.getContractBalance();
      console.log(`\nWallet Balances (for gas):`);
      console.log(`  ETH: ${balances.ETH} (needed for transaction gas)`);
    } catch (error) {
      console.log(`⚠️  Could not fetch wallet balances`);
    }

    console.log(`\nConfiguration:`);
    console.log(`  Minimum profit: ${this.config.minProfitPercent || 0.1}%`);
    console.log(`  Minimum profit after gas: ${this.config.minProfitAfterGas || 0.3}%`);
    console.log(`  Max gas price: ${ethers.formatUnits(this.config.maxGasPrice || 50000000000, 'gwei')} gwei`);
    console.log(`  Execution enabled: ${this.config.executionEnabled !== false}`);
    console.log(`  Scan interval: ${this.config.scanning?.interval || 2000}ms\n`);

    if (!this.config.executionEnabled) {
      console.log('⚠️  WARNING: Execution is disabled in config.json!');
      console.log('   Set "executionEnabled": true to enable actual execution.\n');
    }

    this.isRunning = true;
    this.startTime = Date.now();

    console.log('🚀 Starting integrated scanning and execution...\n');

    // Start execution loop
    this.executionLoop();
  }

  private async executionLoop() {
    while (this.isRunning) {
      try {
        await this.scanAndExecute();

        this.scanCount++;
        const elapsedTime = (Date.now() - this.startTime) / 1000;

        this.printStats();

      } catch (error: any) {
        console.log(`\n❌ Execution loop error: ${error?.message || 'Unknown error'}`);
      }

      // Wait for next scan
      await new Promise(resolve => 
        setTimeout(resolve, this.config.scanning?.interval || 2000)
      );
    }
  }

  private async scanAndExecute() {
    console.log(`\n🔍 Scanning for opportunities (Scan #${this.scanCount + 1})...`);

    try {
      // Find opportunities
      const opportunities = await this.opportunityFinder.findOpportunities();
      
      console.log(`  📊 Found ${opportunities.length} opportunities`);

      if (opportunities.length === 0) {
        console.log(`  ℹ️  No opportunities detected`);
        return;
      }

      // Filter for profitable opportunities
      const minProfitAfterGas = this.config.minProfitAfterGas || 0.3;
      const profitableOpps = opportunities.filter(opp => {
        return opp.profitPercent >= minProfitAfterGas;
      });

      if (profitableOpps.length === 0) {
        console.log(`  ℹ️  No opportunities meet profit threshold (${minProfitAfterGas}% after gas)`);
        return;
      }

      console.log(`  🎯 ${profitableOpps.length} opportunities meet profit threshold`);

      // Display opportunities
      profitableOpps.slice(0, 5).forEach(opp => {
        console.log(`    💰 ${opp.strategy}: ${opp.profitPercent.toFixed(3)}% profit`);
      });

      // Get current gas price
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);
      const gasPriceGwei = Number(ethers.formatUnits(gasPrice, 'gwei'));

      console.log(`  ⛽ Current gas price: ${gasPriceGwei.toFixed(2)} gwei`);

      const maxGasPrice = BigInt(this.config.maxGasPrice || 50000000000);
      if (gasPrice > maxGasPrice) {
        console.log(`  ⚠️  Gas price too high (${gasPriceGwei.toFixed(2)} > ${ethers.formatUnits(maxGasPrice, 'gwei')} gwei). Skipping execution.`);
        this.skippedExecutions += profitableOpps.length;
        return;
      }

      // Execute the most profitable opportunity
      const bestOpportunity = profitableOpps.sort((a, b) => 
        b.profitPercent - a.profitPercent
      )[0];

      console.log(`  💎 Best opportunity: ${bestOpportunity.strategy} (${bestOpportunity.profitPercent.toFixed(4)}% profit)`);

      if (!this.config.executionEnabled) {
        console.log(`  ⏸️  Execution disabled (dry run mode)`);
        this.skippedExecutions++;
        return;
      }

      // Execute the opportunity
      console.log(`  🔄 Executing opportunity...`);
      const success = await this.executor.executeOpportunity(bestOpportunity);

      this.executionsPerformed++;

      if (success) {
        this.successfulExecutions++;
        this.totalProfit += bestOpportunity.profitPercent;
        console.log(`  ✅ Execution successful!`);
      } else {
        this.failedExecutions++;
        console.log(`  ❌ Execution failed`);
      }

    } catch (error: any) {
      console.log(`  ❌ Scan error: ${error.message}`);
    }
  }

  private printStats() {
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const avgProfit = this.successfulExecutions > 0 
      ? this.totalProfit / this.successfulExecutions 
      : 0;

    console.log(`\n[Scan #${this.scanCount}]`);
    console.log(`  Running time: ${elapsedTime.toFixed(1)}s`);
    console.log(`  Executions: ${this.executionsPerformed}`);
    console.log(`  Successful: ${this.successfulExecutions} (${avgProfit.toFixed(3)}% avg profit)`);
    console.log(`  Failed: ${this.failedExecutions}`);
    console.log(`  Skipped: ${this.skippedExecutions}`);
    console.log(`  Total profit: ${this.totalProfit.toFixed(3)}%`);
  }

  stop() {
    console.log('\n=== Stopping Integrated Executor ===');
    this.isRunning = false;

    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const avgProfit = this.successfulExecutions > 0 
      ? this.totalProfit / this.successfulExecutions 
      : 0;

    console.log(`\nFinal Statistics:`);
    console.log(`  Total scans: ${this.scanCount}`);
    console.log(`  Total executions: ${this.executionsPerformed}`);
    console.log(`  Running time: ${elapsedTime.toFixed(1)} seconds`);
    console.log(`  Successful executions: ${this.successfulExecutions}`);
    console.log(`  Failed executions: ${this.failedExecutions}`);
    console.log(`  Skipped executions: ${this.skippedExecutions}`);
    console.log(`  Average profit: ${avgProfit.toFixed(3)}%`);
    console.log(`  Total profit: ${this.totalProfit.toFixed(3)}%`);

    // Generate final report
    this.generateReport(elapsedTime, avgProfit);

    // Show execution history
    const history = this.executor.getExecutionHistory();
    if (history.length > 0) {
      console.log(`\nExecution History (last 10):`);
      history.slice(-10).forEach(record => {
        console.log(`  ${record.opportunityId}: ${record.status} - ${record.profitPercent.toFixed(3)}% profit`);
      });
    }
  }

  private generateReport(elapsedTime: number, avgProfit: number) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalScans: this.scanCount,
        totalExecutions: this.executionsPerformed,
        runningTime: `${elapsedTime.toFixed(1)} seconds`,
        successfulExecutions: this.successfulExecutions,
        failedExecutions: this.failedExecutions,
        skippedExecutions: this.skippedExecutions,
        successRate: this.executionsPerformed > 0 
          ? `${((this.successfulExecutions / this.executionsPerformed) * 100).toFixed(1)}%`
          : '0%',
        averageProfit: `${avgProfit.toFixed(3)}%`,
        totalProfit: `${this.totalProfit.toFixed(3)}%`
      },
      executionHistory: this.executor.getExecutionHistory()
    };

    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true });
    }

    fs.writeFileSync('reports/integrated-execution-report.json', JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: reports/integrated-execution-report.json`);
  }
}

// Create and start executor
const executor = new IntegratedExecutor();
executor.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  executor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  executor.stop();
  process.exit(0);
});