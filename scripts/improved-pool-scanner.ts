import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IMPROVED Pool Scanner
 * Discovers liquidity pools across all major DEXs on Base
 */

interface PoolData {
  address: string;
  token0: string;
  token1: string;
  dex: string;
  type: string;
  fee?: number;
  reserve0?: string;
  reserve1?: string;
  totalLiquidity?: string;
}

interface DEXConfig {
  name: string;
  type: string;
  factory: string;
  enabled: boolean;
}

export class ImprovedPoolScanner {
  private provider: ethers.JsonRpcProvider;
  private pools: PoolData[] = [];
  
  private readonly DEXES: DEXConfig[] = [
    {
      name: 'Uniswap V3',
      type: 'v3',
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      enabled: true
    },
    {
      name: 'Uniswap V2',
      type: 'v2',
      factory: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
      enabled: true
    },
    {
      name: 'BaseSwap',
      type: 'v2',
      factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
      enabled: true
    },
    {
      name: 'Aerodrome',
      type: 'solidly',
      factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      enabled: true
    },
    {
      name: 'SwapBased',
      type: 'v2',
      factory: '0x04C9f118d21e8B767D2e50C946f0cC9F6C367300',
      enabled: true
    },
    {
      name: 'RocketSwap',
      type: 'v2',
      factory: '0xBe6c6A389b82306e88d74d1692B67285A9db9A47',
      enabled: true
    },
    {
      name: 'Sushi V3',
      type: 'v3',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      enabled: true
    },
    {
      name: 'PancakeSwap V3',
      type: 'v3',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      enabled: true
    }
  ];

  private readonly PRIORITY_TOKENS = [
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    { symbol: 'USDbC', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' },
    { symbol: 'DAI', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' },
    { symbol: 'cbETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22' }
  ];

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async scanAllDEXes(): Promise<void> {
    console.log('🔍 Starting DEX Pool Scan on Base Network\n');
    console.log(`Scanning ${this.DEXES.length} DEXs...`);
    
    for (const dex of this.DEXES) {
      if (!dex.enabled) continue;
      
      console.log(`\n📊 Scanning ${dex.name}...`);
      
      try {
        if (dex.type === 'v2') {
          await this.scanV2Pools(dex);
        } else if (dex.type === 'v3') {
          await this.scanV3Pools(dex);
        } else if (dex.type === 'solidly') {
          await this.scanSolidlyPools(dex);
        }
      } catch (error) {
        console.error(`   ❌ Error scanning ${dex.name}:`, error.message);
      }
    }
    
    console.log(`\n✅ Scan complete! Found ${this.pools.length} pools`);
    this.savePools();
    this.printSummary();
  }

  private async scanV2Pools(dex: DEXConfig): Promise<void> {
    const factory = new ethers.Contract(
      dex.factory,
      [
        'function allPairsLength() view returns (uint256)',
        'function allPairs(uint256) view returns (address)'
      ],
      this.provider
    );

    try {
      const pairCount = await factory.allPairsLength();
      console.log(`   Found ${pairCount} total pairs`);
      
      // Scan in batches
      const batchSize = 50;
      const maxPairs = Math.min(Number(pairCount), 500); // Scan up to 500 pools
      
      for (let i = 0; i < maxPairs; i += batchSize) {
        const promises = [];
        
        for (let j = i; j < Math.min(i + batchSize, maxPairs); j++) {
          promises.push(this.fetchV2PoolData(factory, j, dex));
        }
        
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            this.pools.push(result.value);
          }
        }
        
        console.log(`   Processed ${Math.min(i + batchSize, maxPairs)}/${maxPairs} pools`);
      }
      
      console.log(`   ✅ Added ${this.pools.filter(p => p.dex === dex.name).length} pools from ${dex.name}`);
    } catch (error) {
      console.error(`   Error: ${error.message}`);
    }
  }

  private async fetchV2PoolData(
    factory: ethers.Contract,
    index: number,
    dex: DEXConfig
  ): Promise<PoolData | null> {
    try {
      const pairAddress = await factory.allPairs(index);
      
      const pairContract = new ethers.Contract(
        pairAddress,
        [
          'function token0() view returns (address)',
          'function token1() view returns (address)',
          'function getReserves() view returns (uint112, uint112, uint32)'
        ],
        this.provider
      );

      const [token0, token1, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves()
      ]);

      // Filter out low liquidity pools
      const reserve0 = BigInt(reserves[0]);
      const reserve1 = BigInt(reserves[1]);
      
      if (reserve0 < ethers.parseEther('0.01') || reserve1 < ethers.parseEther('0.01')) {
        return null; // Skip pools with very low liquidity
      }

      return {
        address: pairAddress,
        token0,
        token1,
        dex: dex.name,
        type: 'v2',
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString()
      };
    } catch (error) {
      return null;
    }
  }

  private async scanV3Pools(dex: DEXConfig): Promise<void> {
    const factory = new ethers.Contract(
      dex.factory,
      ['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'],
      this.provider
    );

    try {
      // Get recent pools from events
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks
      
      console.log(`   Fetching pools from block ${fromBlock} to ${currentBlock}...`);
      
      const filter = factory.filters.PoolCreated();
      const events = await factory.queryFilter(filter, fromBlock, currentBlock);
      
      console.log(`   Found ${events.length} pool creation events`);
      
      // Process in batches
      const batchSize = 20;
      for (let i = 0; i < Math.min(events.length, 200); i += batchSize) {
        const batch = events.slice(i, Math.min(i + batchSize, 200));
        const promises = batch.map(event => this.fetchV3PoolData(event, dex));
        
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            this.pools.push(result.value);
          }
        }
        
        console.log(`   Processed ${Math.min(i + batchSize, 200)}/${Math.min(events.length, 200)} pools`);
      }
      
      console.log(`   ✅ Added ${this.pools.filter(p => p.dex === dex.name).length} pools from ${dex.name}`);
    } catch (error) {
      console.error(`   Error: ${error.message}`);
    }
  }

  private async fetchV3PoolData(event: any, dex: DEXConfig): Promise<PoolData | null> {
    try {
      const poolAddress = event.args?.pool;
      if (!poolAddress) return null;

      const poolContract = new ethers.Contract(
        poolAddress,
        ['function liquidity() view returns (uint128)'],
        this.provider
      );

      const liquidity = await poolContract.liquidity();
      
      // Filter out empty pools
      if (liquidity < ethers.parseEther('0.01')) {
        return null;
      }

      return {
        address: poolAddress,
        token0: event.args?.token0,
        token1: event.args?.token1,
        dex: dex.name,
        type: 'v3',
        fee: Number(event.args?.fee),
        totalLiquidity: liquidity.toString()
      };
    } catch (error) {
      return null;
    }
  }

  private async scanSolidlyPools(dex: DEXConfig): Promise<void> {
    // Solidly-style DEXs (like Aerodrome) have a different factory interface
    const factory = new ethers.Contract(
      dex.factory,
      [
        'function allPairsLength() view returns (uint256)',
        'function allPairs(uint256) view returns (address)'
      ],
      this.provider
    );

    try {
      const pairCount = await factory.allPairsLength();
      console.log(`   Found ${pairCount} total pairs`);
      
      const batchSize = 50;
      const maxPairs = Math.min(Number(pairCount), 500);
      
      for (let i = 0; i < maxPairs; i += batchSize) {
        const promises = [];
        
        for (let j = i; j < Math.min(i + batchSize, maxPairs); j++) {
          promises.push(this.fetchSolidlyPoolData(factory, j, dex));
        }
        
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            this.pools.push(result.value);
          }
        }
        
        console.log(`   Processed ${Math.min(i + batchSize, maxPairs)}/${maxPairs} pools`);
      }
      
      console.log(`   ✅ Added ${this.pools.filter(p => p.dex === dex.name).length} pools from ${dex.name}`);
    } catch (error) {
      console.error(`   Error: ${error.message}`);
    }
  }

  private async fetchSolidlyPoolData(
    factory: ethers.Contract,
    index: number,
    dex: DEXConfig
  ): Promise<PoolData | null> {
    try {
      const pairAddress = await factory.allPairs(index);
      
      const pairContract = new ethers.Contract(
        pairAddress,
        [
          'function token0() view returns (address)',
          'function token1() view returns (address)',
          'function getReserves() view returns (uint256, uint256, uint256)'
        ],
        this.provider
      );

      const [token0, token1, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves()
      ]);

      const reserve0 = BigInt(reserves[0]);
      const reserve1 = BigInt(reserves[1]);
      
      if (reserve0 < ethers.parseEther('0.01') || reserve1 < ethers.parseEther('0.01')) {
        return null;
      }

      return {
        address: pairAddress,
        token0,
        token1,
        dex: dex.name,
        type: 'solidly',
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString()
      };
    } catch (error) {
      return null;
    }
  }

  private savePools(): void {
    const dataDir = path.join(process.cwd(), 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'base-pools.json');
    
    const output = {
      lastUpdated: new Date().toISOString(),
      network: 'base',
      chainId: 8453,
      poolCount: this.pools.length,
      pools: this.pools
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved ${this.pools.length} pools to ${outputPath}`);
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SCAN SUMMARY');
    console.log('='.repeat(80));
    
    const byDex = this.pools.reduce((acc, pool) => {
      acc[pool.dex] = (acc[pool.dex] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nPools by DEX:');
    for (const [dex, count] of Object.entries(byDex)) {
      console.log(`  ${dex}: ${count} pools`);
    }

    const byType = this.pools.reduce((acc, pool) => {
      acc[pool.type] = (acc[pool.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nPools by Type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count} pools`);
    }

    // Count pools with priority tokens
    const priorityPools = this.pools.filter(pool => {
      const priorityAddresses = this.PRIORITY_TOKENS.map(t => t.address.toLowerCase());
      return priorityAddresses.includes(pool.token0.toLowerCase()) ||
             priorityAddresses.includes(pool.token1.toLowerCase());
    });

    console.log(`\n🎯 Pools with priority tokens: ${priorityPools.length}`);
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Pool scan complete! You can now run the opportunity finder.');
    console.log('   Run: npm run find:opportunities\n');
  }
}

// CLI usage
async function main() {
  console.log('🚀 Base Network Pool Scanner\n');
  
  const rpcUrl = process.env.BASE_RPC_URL || process.env.QUICKNODE_RPC || 'https://mainnet.base.org';
  
  console.log(`Using RPC: ${rpcUrl}\n`);
  
  const scanner = new ImprovedPoolScanner(rpcUrl);
  await scanner.scanAllDEXes();
}

if (require.main === module) {
  main().catch(console.error);
}

export default ImprovedPoolScanner;
