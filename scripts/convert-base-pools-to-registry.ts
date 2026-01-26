/**
 * Convert base-pools.json to pool-registry.json format
 */

import fs from 'fs';
import path from 'path';

function main() {
  const basePath = path.join(process.cwd(), 'data', 'base-pools.json');
  const registryPath = path.join(process.cwd(), 'data', 'pool-registry.json');

  const baseData = JSON.parse(fs.readFileSync(basePath, 'utf-8'));

  const registryData = {
    version: baseData.version,
    lastUpdated: Date.now(),
    pools: baseData.pools.map((pool: any) => ({
      address: pool.address,
      dex: pool.dex,
      dexType: pool.dexVersion,
      dexVersion: pool.dexVersion,
      token0: pool.token0,
      token1: pool.token1,
      fee: pool.fee,
      liquidity: pool.liquidity ? (typeof pool.liquidity === 'number' ? pool.liquidity.toString() : pool.liquidity) : undefined,
      price: pool.price,
      reserve0: pool.reserve0,
      reserve1: pool.reserve1,
      sqrtPriceX96: pool.sqrtPriceX96,
      tick: pool.tick,
      blockNumber: 0,
      lastUpdated: Date.now(),
      isActive: true,
    })),
  };

  fs.writeFileSync(registryPath, JSON.stringify(registryData, null, 2));
  console.log(`✅ Converted ${baseData.pools.length} pools to registry format`);
  console.log(`💾 Saved to: ${registryPath}`);
}

main();