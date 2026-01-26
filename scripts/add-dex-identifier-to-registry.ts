import fs from 'fs';
import path from 'path';

// DEX identifier mapping based on dex name and version
const dexIdentifierMap: Record<string, string> = {
  'Uniswap-v2': 'UniswapV2',
  'Uniswap-v3': 'UniswapV3',
  'Uniswap-v4': 'UniswapV4',
  'Aerodrome-v2': 'Aerodrome',
  'Aerodrome-v3': 'AerodromeSlipStream',
  'AlienBase-v2': 'AlienBase',
  'AlienBase-v3': 'AlienBaseV3',
  'SwapBased V2-v2': 'SwapBased',
  'BaseSwap-v2': 'BaseSwap',
  'SushiSwap-v3': 'SushiSwapV3',
  'PancakeSwap V3-v3': 'PancakeSwapV3',
  'Hydrex-v2': 'Hydrex',
  'Hydrex-v3': 'HydrexV3',
};

// Fallback mapping based on dex name only
const dexNameMapping: Record<string, string> = {
  'Uniswap': 'UniswapV2',
  'Aerodrome': 'Aerodrome',
  'AlienBase': 'AlienBase',
  'Alien-base': 'AlienBase',
  'SwapBased V2': 'SwapBased',
  'Swapbased': 'SwapBased',
  'BaseSwap': 'BaseSwap',
  'SushiSwap': 'SushiSwapV3',
  'Hydrex': 'Hydrex',
  'Leetswap': 'Leetswap',
  'Quickswap': 'QuickSwap',
};

function getDexIdentifier(dex: string, dexType?: string): string {
  // First try exact match with type
  const key = dexType ? `${dex}-${dexType}` : dex;
  if (dexIdentifierMap[key]) {
    return dexIdentifierMap[key];
  }
  
  // Fallback to name-based mapping
  if (dexNameMapping[dex]) {
    return dexNameMapping[dex];
  }
  
  // Default to dex name if no mapping found
  return dex.replace(/\s+/g, '');
}

async function main() {
  const registryPath = path.join(process.cwd(), 'data', 'pool-registry.json');
  
  console.log('Reading pool registry...');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  
  console.log(`Found ${registry.pools.length} pools`);
  
  let updatedCount = 0;
  for (const pool of registry.pools) {
    const dexIdentifier = getDexIdentifier(pool.dex, pool.dexType);
    
    // Only update if not already set
    if (!pool.dexIdentifier || pool.dexIdentifier !== dexIdentifier) {
      pool.dexIdentifier = dexIdentifier;
      updatedCount++;
      
      if (updatedCount <= 5) {
        console.log(`Updated pool ${pool.address}: ${pool.dex} -> ${dexIdentifier}`);
      }
    }
  }
  
  console.log(`\nTotal pools updated: ${updatedCount}`);
  
  // Save updated registry
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  console.log('✅ Pool registry updated successfully!');
}

main().catch(console.error);