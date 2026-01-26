/**
 * Script to verify Curve deployment on Base
 * Queries the Curve Address Provider to get factory and registry addresses
 */

import { ethers } from 'ethers';
import { PUBLIC_RPC_NODES } from '../src/config/constants';

// Curve Address Provider ABI (minimal interface for getting addresses)
const CURVE_ADDRESS_PROVIDER_ABI = [
  'function get_address(uint256 _id) external view returns (address)',
  'function ids() external view returns (uint256[])',
];

// Curve Address Provider on Base
const CURVE_ADDRESS_PROVIDER = '0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98';

// ID mappings from CurveAddressProvider contract
const CURVE_IDS = {
  STABLESWAP_CUSTOM_REGISTRY: 0,
  POOL_INFO_GETTERS: 1,
  EXCHANGE_ROUTER: 2,
  STABLESWAP_METAPOOL_FACTORY: 3,
  FEE_DISTRIBUTOR: 4,
  CRYPTOSWAP_CUSTOM_REGISTRY: 5,
  TWOCRYPTO_FACTORY: 6,
  METAREGISTRY: 7,
  STABLESWAP_CRVUSD_FACTORY: 8,
  TRICRYPTONG_FACTORY: 11,
  STABLESWAPNG_FACTORY: 12,
  TWOCRYPTONG_FACTORY: 13,
};

async function verifyCurveOnBase() {
  console.log('\n' + '='.repeat(80));
  console.log('Verifying Curve Deployment on Base');
  console.log('='.repeat(80));

  // Get RPC URL from config
  const rpcUrl = PUBLIC_RPC_NODES[0];
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log(`\nRPC URL: ${rpcUrl}`);
  console.log(`Curve Address Provider: ${CURVE_ADDRESS_PROVIDER}\n`);

  try {
    // Create contract instance
    const addressProvider = new ethers.Contract(
      CURVE_ADDRESS_PROVIDER,
      CURVE_ADDRESS_PROVIDER_ABI,
      provider
    );

    // Get all available IDs
    console.log('Fetching all available IDs from Address Provider...');
    const ids = await addressProvider.ids();
    console.log(`Found ${ids.length} registered IDs:\n`);

    // Query each ID to get the address and description
    for (const id of ids) {
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const address = await addressProvider.get_address(id);
      
      if (address === ethers.ZeroAddress) {
        console.log(`  ID ${id}: Not configured`);
        continue;
      }

      // Get description (this requires a more complex ABI, so we'll just show the ID)
      const idName = Object.entries(CURVE_IDS).find(([_, value]) => value === Number(id))?.[0] || 'Unknown';
      
      console.log(`  ID ${id} (${idName}):`);
      console.log(`    Address: ${address}`);
      console.log('');
    }

    // Focus on the important IDs for pool discovery
    console.log('\n' + '='.repeat(80));
    console.log('Important Addresses for Pool Discovery');
    console.log('='.repeat(80) + '\n');

    const importantIds = [
      CURVE_IDS.STABLESWAP_CUSTOM_REGISTRY,
      CURVE_IDS.METAREGISTRY,
      CURVE_IDS.STABLESWAP_METAPOOL_FACTORY,
      CURVE_IDS.CRYPTOSWAP_CUSTOM_REGISTRY,
      CURVE_IDS.TWOCRYPTO_FACTORY,
    ];

    const addresses: any = {};

    for (const id of importantIds) {
      const address = await addressProvider.get_address(id);
      const idName = Object.entries(CURVE_IDS).find(([_, value]) => value === id)?.[0] || 'Unknown';
      
      if (address !== ethers.ZeroAddress) {
        console.log(`✓ ${idName}:`);
        console.log(`  ${address}\n`);
        addresses[idName] = address;
      } else {
        console.log(`✗ ${idName}: Not configured\n`);
      }
    }

    // Save addresses to a JSON file for easy reference
    const fs = require('fs');
    const output = {
      chain: 'base',
      addressProvider: CURVE_ADDRESS_PROVIDER,
      addresses,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      'data/curve-base-addresses.json',
      JSON.stringify(output, null, 2)
    );

    console.log('='.repeat(80));
    console.log(`Addresses saved to: data/curve-base-addresses.json`);
    console.log('='.repeat(80) + '\n');

    return addresses;

  } catch (error) {
    console.error('Error verifying Curve on Base:', error);
    throw error;
  }
}

// Run the verification
verifyCurveOnBase()
  .then(() => {
    console.log('Verification complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });