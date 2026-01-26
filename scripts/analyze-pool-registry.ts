import { PoolRegistryManager } from '../src/pools/registry';

async function analyze() {
  const registry = new PoolRegistryManager('./data');
  await registry.load();
  const pools = registry.getAllPools();

console.log('=== Pool Registry Analysis ===\n');
console.log('Total Pools:', pools.length);

const withReserves = pools.filter(p => p.reserve0 && p.reserve1);
const withLiquidityBigInt = pools.filter(p => p.liquidity && typeof p.liquidity !== 'string');
const withSqrtPrice = pools.filter(p => p.sqrtPriceX96);
const withStateData = pools.filter(p => 
  (p.reserve0 && p.reserve1) || (p.sqrtPriceX96 && p.liquidity)
);

console.log('Pools with reserves (V2):', withReserves.length);
console.log('Pools with liquidity (BigInt) (V3):', withLiquidityBigInt.length);
console.log('Pools with sqrtPriceX96 (V3):', withSqrtPrice.length);
console.log('Pools with state data:', withStateData.length);

const byDex: Record<string, number> = pools.reduce((acc, p) => {
  acc[p.dex] = (acc[p.dex] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log('\nPools by DEX:', byDex);

const byDexWithState: Record<string, number> = pools.reduce((acc, p) => {
  if ((p.reserve0 && p.reserve1) || (p.sqrtPriceX96 && p.liquidity)) {
    acc[p.dex] = (acc[p.dex] || 0) + 1;
  }
  return acc;
}, {} as Record<string, number>);
console.log('Pools with state by DEX:', byDexWithState);

console.log('\n=== Pools Missing State Data ===');
const missingState = pools.filter(p => 
  !(p.reserve0 && p.reserve1) && !(p.sqrtPriceX96 && p.liquidity)
);
console.log('Total missing state:', missingState.length);
console.log('\nSample pools missing state:');
missingState.slice(0, 5).forEach(pool => {
  console.log(`  ${pool.dex} ${pool.dexVersion} ${pool.token0.symbol}/${pool.token1.symbol}`);
});
}

analyze().catch(console.error);