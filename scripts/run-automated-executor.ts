import { ethers } from 'ethers';
import { config } from 'dotenv';
import * as fs from 'fs';
import { FlashLoanExecutor } from '../src/execution/FlashLoanExecutor.js';
import { PRIVATE_RPC_NODES } from '../src/config/constants.js';

config();

// Configuration
const RPC_URL = process.env.RPC_URL || PRIVATE_RPC_NODES[0];
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const FLASH_LOAN_CONTRACT = process.env.FLASH_LOAN_CONTRACT || '';

interface Opportunity {
  id: string;
  timestamp: number;
  strategy: string;
  profitPercent: number;
  path: string[];
  pools: string[];
  estimatedGas: number;
  profitAfterGas: number;
  status: 'detected' | 'executed' | 'skipped' | 'failed';
}

class AutomatedExecutor {
  private executor: FlashLoanExecutor;
  private isRunning: boolean = false;
  private scanCount: number = 0;
  private executionsPerformed: number = 0;
  private successfulExecutions: number = 0;
  private failedExecutions: number = 0;
  private skippedExecutions: number = 0;
  private startTime: number = 0;
  private totalProfit: number = 0;
  private totalGasCost: number = 0;
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

    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync('config.json')) {
      this.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } else {
      this.config = {
        minProfitPercent: 0.1,
        maxGasPrice: 50000000000, // 50 gwei
        minProfitAfterGas: 0.3,
        executionEnabled: true
      };
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Executor is already running!');
      return;
    }

    console.log('=== Starting Automated Flash Loan Executor ===\n');

    // Test RPC connection
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const blockNumber = await provider.getBlockNumber();
      console.log(`✓ RPC connected - Current block: ${blockNumber}`);
    } catch (error) {
      console.log('✗ RPC connection failed');
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
    console.log(`  Execution enabled: ${this.config.executionEnabled !== false}\n`);

    if (!this.config.executionEnabled) {
      console.log('⚠️  WARNING: Execution is disabled in config.json!');
      console.log('   Set "executionEnabled": true to enable actual execution.\n');
    }

    this.isRunning = true;
    this.startTime = Date.now();

    console.log('🚀 Starting automated execution...\n');

    // Start execution loop
    this.executionLoop();
  }

  private async executionLoop() {
    while (this.isRunning) {
      const loopStart = Date.now();

      try {
        await this.checkAndExecuteOpportunities();

        this.scanCount++;
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const executionsPerSecond = this.executionsPerformed / elapsedTime;

        this.printStats(executionsPerSecond);

      } catch (error: any) {
        console.log(`\n❌ Execution loop error: ${error?.message || 'Unknown error'}`);
      }

      // Wait for next check
      await new Promise(resolve => 
        setTimeout(resolve, this.config.scanning?.interval || 2000)
      );
    }
  }

  private async checkAndExecuteOpportunities() {
    console.log(`\n🔍 Checking for opportunities...`);

    // Load opportunities from scanner results
    if (!fs.existsSync('data/scanning-results.json')) {
      console.log(`  ℹ️  No scanning results found`);
      return;
    }

    const scannerResults = JSON.parse(
      fs.readFileSync('data/scanning-results.json', 'utf8')
    );

    const opportunities = scannerResults.opportunities || [];

    if (opportunities.length === 0) {
      console.log(`  ℹ️  No opportunities detected`);
      return;
    }

    console.log(`  📊 Found ${opportunities.length} opportunities`);

    // Filter for profitable opportunities
    const minProfitAfterGas = this.config.minProfitAfterGas || 0.3;
    const profitableOpps = opportunities.filter((opp: Opportunity) => {
      return opp.profitAfterGas >= minProfitAfterGas &&
             opp.status === 'detected';
    });

    if (profitableOpps.length === 0) {
      console.log(`  ℹ️  No opportunities meet profit threshold (${minProfitAfterGas}% after gas)`);
      return;
    }

    console.log(`  🎯 ${profitableOpps.length} opportunities meet profit threshold`);

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
    const bestOpportunity = profitableOpps.sort((a: Opportunity, b: Opportunity) => 
      b.profitAfterGas - a.profitAfterGas
    )[0];

    console.log(`  💎 Best opportunity: ${bestOpportunity.strategy} (${bestOpportunity.profitAfterGas.toFixed(4)}% profit)`);

    // Execute the opportunity
    const success = await this.executor.executeOpportunity(bestOpportunity);

    this.executionsPerformed++;

    if (success) {
      this.successfulExecutions++;
      this.totalProfit += bestOpportunity.profitAfterGas;
      console.log(`  ✅ Execution successful!`);
    } else {
      if (bestOpportunity.status === 'skipped') {
        this.skippedExecutions++;
        console.log(`  ⏭️  Execution skipped`);
      } else {
        this.failedExecutions++;
        console.log(`  ❌ Execution failed`);
      }
    }

    // Mark opportunity as processed
    if (success) {
      bestOpportunity.status = 'executed';
    } else if (bestOpportunity.status === 'skipped') {
      bestOpportunity.status = 'skipped';
    } else {
      bestOpportunity.status = 'failed';
    }
  }

  private printStats(executionsPerSecond: number) {
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const avgProfit = this.successfulExecutions > 0 
      ? this.totalProfit / this.successfulExecutions 
      : 0;

    console.log(`\n[Execution #${this.executionsPerformed}]`);
    console.log(`  Running time: ${elapsedTime.toFixed(1)}s`);
    console.log(`  Executions: ${this.executionsPerformed}`);
    console.log(`  Successful: ${this.successfulExecutions} (${avgProfit.toFixed(3)}% avg profit)`);
    console.log(`  Failed: ${this.failedExecutions}`);
    console.log(`  Skipped: ${this.skippedExecutions}`);
    console.log(`  Total profit: ${this.totalProfit.toFixed(3)}%`);
  }

  stop() {
    console.log('\n=== Stopping Automated Executor ===');
    this.isRunning = false;

    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const avgProfit = this.successfulExecutions > 0 
      ? this.totalProfit / this.successfulExecutions 
      : 0;

    console.log(`\nFinal Statistics:`);
    console.log(`  Total executions: ${this.executionsPerformed}`);
    console.log(`  Running time: ${elapsedTime.toFixed(1)} seconds`);
    console.log(`  Successful executions: ${this.successfulExecutions}`);
    console.log(`  Failed executions: ${this.failedExecutions}`);
    console.log(`  Skipped executions: ${this.skippedExecutions}`);
    console.log(`  Average profit: ${avgProfit.toFixed(3)}%`);
    console.log(`  Total profit: ${this.totalProfit.toFixed(3)}%`);
    console.log(`  Executions per second: ${(this.executionsPerformed / elapsedTime).toFixed(2)}`);

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
        totalExecutions: this.executionsPerformed,
        runningTime: `${elapsedTime.toFixed(1)} seconds`,
        successfulExecutions: this.successfulExecutions,
        failedExecutions: this.failedExecutions,
        skippedExecutions: this.skippedExecutions,
        successRate: this.executionsPerformed > 0 
          ? `${((this.successfulExecutions / this.executionsPerformed) * 100).toFixed(1)}%`
          : '0%',
        averageProfit: `${avgProfit.toFixed(3)}%`,
        totalProfit: `${this.totalProfit.toFixed(3)}%`,
        executionsPerSecond: (this.executionsPerformed / elapsedTime).toFixed(2)
      },
      executionHistory: this.executor.getExecutionHistory()
    };

    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true });
    }

    fs.writeFileSync('reports/automated-execution-report.json', JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: reports/automated-execution-report.json`);
  }
}

// Create and start executor
const executor = new AutomatedExecutor();
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