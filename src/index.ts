import { ethers } from 'ethers';
import { config } from './config';
import { OpportunityFinder } from './opportunity/opportunityFinder';
import { ArbitrageExecutor } from './execution/executor';
import { BacktestEngine } from './replay/backtest';
import { rpcManager } from './utils/rpcManager';

/**
 * Main Bot Entry Point
 * 
 * This is the production-ready arbitrage bot that:
 * 1. Monitors Base chain for arbitrage opportunities
 * 2. Executes profitable arbitrages using Aave V3 flash loans
 * 3. Implements MEV protection and gas optimization
 * 4. Tracks profits and performance
 */
class ArbitrageBot {
  private provider: ethers.JsonRpcProvider;
  private opportunityFinder: OpportunityFinder;
  private executor: ArbitrageExecutor | null = null;
  private isRunning: boolean = false;

  constructor() {
    // Validate configuration
    config.validate();

    // Initialize provider using RPCManager for scanning
    this.provider = config.getScanningProvider();

    // Initialize opportunity finder
    this.opportunityFinder = new OpportunityFinder(this.provider);

    // Initialize executor if contract address is provided
    // Note: Executor will use its own execution provider
    if (config.flashLoanReceiver) {
      this.executor = new ArbitrageExecutor(
        config.getExecutionProvider(), // Use execution provider for transactions
        config.privateKey,
        config.flashLoanReceiver
      );
    }

    console.log('=== Base Chain Aave V3 Flash Loan Arbitrage Bot ===');
    console.log('Initialized successfully');
    console.log('✅ Multi-RPC system active');
  }

