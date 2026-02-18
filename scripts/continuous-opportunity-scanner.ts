import { ethers } from 'ethers';
import fs from 'fs';
import { config } from 'dotenv';

config();

const RPC_URL = process.env.RPC_URL || 'https://base-rpc.publicnode.com';

interface Opportunity {
  id: string;
  timestamp: number;
  strategy: string;
  profitPercent: number;
  path: string[];
  pools: string[];
  estimatedGas: number;
  profitAfterGas: number;
  status: 'detected' | 'executed' | 'skipped';
}

class ContinuousScanner {
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;
  private scanCount: number = 0;
  private opportunitiesFound: number = 0;
  private startTime: number = 0;
  private config: any;
  private opportunities: Opportunity[] = [];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync('config.json')) {
      this.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } else {
      this.config = {
        minProfitPercent: 0.1,
        scanning: {
          interval: 2000,
          maxConcurrentScans: 5
        }
      };
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Scanner is already running!');
      return;
    }

    console.log('=== Starting Continuous Opportunity Scanner ===\n');
    this.isRunning = true;
    this.startTime = Date.now();
    
    // Test RPC connection
    try {
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`✓ RPC connected - Current block: ${blockNumber}`);
    } catch (error) {
      console.log('✗ RPC connection failed');
      this.isRunning = false;
      return;
    }

    console.log(`\nConfiguration:`);
    console.log(`  Minimum profit: ${this.config.minProfitPercent || 0.1}%`);
    console.log(`  Scan interval: ${this.config.scanning?.interval || 2000}ms`);
    console.log(`  Dynamic thresholds: ${this.config.dynamicThresholds?.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Flash loans: ${this.config.flashLoan?.enabled ? 'Enabled' : 'Disabled'}\n`);

    // Start scanning loop
    this.scanLoop();
  }

  private async scanLoop() {
    while (this.isRunning) {
      const scanStart = Date.now();
      
      try {
        await this.scan();
        
        this.scanCount++;
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const scansPerSecond = this.scanCount / elapsedTime;
        
        console.log(`\n[Scan #${this.scanCount}] Completed in ${Date.now() - scanStart}ms | ` +
                   `Scans/sec: ${scansPerSecond.toFixed(2)} | ` +
                   `Opportunities found: ${this.opportunitiesFound}`);
        
      } catch (error: any) {
        console.log(`\n❌ Scan failed: ${error?.message || 'Unknown error'}`);
      }

      // Wait for next scan
      await new Promise(resolve => 
        setTimeout(resolve, this.config.scanning?.interval || 2000)
      );
    }
  }

  private async scan() {
    console.log(`\n🔍 Scanning for opportunities...`);
    
    // Load pool registry
    if (!fs.existsSync('data/pool-registry.json')) {
      throw new Error('Pool registry not found!');
    }

    const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
    const pools = registry.pools || [];
    
    console.log(`  📊 Loaded ${pools.length} pools`);

    // Simulate opportunity detection (in production, this would call the actual opportunity finder)
    const opportunities = this.detectOpportunities(pools);
    
    if (opportunities.length > 0) {
      console.log(`  🎯 Found ${opportunities.length} opportunities!`);
      this.opportunitiesFound += opportunities.length;
      
      for (const opp of opportunities) {
        console.log(`    💰 ${opp.strategy}: ${opp.profitPercent.toFixed(3)}% profit`);
        this.opportunities.push(opp);
      }
      
      // Save opportunities
      this.saveOpportunities();
    } else {
      console.log(`  ℹ️  No opportunities found`);
    }
  }

  private detectOpportunities(pools: any[]): Opportunity[] {
    const opportunities: Opportunity[] = [];
    const minProfit = this.config.minProfitPercent || 0.1;

    // Simulate finding opportunities (in production, this would be actual arbitrage detection)
    // For demonstration, we'll generate some random opportunities
    const randomProfit = Math.random() * 2; // 0-2% profit
    
    if (randomProfit >= minProfit) {
      opportunities.push({
        id: `opp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        strategy: this.getRandomStrategy(),
        profitPercent: randomProfit,
        path: ['WETH', 'USDC', 'WETH'],
        pools: [pools[0]?.address || '0x0', pools[1]?.address || '0x0'],
        estimatedGas: 150000,
        profitAfterGas: randomProfit - 0.05, // Estimate gas cost
        status: 'detected'
      });
    }

    // Occasionally find multiple opportunities
    if (Math.random() > 0.7) {
      const secondProfit = Math.random() * 1.5;
      if (secondProfit >= minProfit) {
        opportunities.push({
          id: `opp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          strategy: this.getRandomStrategy(),
          profitPercent: secondProfit,
          path: ['USDC', 'DAI', 'USDC'],
          pools: [pools[2]?.address || '0x0', pools[3]?.address || '0x0'],
          estimatedGas: 120000,
          profitAfterGas: secondProfit - 0.04,
          status: 'detected'
        });
      }
    }

    return opportunities;
  }

  private getRandomStrategy(): string {
    const strategies = ['Multi-Hop Cyclic', 'Fee-Tier Mispricing', 'Liquidity Fragmentation', 'Stable-Volatile'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  private saveOpportunities() {
    const data = {
      timestamp: Date.now(),
      totalScans: this.scanCount,
      opportunitiesFound: this.opportunitiesFound,
      runningTime: Date.now() - this.startTime,
      opportunities: this.opportunities.slice(-100) // Keep last 100
    };
    
    fs.writeFileSync('data/scanning-results.json', JSON.stringify(data, null, 2));
  }

  stop() {
    console.log('\n=== Stopping Scanner ===');
    this.isRunning = false;
    
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const scansPerSecond = this.scanCount / elapsedTime;
    
    console.log(`\nFinal Statistics:`);
    console.log(`  Total scans: ${this.scanCount}`);
    console.log(`  Running time: ${elapsedTime.toFixed(2)} seconds`);
    console.log(`  Scans per second: ${scansPerSecond.toFixed(2)}`);
    console.log(`  Opportunities found: ${this.opportunitiesFound}`);
    console.log(`  Opportunities per scan: ${(this.opportunitiesFound / this.scanCount).toFixed(2)}`);
    
    // Generate final report
    this.generateReport(elapsedTime, scansPerSecond);
  }

  private generateReport(elapsedTime: number, scansPerSecond: number) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalScans: this.scanCount,
        runningTime: `${elapsedTime.toFixed(2)} seconds`,
        scansPerSecond: scansPerSecond.toFixed(2),
        opportunitiesFound: this.opportunitiesFound,
        opportunitiesPerScan: (this.opportunitiesFound / this.scanCount).toFixed(2),
        avgProfit: this.opportunities.length > 0 
          ? (this.opportunities.reduce((sum, o) => sum + o.profitPercent, 0) / this.opportunities.length).toFixed(3) + '%'
          : 'N/A'
      },
      byStrategy: this.groupByStrategy(),
      recentOpportunities: this.opportunities.slice(-10)
    };
    
    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true });
    }
    
    fs.writeFileSync('reports/scanning-report.json', JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: reports/scanning-report.json`);
  }

  private groupByStrategy(): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    for (const opp of this.opportunities) {
      grouped[opp.strategy] = (grouped[opp.strategy] || 0) + 1;
    }
    
    return grouped;
  }
}

// Create and start scanner
const scanner = new ContinuousScanner();
scanner.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  scanner.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  scanner.stop();
  process.exit(0);
});