import { BigNumber } from 'bignumber.js';
import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { config } from '../src/config/index';
import { calculateEffectiveRate } from '../src/math/effectiveRate';
import type { Token, PoolState } from '../src/types';

async function main() {
  console.log('Testing Rate Calculation with Real Pool Data\n');
  
  const provider = await config.getScanningProvider();
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const pools = registry.getPools({});
  console.log(`Loaded ${pools.length} pools\n`);
  
  const loanAmount = ethers.parseEther('10.0');
  
  for (const pool of pools) {
    try {
      console.log(`\nPool: ${pool.dex} - ${pool.token0.symbol}/${pool.token1.symbol}`);
      console.log(`Address: ${pool.address}`);
      console.log(`Version: ${pool.dexVersion}`);
      console.log(`Fee: ${pool.fee ? (pool.fee / 10000).toFixed(4) : 'N/A'}%`);
      
      if (pool.liquidity && pool.sqrtPriceX96) {
        console.log(`Liquidity: ${pool.liquidity.toString()}`);
        console.log(`SqrtPriceX96: ${pool.sqrtPriceX96.toString()}`);
      }
      
      if (pool.reserve0 && pool.reserve1) {
        console.log(`Reserve0: ${pool.reserve0.toString()}`);
        console.log(`Reserve1: ${pool.reserve1.toString()}`);
      }
      
      const tokenIn: Token = {
        address: pool.token0.address,
        symbol: pool.token0.symbol,
        name: pool.token0.name,
        decimals: pool.token0.decimals,
      };
      
      const tokenOut: Token = {
        address: pool.token1.address,
        symbol: pool.token1.symbol,
        name: pool.token1.name,
        decimals: pool.token1.decimals,
      };
      
      // Convert Pool to PoolState
      const versionMap: Record<string, 'v2' | 'v3' | 'v4' | 'curve'> = {
        'V2': 'v2',
        'V3': 'v3',
        'V4': 'v4',
        'Curve': 'curve',
      };
      
      const poolState: PoolState = {
        dex: pool.dex,
        address: pool.address,
        token0: {
          address: pool.token0.address,
          symbol: pool.token0.symbol,
          name: pool.token0.name,
          decimals: pool.token0.decimals,
        },
        token1: {
          address: pool.token1.address,
          symbol: pool.token1.symbol,
          name: pool.token1.name,
          decimals: pool.token1.decimals,
        },
        sqrtPriceX96: pool.sqrtPriceX96,
        liquidity: pool.liquidity,
        reserve0: pool.reserve0,
        reserve1: pool.reserve1,
        fee: pool.fee || 0,
        tick: pool.tick,
        version: versionMap[pool.dexVersion] || 'v3',
      };
      
      console.log(`\nCalculating rate for ${tokenIn.symbol} -> ${tokenOut.symbol}:`);
      
      const result = calculateEffectiveRate(poolState, tokenIn, tokenOut, loanAmount);
      
      console.log(`  Rate: ${result.rate}`);
      console.log(`  Amount Out: ${result.amountOut.toString()}`);
      console.log(`  Slippage: ${result.slippage}`);
      console.log(`  Gas Estimate: ${result.gasEstimate}`);
      
      if (result.rate <= 0) {
        console.log(`  ⚠️  WARNING: Rate is not positive!`);
      }
      
    } catch (error: any) {
      console.error(`  Error: ${error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });