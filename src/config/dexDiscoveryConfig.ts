/**
 * Unified DEX Configuration for Pool Discovery
 * 
 * This is the single source of truth for all DEX configurations used in pool discovery.
 * All factory addresses, router addresses, and DEX metadata are imported from DEX_CONFIG
 * in constants.ts and mapped to the PoolDiscovery DEXConfig format.
 * 
 * DEX naming convention: kebab-case (e.g., 'uniswap-v3', 'aerodrome-slipstream')
 */

import { DEX_CONFIG } from './constants';
import type { DEXConfig as PoolDiscoveryDEXConfig } from '../pools/types';

/**
 * Extended DEXConfig for PoolDiscovery
 * Adds support for different architectures (Factory vs Pool Manager)
 */
export interface DEXDiscoveryConfig extends Omit<PoolDiscoveryDEXConfig, 'version'> {
  /** Standardized kebab-case DEX identifier */
  dexId: string;
  /** DEX version string */
  version: string;
  /** Factory contract address (for V2/V3 DEXs) */
  factory?: string;
  /** Pool Manager contract address (for Uniswap V4) */
  poolManager?: string;
  /** Router contract address (for all DEXs) */
  router?: string;
  /** Quoter contract address (for V3 DEXs) */
  quoter?: string;
  /** StateView contract address (for Uniswap V4) */
  stateView?: string;
  /** Fee tiers for V3 DEXs */
  feeTiers?: number[];
}

/**
 * Unified DEX configuration for all 10 DEXs
 * 
 * This configuration provides the single source of truth for:
 * - Factory/Pool Manager addresses
 * - Router addresses
 * - Quoter addresses
 * - Fee tiers
 * - DEX names and versions
 */
export const DEX_DISCOVERY_CONFIG: DEXDiscoveryConfig[] = [
  {
    dexId: 'uniswap-v4',
    name: 'Uniswap V4',
    version: 'v4',
    poolManager: DEX_CONFIG.uniswapV4.poolManager,
    router: DEX_CONFIG.uniswapV4.universalRouter,
    quoter: DEX_CONFIG.uniswapV4.quoter,
    stateView: DEX_CONFIG.uniswapV4.stateView,
    feeTiers: [...DEX_CONFIG.uniswapV4.feeTiers],
  },
  {
    dexId: 'uniswap-v3',
    name: 'Uniswap V3',
    version: 'v3',
    factory: DEX_CONFIG.uniswapV3.factory,
    router: DEX_CONFIG.uniswapV3.router,
    quoter: DEX_CONFIG.uniswapV3.quoter,
    feeTiers: [...DEX_CONFIG.uniswapV3.feeTiers],
  },
  {
    dexId: 'uniswap-v2',
    name: 'Uniswap V2',
    version: 'v2',
    factory: DEX_CONFIG.uniswapV2.factory,
    router: DEX_CONFIG.uniswapV2.router,
  },
  {
    dexId: 'curve',
    name: 'Curve Finance',
    version: 'curve',
    factory: DEX_CONFIG.curve.stableswapMetapoolFactory,
    router: DEX_CONFIG.curve.exchangeRouter,
  },
  {
    dexId: 'sushiswap-v3',
    name: 'SushiSwap V3',
    version: 'v3',
    factory: DEX_CONFIG.sushiswapV3.factory,
    router: DEX_CONFIG.sushiswapV3.router,
    quoter: DEX_CONFIG.sushiswapV3.quoter,
    feeTiers: [...DEX_CONFIG.sushiswapV3.feeTiers],
  },
  {
    dexId: 'pancakeswap-v3',
    name: 'PancakeSwap V3',
    version: 'v3',
    factory: DEX_CONFIG.pancakeSwapV3.factory,
    router: DEX_CONFIG.pancakeSwapV3.router,
    quoter: DEX_CONFIG.pancakeSwapV3.quoter,
    feeTiers: [...DEX_CONFIG.pancakeSwapV3.feeTiers],
  },
  {
    dexId: 'aerodrome',
    name: 'Aerodrome',
    version: 'v2',
    factory: DEX_CONFIG.aerodrome.factory,
    router: DEX_CONFIG.aerodrome.router,
  },
  {
    dexId: 'aerodrome-slipstream',
    name: 'Aerodrome SlipStream',
    version: 'v3',
    factory: DEX_CONFIG.aerodromeSlipStream.factory,
    router: DEX_CONFIG.aerodromeSlipStream.router,
    quoter: DEX_CONFIG.aerodromeSlipStream.quoter,
    feeTiers: [...DEX_CONFIG.aerodromeSlipStream.feeTiers],
  },
  {
    dexId: 'aerodrome-slipstream-2',
    name: 'Aerodrome SlipStream 2',
    version: 'v3',
    factory: DEX_CONFIG.aerodromeSlipStream2.factory,
    router: DEX_CONFIG.aerodromeSlipStream2.router,
    quoter: DEX_CONFIG.aerodromeSlipStream2.quoter,
    feeTiers: [...DEX_CONFIG.aerodromeSlipStream2.feeTiers],
  },
  {
    dexId: 'baseswap',
    name: 'BaseSwap',
    version: 'v2',
    factory: DEX_CONFIG.baseSwap.factory,
    router: DEX_CONFIG.baseSwap.router,
  },
];

/**
 * Helper function to get DEX config by dexId
 */
export function getDEXConfig(dexId: string): DEXDiscoveryConfig | undefined {
  return DEX_DISCOVERY_CONFIG.find(config => config.dexId === dexId);
}

/**
 * Helper function to get all supported DEX IDs
 */
export function getAllSupportedDEXIds(): string[] {
  return DEX_DISCOVERY_CONFIG.map(config => config.dexId);
}

/**
 * Helper function to get DEX config by version
 */
export function getDEXConfigsByVersion(version: string): DEXDiscoveryConfig[] {
  return DEX_DISCOVERY_CONFIG.filter(config => config.version === version);
}

/**
 * Validate that all DEX configs have required fields
 */
export function validateDEXConfigs(): boolean {
  for (const config of DEX_DISCOVERY_CONFIG) {
    if (!config.dexId || !config.name || !config.version) {
      console.error(`Invalid DEX config: missing required fields for ${config.name}`);
      return false;
    }

    // V2/V3 DEXs require factory
    if ((config.version === 'v2' || config.version === 'v3') && !config.factory) {
      console.error(`Invalid DEX config: ${config.name} (${config.version}) requires factory address`);
      return false;
    }

    // V4 requires poolManager
    if (config.version === 'v4' && !config.poolManager) {
      console.error(`Invalid DEX config: ${config.name} (${config.version}) requires poolManager address`);
      return false;
    }

    // V3 DEXs should have feeTiers
    if (config.version === 'v3' && (!config.feeTiers || config.feeTiers.length === 0)) {
      console.error(`Invalid DEX config: ${config.name} (${config.version}) should have feeTiers`);
      return false;
    }
  }

  return true;
}

// Validate configs on import
if (!validateDEXConfigs()) {
  throw new Error('DEX configuration validation failed');
}