  /**
   * Run the bot in continuous mode
   */
  async runContinuous(): Promise<void> {
    if (!this.executor) {
      throw new Error('Executor not initialized. Set FLASH_LOAN_RECEIVER in .env');
    }

    this.isRunning = true;
    console.log('\n=== Starting Continuous Mode ===');
    console.log('Monitoring blocks for arbitrage opportunities...');
    console.log('Press Ctrl+C to stop\n');

    // Set up block listener
    this.provider.on('block', async (blockNumber) => {
      if (!this.isRunning) return;

      try {
        console.log(`\n[${new Date().toISOString()}] Block ${blockNumber}`);

        // Find opportunities
        const opportunities = await this.opportunityFinder.findOpportunities(
          'WETH',
          BigInt('10000000000000000000') // 10 ETH
        );

        // Execute best opportunity
        if (opportunities.length > 0) {
          console.log(`Found ${opportunities.length} opportunity(ies)`);
          console.log(`Best opportunity: $${opportunities[0].expectedProfitUSD.toFixed(4)} profit`);

          // Validate before execution
          const isValid = await this.opportunityFinder.validateOpportunity(opportunities[0]);
          
          if (isValid) {
            console.log('Executing best opportunity...');
            const result = await this.executor!.executeOpportunity(opportunities[0]);

            if (result.success) {
              console.log(`✓ Arbitrage successful! Profit: ${ethers.formatEther(result.profit || 0n)} ETH`);
              console.log(`Transaction: ${result.txHash}`);
            } else {
              console.log(`✗ Arbitrage failed: ${result.error}`);
            }
          } else {
            console.log('Opportunity validation failed, skipping');
          }
        } else {
          console.log('No profitable opportunities found');
        }
      } catch (error) {
        console.error('Error processing block:', error);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nShutting down...');
      this.isRunning = false;
      this.provider.removeAllListeners();
      process.exit(0);
    });
  }

  /**
   * Run a single scan (one-time execution)
   */
  async runSingleScan(): Promise<void> {
    console.log('\n=== Running Single Scan ===');

    const opportunities = await this.opportunityFinder.findOpportunities(
      'WETH',
      BigInt('10000000000000000000') // 10 ETH
    );

    if (opportunities.length === 0) {
      console.log('No profitable opportunities found');
      return;
    }

    console.log(`\nFound ${opportunities.length} profitable opportunity(ies):`);

    for (let i = 0; i < Math.min(opportunities.length, 5); i++) {
      const opp = opportunities[i];
      console.log(`\n[${i + 1}] ${opp.id}`);
      console.log(`    Profit: $${opp.expectedProfitUSD.toFixed(4)}`);
      console.log(`    Score: ${opp.score.toFixed(4)}`);
      console.log(`    Path: ${opp.path.map(t => t.symbol).join(' → ')}`);
      console.log(`    DEXs: ${opp.dexes.join(' → ')}`);
    }

    // Execute if executor is available
    if (this.executor && opportunities.length > 0) {
      const isValid = await this.opportunityFinder.validateOpportunity(opportunities[0]);
      
      if (isValid) {
        console.log('\nExecuting best opportunity...');
        const result = await this.executor.executeOpportunity(opportunities[0]);

        if (result.success) {
          console.log(`✓ Arbitrage successful! Profit: ${ethers.formatEther(result.profit || 0n)} ETH`);
          console.log(`Transaction: ${result.txHash}`);
        } else {
          console.log(`✗ Arbitrage failed: ${result.error}`);
        }
      } else {
        console.log('Opportunity validation failed, skipping execution');
      }
    }
  }

  /**
   * Run backtest on historical blocks
   */
  async runBacktest(startBlock: number, endBlock: number): Promise<void> {
    if (!this.executor) {
      throw new Error('Executor not initialized. Set FLASH_LOAN_RECEIVER in .env');
    }

    console.log('\n=== Running Backtest ===');
    
    const backtestEngine = new BacktestEngine(this.provider, this.executor);
    const results = await backtestEngine.runBacktest(startBlock, endBlock);

    await backtestEngine.saveResults();

    const stats = backtestEngine.getStatistics();
    console.log('\n=== Backtest Statistics ===');
    console.log(`Total Blocks: ${stats.totalBlocks}`);
    console.log(`Total Opportunities: ${stats.totalOpportunities}`);
    console.log(`Total Successful: ${stats.totalSuccessful}`);
    console.log(`Total Net Profit: ${ethers.formatEther(stats.totalNetProfit)} ETH`);
    console.log(`Average Profit per Arbitrage: ${ethers.formatEther(stats.averageProfitPerArbitrage)} ETH`);
    console.log(`Success Rate: ${(stats.overallSuccessRate * 100).toFixed(2)}%`);
  }

  /**
   * Get bot status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    providerConnected: boolean;
    executorConfigured: boolean;
    blockNumber: number;
  }> {
    const blockNumber = await this.provider.getBlockNumber();

    return {
      isRunning: this.isRunning,
      providerConnected: true,
      executorConfigured: this.executor !== null,
      blockNumber,
    };
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const bot = new ArbitrageBot();

  switch (command) {
    case 'continuous':
    case 'run':
      await bot.runContinuous();
      break;

    case 'scan':
    case 'once':
      await bot.runSingleScan();
      process.exit(0);
      break;

    case 'backtest':
      if (args.length < 3) {
        console.error('Usage: npm run backtest <startBlock> <endBlock>');
        process.exit(1);
      }
      const startBlock = parseInt(args[1]);
      const endBlock = parseInt(args[2]);
      await bot.runBacktest(startBlock, endBlock);
      process.exit(0);

    case 'status':
      const status = await bot.getStatus();
      console.log('Bot Status:', JSON.stringify(status, null, 2));
      
      // Display RPC statistics
      const rpcStats = rpcManager.getStatistics();
      console.log('\n📊 RPC Statistics:');
      console.log('\n🔍 Scanning Nodes:');
      rpcStats.scanning.forEach((node, i) => {
        const healthIcon = node.isHealthy ? '✅' : '❌';
        console.log(`  ${i + 1}. ${healthIcon} ${node.url}`);
        console.log(`     Avg Response: ${node.avgResponseTime}ms | Requests: ${node.requestCount}`);
      });
      
      console.log('\n⚡ Execution Nodes:');
      rpcStats.execution.forEach((node, i) => {
        const healthIcon = node.isHealthy ? '✅' : '❌';
        console.log(`  ${i + 1}. ${healthIcon} ${node.url}`);
        console.log(`     Avg Response: ${node.avgResponseTime}ms | Requests: ${node.requestCount}`);
      });
      
      process.exit(0);

    default:
      console.log('Usage:');
      console.log('  npm run continuous  - Run bot in continuous mode');
      console.log('  npm run scan        - Run single scan');
      console.log('  npm run backtest <start> <end>  - Run backtest');
      console.log('  npm run status       - Get bot status');
      process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { ArbitrageBot };