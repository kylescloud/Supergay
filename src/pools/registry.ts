/**
 * Pool Registry Manager
 * Manages pool data storage, retrieval, and updates
 */

import fs from 'fs/promises';
import path from 'path';
import type { Pool, PoolRegistry as PoolRegistryType, RegistryStats, PoolFilter } from './types';

export class PoolRegistryManager {
  private data: PoolRegistryType;
  private filePath: string;
  private csvPath: string;

  constructor(dataDir: string = './data') {
    this.filePath = path.join(dataDir, 'pool-registry.json');
    this.csvPath = path.join(dataDir, 'pool-registry.csv');
    this.data = this.initializeRegistry();
  }

  private initializeRegistry(): PoolRegistryType {
    return {
      version: '1.0.0',
      lastUpdated: 0,
      blockNumber: 0,
      network: 'base',
      chainId: 8453,
      pools: [],
      stats: {
        totalPools: 0,
        poolsByDEX: {},
        poolsByToken: {},
        activePools: 0
      }
    };
  }

  async load(): Promise<void> {
    try {
      const fileData = await fs.readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(fileData);
      
      // Convert string values back to BigInt for pool data
      this.data.pools = this.data.pools.map((pool: any) => ({
        ...pool,
        reserve0: pool.reserve0 ? BigInt(pool.reserve0) : undefined,
        reserve1: pool.reserve1 ? BigInt(pool.reserve1) : undefined,
        liquidity: pool.liquidity ? BigInt(pool.liquidity) : undefined,
        sqrtPriceX96: pool.sqrtPriceX96 ? BigInt(pool.sqrtPriceX96) : undefined,
      }));
      
      console.log(`Loaded registry with ${this.data.pools.length} pools`);
    } catch (error) {
      console.log('No existing registry found, starting fresh');
      this.data = this.initializeRegistry();
    }
  }

  async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      
      // Convert BigInt to string for JSON serialization
      const serializedData = JSON.stringify(this.data, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }, 2);
      
      await fs.writeFile(this.filePath, serializedData, 'utf-8');
      console.log(`Saved registry to ${this.filePath}`);
      await this.saveCSV();
      console.log(`Saved CSV to ${this.csvPath}`);
    } catch (error) {
      console.error('Error saving registry:', error);
      throw error;
    }
  }

  private async saveCSV(): Promise<void> {
    const headers = [
      'address', 'dex', 'version', 'token0_address', 'token0_symbol',
      'token0_decimals', 'token1_address', 'token1_symbol', 'token1_decimals',
      'fee', 'reserve0', 'reserve1', 'liquidity', 'sqrtPriceX96',
      'tick', 'isActive', 'lastUpdated'
    ];

    const rows = this.data.pools.map(pool => [
      pool.address, pool.dex, pool.dexVersion,
      pool.token0.address, pool.token0.symbol, pool.token0.decimals.toString(),
      pool.token1.address, pool.token1.symbol, pool.token1.decimals.toString(),
      pool.fee?.toString() || '', pool.reserve0?.toString() || '',
      pool.reserve1?.toString() || '', pool.liquidity?.toString() || '',
      pool.sqrtPriceX96?.toString() || '', pool.tick?.toString() || '',
      pool.isActive.toString(), pool.lastUpdated.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    await fs.writeFile(this.csvPath, csvContent, 'utf-8');
  }

  async addPools(pools: Pool[]): Promise<void> {
    const existingAddresses = new Set(this.data.pools.map(p => p.address.toLowerCase()));
    let addedCount = 0;
    
    for (const pool of pools) {
      const address = pool.address.toLowerCase();
      const index = this.data.pools.findIndex(p => p.address.toLowerCase() === address);
      
      if (index !== -1) {
        this.data.pools[index] = pool;
      } else {
        this.data.pools.push(pool);
        existingAddresses.add(address);
        addedCount++;
      }
    }

    console.log(`Added ${addedCount} new pools, updated ${pools.length - addedCount} existing pools`);
    this.updateStats();
    this.data.lastUpdated = Date.now();
  }

  async updatePoolStates(poolUpdates: Partial<Pool>[]): Promise<void> {
    const addressMap = new Map(poolUpdates.map(p => [p.address?.toLowerCase(), p]));
    
    for (const pool of this.data.pools) {
      const update = addressMap.get(pool.address.toLowerCase());
      if (update) {
        Object.assign(pool, update);
        pool.lastUpdated = Date.now();
      }
    }

    this.updateStats();
    this.data.lastUpdated = Date.now();
  }

  getAllPools(): Pool[] {
    return this.data.pools;
  }

  getPools(filter: PoolFilter): Pool[] {
    return this.data.pools.filter(pool => {
      if (filter.dex && pool.dex !== filter.dex) return false;
      if (filter.token0 && pool.token0.address.toLowerCase() !== filter.token0.toLowerCase()) return false;
      if (filter.token1 && pool.token1.address.toLowerCase() !== filter.token1.toLowerCase()) return false;
      if (filter.isActive !== undefined && pool.isActive !== filter.isActive) return false;
      if (filter.minLiquidity) {
        const liquidity = pool.liquidity || pool.reserve0 || 0n;
        if (liquidity < filter.minLiquidity) return false;
      }
      if (filter.feeTiers && pool.fee && !filter.feeTiers.includes(pool.fee)) return false;
      return true;
    });
  }

  getPoolsByDEX(dex: string): Pool[] {
    return this.data.pools.filter(pool => pool.dex.toLowerCase() === dex.toLowerCase());
  }

  getPoolsByToken(tokenAddress: string): Pool[] {
    const tokenLower = tokenAddress.toLowerCase();
    return this.data.pools.filter(pool =>
      pool.token0.address.toLowerCase() === tokenLower ||
      pool.token1.address.toLowerCase() === tokenLower
    );
  }

  getPoolsForPair(token0: string, token1: string): Pool[] {
    const t0 = token0.toLowerCase();
    const t1 = token1.toLowerCase();
    
    return this.data.pools.filter(pool =>
      (pool.token0.address.toLowerCase() === t0 && pool.token1.address.toLowerCase() === t1) ||
      (pool.token0.address.toLowerCase() === t1 && pool.token1.address.toLowerCase() === t0)
    );
  }

  removeInactivePools(): void {
    const before = this.data.pools.length;
    this.data.pools = this.data.pools.filter(pool => pool.isActive);
    const after = this.data.pools.length;
    
    console.log(`Removed ${before - after} inactive pools`);
    this.updateStats();
  }

  private updateStats(): void {
    const stats: RegistryStats = {
      totalPools: this.data.pools.length,
      poolsByDEX: {},
      poolsByToken: {},
      activePools: 0
    };

    for (const pool of this.data.pools) {
      stats.poolsByDEX[pool.dex] = (stats.poolsByDEX[pool.dex] || 0) + 1;
      stats.poolsByToken[pool.token0.address] = (stats.poolsByToken[pool.token0.address] || 0) + 1;
      stats.poolsByToken[pool.token1.address] = (stats.poolsByToken[pool.token1.address] || 0) + 1;
      if (pool.isActive) stats.activePools++;
    }

    this.data.stats = stats;
  }

  getStats(): RegistryStats {
    return this.data.stats;
  }

  printSummary(): void {
    console.log('\n═════════════════════════════════════════════════════════════');
    console.log('                    POOL REGISTRY SUMMARY');
    console.log('═════════════════════════════════════════════════════════════\n');
    console.log(`Total Pools:       ${this.data.stats.totalPools}`);
    console.log(`Active Pools:      ${this.data.stats.activePools}`);
    console.log(`Inactive Pools:    ${this.data.stats.totalPools - this.data.stats.activePools}`);
    console.log(`Last Updated:      ${new Date(this.data.lastUpdated).toISOString()}`);
    console.log(`Block Number:      ${this.data.blockNumber}`);
    console.log('\nPools by DEX:');
    for (const [dex, count] of Object.entries(this.data.stats.poolsByDEX)) {
      console.log(`  ${dex}: ${count}`);
    }
    console.log('\n═════════════════════════════════════════════════════════════\n');
  }

  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  getRegistry(): PoolRegistryType {
    return this.data;
  }
}