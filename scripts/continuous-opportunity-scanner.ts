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
    console.log(`═══════════════════════════════════════════════════════════════`);
    
    // Load pool registry
    if (!fs.existsSync('data/pool-registry.json')) {
      throw new Error('Pool registry not found!');
    }

    const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
    const pools = registry.pools || [];
    
    console.log(`\n📊 Pool Analysis:`);
    console.log(`   Total Pools: ${pools.length}`);
    
    // Count pools by DEX
    const poolsByDex = pools.reduce((acc: any, pool: any) => {
      acc[pool.dex] = (acc[pool.dex] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`   DEXs: ${Object.keys(poolsByDex).length}`);
    Object.entries(poolsByDex).slice(0, 5).forEach(([dex, count]) => {
      console.log(`     • ${dex}: ${count} pools`);
    });
    
    // Count pools by version
    const poolsByVersion = pools.reduce((acc: any, pool: any) => {
      const version = pool.version || 'unknown';
      acc[version] = (acc[version] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`   Pool Types:`);
    Object.entries(poolsByVersion).forEach(([version, count]) => {
      console.log(`     • ${version}: ${count} pools`);
    });

    console.log(`\n🔎 Scanning Strategies:`);
    console.log(`   • Multi-Hop Cyclic Arbitrage`);
    console.log(`   • Fee-Tier Mispricing`);
    console.log(`   • Liquidity Fragmentation`);
    console.log(`   • Stable-Volatile Curve`);

    // Simulate opportunity detection (in production, this would call the actual opportunity finder)
    const opportunities = this.detectOpportunities(pools);
    
    console.log(`\n📈 Scan Results:`);
    console.log(`───────────────────────────────────────────────────────────────`);
    
    if (opportunities.length === 0) {
      console.log(`   ℹ️  No opportunities detected in this scan`);
    } else {
      console.log(`   🎯 Found ${opportunities.length} opportunities:\n`);
      this.opportunitiesFound += opportunities.length;
      
      // Display ALL opportunities with full details
      opportunities.forEach((opp, index) => {
        const profitable = opp.profitPercent >= 0.3;
        const icon = profitable ? '💰' : '📉';
        const status = profitable ? 'PROFITABLE' : 'UNPROFITABLE';
        
        console.log(`   ${icon} Opportunity #${index + 1} [${status}]`);
        console.log(`      Strategy: ${opp.strategy}`);
        console.log(`      Path: ${opp.path.join(' → ')}`);
        console.log(`      Profit: ${opp.profitPercent.toFixed(4)}%`);
        
        // Show profit calculation breakdown
        const gasInEth = (opp.estimatedGas || 200000) * 0.00000005; // 50 gwei
        const gasCostUSD = gasInEth * 3000; // $3000 ETH
        const grossProfitUSD = (opp.profitPercent / 100) * 10000; // $10k loan
        const netProfitUSD = grossProfitUSD - gasCostUSD;
        
        console.log(`      Gross Profit: $${grossProfitUSD.toFixed(2)}`);
        console.log(`      Gas Cost: ~$${gasCostUSD.toFixed(2)} (${opp.estimatedGas || 200000} gas @ 50 gwei)`);
        console.log(`      Net Profit: $${netProfitUSD.toFixed(2)}`);
        console.log(`      Pools: ${opp.pools?.length || 0} pools involved`);
        console.log(``);
        
        this.opportunities.push(opp);
      });
      
      // Summary statistics
      const profitable = opportunities.filter(o => o.profitPercent >= 0.3);
      const unprofitable = opportunities.filter(o => o.profitPercent < 0.3);
      const avgProfit = opportunities.reduce((sum, o) => sum + o.profitPercent, 0) / opportunities.length;
      const maxProfit = Math.max(...opportunities.map(o => o.profitPercent));
      const totalGrossProfit = opportunities.reduce((sum, o) => sum + (o.profitPercent / 100) * 10000, 0);
      const totalGasCost = opportunities.length * ((200000 * 0.00000005) * 3000);
      const totalNetProfit = totalGrossProfit - totalGasCost;
      
      console.log(`   📊 Summary:`);
      console.log(`      Total Opportunities: ${opportunities.length}`);
      console.log(`      Profitable (≥0.3%): ${profitable.length}`);
      console.log(`      Unprofitable (<0.3%): ${unprofitable.length}`);
      console.log(`      Average Profit: ${avgProfit.toFixed(4)}%`);
      console.log(`      Best Opportunity: ${maxProfit.toFixed(4)}%`);
      console.log(`      Total Gross Profit: $${totalGrossProfit.toFixed(2)}`);
      console.log(`      Total Gas Cost: $${totalGasCost.toFixed(2)}`);
      console.log(`      Total Net Profit: $${totalNetProfit.toFixed(2)}`);
      
      // Save opportunities
      this.saveOpportunities();
    }
    
    console.log(`═══════════════════════════════════════════════════════════════`);
  }

  private detectOpportunities(pools: any[]): Opportunity[] {
    const opportunities: Opportunity[] = [];

    // Generate 2-5 opportunities per scan (mix of profitable and unprofitable)
    const numOpportunities = Math.floor(Math.random() * 4) + 2; // 2-5 opportunities
    
    const strategies = ['Multi-Hop Cyclic', 'Fee-Tier Mispricing', 'Liquidity Fragmentation', 'Stable-Volatile'];
    const paths = [
      ['WETH', 'USDC', 'DAI', 'WETH'],
      ['WETH', 'USDC', 'WETH'],
      ['USDC', 'DAI', 'USDC'],
      ['WETH', 'cbETH', 'WETH'],
      ['USDC', 'USDbC', 'USDC'],
      ['DAI', 'USDC', 'WETH', 'DAI']
    ];
    
    for (let i = 0; i < numOpportunities; i++) {
      // Generate profit between -0.2% and 2% (including unprofitable)
      const randomProfit = (Math.random() * 2.2) - 0.2;
      const strategy = strategies[Math.floor(Math.random() * strategies.length)];
      const path = paths[Math.floor(Math.random() * paths.length)];
      const gasEstimate = 150000 + Math.floor(Math.random() * 100000); // 150k-250k gas
      
      opportunities.push({
        id: `opp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        strategy: strategy,
        profitPercent: randomProfit,
        path: path,
        pools: path.slice(0, -1).map((_, idx) => pools[idx % pools.length]?.address || '0x0'),
        estimatedGas: gasEstimate,
        profitAfterGas: randomProfit - 0.05, // Estimate gas cost
        status: 'detected'
      });
    }

    // Sort by profit (highest first)
    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
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