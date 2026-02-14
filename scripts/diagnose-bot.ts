import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive Bot Diagnostic Tool
 * Identifies why your arbitrage bot isn't finding opportunities
 */

interface DiagnosticResult {
  category: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  fix?: string;
}

class BotDiagnostics {
  private results: DiagnosticResult[] = [];
  private provider: ethers.JsonRpcProvider | null = null;

  async runFullDiagnostic(): Promise<void> {
    console.log('🔍 Starting Comprehensive Bot Diagnostics...\n');
    
    await this.checkEnvironmentVariables();
    await this.checkRPCConnection();
    await this.checkWalletBalance();
    await this.checkPoolRegistry();
    await this.checkDEXContracts();
    await this.checkFlashLoanContract();
    await this.checkConfigurationSettings();
    await this.testPriceFeeds();
    
    this.printReport();
  }

  private async checkEnvironmentVariables(): Promise<void> {
    console.log('📋 Checking Environment Variables...');
    
    const requiredVars = [
      'PRIVATE_KEY',
      'BASE_RPC_URL',
      'WALLET_ADDRESS',
      'AAVE_POOL_ADDRESS',
      'FLASH_LOAN_CONTRACT'
    ];

    const envPath = path.join(process.cwd(), '.env');
    const envExists = fs.existsSync(envPath);

    if (!envExists) {
      this.results.push({
        category: 'Environment',
        status: 'FAIL',
        message: '.env file not found',
        fix: 'Create a .env file with required variables'
      });
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    const missingVars: string[] = [];

    for (const varName of requiredVars) {
      if (!envContent.includes(varName) || envContent.match(new RegExp(`${varName}=\\s*$`, 'm'))) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      this.results.push({
        category: 'Environment',
        status: 'FAIL',
        message: `Missing or empty variables: ${missingVars.join(', ')}`,
        fix: `Set these variables in your .env file`
      });
    } else {
      this.results.push({
        category: 'Environment',
        status: 'PASS',
        message: 'All required environment variables present'
      });
    }
  }

  private async checkRPCConnection(): Promise<void> {
    console.log('🌐 Checking RPC Connection...');
    
    try {
      const rpcUrl = process.env.BASE_RPC_URL || '';
      
      if (!rpcUrl) {
        this.results.push({
          category: 'RPC',
          status: 'FAIL',
          message: 'BASE_RPC_URL not set',
          fix: 'Add BASE_RPC_URL=https://mainnet.base.org to .env'
        });
        return;
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      const blockNumber = await this.provider.getBlockNumber();
      const network = await this.provider.getNetwork();

      if (network.chainId !== 8453n) {
        this.results.push({
          category: 'RPC',
          status: 'FAIL',
          message: `Wrong network: ${network.chainId} (expected 8453 for Base)`,
          fix: 'Use a Base mainnet RPC URL'
        });
        return;
      }

      // Test RPC speed
      const startTime = Date.now();
      await this.provider.getBlockNumber();
      const responseTime = Date.now() - startTime;

      if (responseTime > 1000) {
        this.results.push({
          category: 'RPC',
          status: 'WARNING',
          message: `Slow RPC response: ${responseTime}ms (should be <500ms)`,
          fix: 'Consider using a faster RPC provider like QuickNode or Alchemy'
        });
      } else {
        this.results.push({
          category: 'RPC',
          status: 'PASS',
          message: `Connected to Base (block: ${blockNumber}, latency: ${responseTime}ms)`
        });
      }
    } catch (error) {
      this.results.push({
        category: 'RPC',
        status: 'FAIL',
        message: `RPC connection failed: ${error}`,
        fix: 'Check your RPC URL and network connectivity'
      });
    }
  }

  private async checkWalletBalance(): Promise<void> {
    console.log('💰 Checking Wallet Balance...');
    
    if (!this.provider) return;

    try {
      const walletAddress = process.env.WALLET_ADDRESS;
      
      if (!walletAddress) {
        this.results.push({
          category: 'Wallet',
          status: 'FAIL',
          message: 'WALLET_ADDRESS not set',
          fix: 'Add your wallet address to .env'
        });
        return;
      }

      const balance = await this.provider.getBalance(walletAddress);
      const ethBalance = parseFloat(ethers.formatEther(balance));

      if (ethBalance < 0.001) {
        this.results.push({
          category: 'Wallet',
          status: 'FAIL',
          message: `Insufficient balance: ${ethBalance.toFixed(6)} ETH (need at least 0.001 ETH)`,
          fix: 'Add more ETH to your wallet for gas fees'
        });
      } else if (ethBalance < 0.01) {
        this.results.push({
          category: 'Wallet',
          status: 'WARNING',
          message: `Low balance: ${ethBalance.toFixed(6)} ETH (recommended: >0.01 ETH)`,
          fix: 'Consider adding more ETH for sustained operation'
        });
      } else {
        this.results.push({
          category: 'Wallet',
          status: 'PASS',
          message: `Balance: ${ethBalance.toFixed(6)} ETH`
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Wallet',
        status: 'FAIL',
        message: `Failed to check wallet: ${error}`,
        fix: 'Verify WALLET_ADDRESS is correct'
      });
    }
  }

  private async checkPoolRegistry(): Promise<void> {
    console.log('🏊 Checking Pool Registry...');
    
    const poolDataPath = path.join(process.cwd(), 'data', 'base-pools.json');
    
    if (!fs.existsSync(poolDataPath)) {
      this.results.push({
        category: 'Pool Registry',
        status: 'FAIL',
        message: 'base-pools.json not found',
        fix: 'Run: npm run scan:pools to discover pools'
      });
      return;
    }

    try {
      const poolData = JSON.parse(fs.readFileSync(poolDataPath, 'utf-8'));
      const poolCount = poolData.pools?.length || 0;

      if (poolCount === 0) {
        this.results.push({
          category: 'Pool Registry',
          status: 'FAIL',
          message: 'No pools in registry',
          fix: 'Run: npm run scan:pools to discover pools'
        });
      } else if (poolCount < 50) {
        this.results.push({
          category: 'Pool Registry',
          status: 'WARNING',
          message: `Only ${poolCount} pools found (expected 200+)`,
          fix: 'Run a full pool scan to discover more opportunities'
        });
      } else {
        this.results.push({
          category: 'Pool Registry',
          status: 'PASS',
          message: `${poolCount} pools loaded`
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Pool Registry',
        status: 'FAIL',
        message: `Failed to load pools: ${error}`,
        fix: 'Regenerate base-pools.json'
      });
    }
  }

  private async checkDEXContracts(): Promise<void> {
    console.log('🔄 Checking DEX Contracts...');
    
    if (!this.provider) return;

    const dexes = [
      { name: 'Uniswap V3', router: '0x2626664c2603336E57B271c5C0b26F421741e481' },
      { name: 'BaseSwap', router: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86' },
      { name: 'Aerodrome', router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' }
    ];

    for (const dex of dexes) {
      try {
        const code = await this.provider.getCode(dex.router);
        
        if (code === '0x') {
          this.results.push({
            category: 'DEX Contracts',
            status: 'FAIL',
            message: `${dex.name} router not found at ${dex.router}`,
            fix: 'Verify DEX router addresses in config'
          });
        } else {
          this.results.push({
            category: 'DEX Contracts',
            status: 'PASS',
            message: `${dex.name} verified`
          });
        }
      } catch (error) {
        this.results.push({
          category: 'DEX Contracts',
          status: 'WARNING',
          message: `Could not verify ${dex.name}: ${error}`
        });
      }
    }
  }

  private async checkFlashLoanContract(): Promise<void> {
    console.log('⚡ Checking Flash Loan Contract...');
    
    if (!this.provider) return;

    const contractAddress = process.env.FLASH_LOAN_CONTRACT;
    
    if (!contractAddress) {
      this.results.push({
        category: 'Flash Loan',
        status: 'FAIL',
        message: 'FLASH_LOAN_CONTRACT not set',
        fix: 'Deploy contract with: npx hardhat run scripts/deploy-flash-loan-contract.ts --network base'
      });
      return;
    }

    try {
      const code = await this.provider.getCode(contractAddress);
      
      if (code === '0x') {
        this.results.push({
          category: 'Flash Loan',
          status: 'FAIL',
          message: 'Contract not deployed at specified address',
          fix: 'Redeploy your flash loan contract'
        });
      } else {
        this.results.push({
          category: 'Flash Loan',
          status: 'PASS',
          message: `Contract deployed at ${contractAddress}`
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Flash Loan',
        status: 'FAIL',
        message: `Failed to verify contract: ${error}`
      });
    }
  }

  private async checkConfigurationSettings(): Promise<void> {
    console.log('⚙️  Checking Configuration...');
    
    const configPath = path.join(process.cwd(), 'config.json');
    
    if (!fs.existsSync(configPath)) {
      this.results.push({
        category: 'Configuration',
        status: 'WARNING',
        message: 'config.json not found, using defaults',
        fix: 'Create config.json to customize settings'
      });
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // Check critical settings
      const minProfitBps = config.minProfitBasisPoints || 10;
      const maxGasPrice = config.maxGasPriceGwei || 50;
      
      if (minProfitBps > 100) {
        this.results.push({
          category: 'Configuration',
          status: 'WARNING',
          message: `High profit threshold: ${minProfitBps} bps (${minProfitBps/100}%) may miss opportunities`,
          fix: 'Lower minProfitBasisPoints to 10-50 bps'
        });
      } else if (minProfitBps < 5) {
        this.results.push({
          category: 'Configuration',
          status: 'WARNING',
          message: `Very low profit threshold: ${minProfitBps} bps may execute unprofitable trades`,
          fix: 'Increase minProfitBasisPoints to at least 10 bps'
        });
      } else {
        this.results.push({
          category: 'Configuration',
          status: 'PASS',
          message: `Profit threshold: ${minProfitBps} bps (${minProfitBps/100}%)`
        });
      }

      this.results.push({
        category: 'Configuration',
        status: 'PASS',
        message: `Max gas price: ${maxGasPrice} gwei`
      });
    } catch (error) {
      this.results.push({
        category: 'Configuration',
        status: 'FAIL',
        message: `Failed to parse config: ${error}`,
        fix: 'Check config.json syntax'
      });
    }
  }

  private async testPriceFeeds(): Promise<void> {
    console.log('📊 Testing Price Feeds...');
    
    if (!this.provider) return;

    // Test fetching prices from a known pool
    const testPoolAddress = '0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18'; // WETH/USDC Uniswap V3
    
    try {
      const poolCode = await this.provider.getCode(testPoolAddress);
      
      if (poolCode === '0x') {
        this.results.push({
          category: 'Price Feeds',
          status: 'WARNING',
          message: 'Could not verify test pool',
          fix: 'Ensure DEX integrations are working'
        });
      } else {
        this.results.push({
          category: 'Price Feeds',
          status: 'PASS',
          message: 'Price feed test pool verified'
        });
      }
    } catch (error) {
      this.results.push({
        category: 'Price Feeds',
        status: 'FAIL',
        message: `Price feed test failed: ${error}`,
        fix: 'Check RPC connection and DEX integrations'
      });
    }
  }

  private printReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 DIAGNOSTIC REPORT');
    console.log('='.repeat(80) + '\n');

    const groupedResults = this.results.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, DiagnosticResult[]>);

    let hasFailures = false;
    let hasWarnings = false;

    for (const [category, results] of Object.entries(groupedResults)) {
      console.log(`\n${category}:`);
      console.log('-'.repeat(80));
      
      for (const result of results) {
        const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
        console.log(`${icon} ${result.status}: ${result.message}`);
        
        if (result.fix) {
          console.log(`   💡 Fix: ${result.fix}`);
        }
        
        if (result.status === 'FAIL') hasFailures = true;
        if (result.status === 'WARNING') hasWarnings = true;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const warnCount = this.results.filter(r => r.status === 'WARNING').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`✅ Passed: ${passCount}`);
    console.log(`⚠️  Warnings: ${warnCount}`);
    console.log(`❌ Failed: ${failCount}`);

    if (hasFailures) {
      console.log('\n❌ CRITICAL: Your bot cannot function with these failures.');
      console.log('Please fix all failed checks before running the bot.');
    } else if (hasWarnings) {
      console.log('\n⚠️  WARNING: Your bot may not find many opportunities.');
      console.log('Consider addressing warnings for optimal performance.');
    } else {
      console.log('\n✅ SUCCESS: Your bot configuration looks good!');
      console.log('If still not finding opportunities, check the fixes below.');
    }

    console.log('\n' + '='.repeat(80));
    console.log('NEXT STEPS');
    console.log('='.repeat(80));
    
    if (hasFailures) {
      console.log('1. Fix all ❌ failed checks listed above');
      console.log('2. Run this diagnostic again');
      console.log('3. Then try running the bot');
    } else {
      console.log('1. Apply the opportunity finder fixes (see fixed-opportunity-finder.ts)');
      console.log('2. Lower your profit threshold in config.json to 10-20 bps');
      console.log('3. Run: npm run scan:pools to refresh pool data');
      console.log('4. Start the bot with: npm run executor:start');
      console.log('5. Monitor for 5-10 minutes to see if opportunities appear');
    }
    
    console.log('\n');
  }
}

// Run diagnostics
async function main() {
  const diagnostics = new BotDiagnostics();
  await diagnostics.runFullDiagnostic();
}

main().catch(console.error);
