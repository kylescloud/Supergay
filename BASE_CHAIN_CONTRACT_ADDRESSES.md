# Base Chain DEX Contract Addresses

## Quick Reference

This document provides all verified contract addresses for DEXs on Base chain as of December 2024.

---

## Uniswap V3

| Contract | Address | Purpose |
|----------|---------|---------|
| SwapRouter | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | Execute swaps |
| SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` | Execute swaps (v2) |
| Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | Create pools |
| Quoter V2 | `0x61fFE014bA17989E743c5F643B21F4792A3cc2e1` | Get price quotes |
| NonfungiblePositionManager | `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` | Manage LP positions |

---

## PancakeSwap V3

| Contract | Address | Purpose |
|----------|---------|---------|
| SwapRouter | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | Execute swaps |
| Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | Create pools |
| Quoter V2 | `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` | Get price quotes |

---

## Aerodrome

| Contract | Address | Purpose |
|----------|---------|---------|
| Router | `0xcF77a3Ba9A5CA399B7C97c4f56bB1f4d5511CF08` | Execute swaps (both pool types) |
| Factory | `0x420DD381b31aEf6683db6B902084c0F5F77229b3` | Create Classic pools |
| Quoter | `0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0` | Get quotes for SlipStream pools |

**Note**: Aerodrome has two pool types:
- **Classic**: V2-style constant product AMM
- **Slipstream**: V3-style concentrated liquidity AMM

---

## SushiSwap

| Contract | Address | Purpose |
|----------|---------|---------|
| Router | `0xd015D512849cFd9Ef1c681A407E837dEfcaF85F8` | Execute swaps |
| Factory | `0xc35DADB65012eC5796536bD9864eD8773aBc74C4` | Create pools |

---

## Balancer V2

| Contract | Address | Purpose |
|----------|---------|---------|
| Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` | Manage all pools and swaps |
| WeightedPoolFactory | `0x8E9aa87E45e28badbc5On1E2e0b8170ea7C8670E6` | Create weighted pools |

---

## Curve Finance

| Contract | Address | Purpose |
|----------|---------|---------|
| Router | `0x4f37A9d177470499A2dD084621020b023fcffc1F` | Execute multi-hop swaps |
| AddressProvider | `0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98` | Main registry for all contracts |
| MetaRegistry | Fetch via `get_address(7)` on AddressProvider | Discover all pools |
| Stableswap Factory | `0xd2002373543Ce3527023C75e7518C274A51ce712` | Create stablecoin pools |
| Twocrypto Factory | `0xc9Fe0C63Af9A39402e8a5514f9c43Af0322b665F` | Create 2-token volatile pools |
| Tricrypto Factory | `0xA5961898870943c68037F6848d2D866Ed2016bcB` | Create 3-token crypto pools |

### Curve Pool Types

1. **Stableswap**: For stablecoins with similar pegs
2. **Twocrypto**: For 2-token volatile pairs (e.g., ETH-USD)
3. **Tricrypto**: For 3-token crypto pairs (e.g., ETH-USD-BTC)

---

## Base Chain Network Details

| Property | Value |
|----------|-------|
| Chain ID | 8453 |
| RPC URL | https://mainnet.base.org |
| Explorer | https://basescan.org |
| Native Token | ETH |
| Block Time | ~2 seconds |
| Average Gas | 0.001-0.01 gwei |

---

## Usage Notes

### ABI Sources

All ABIs can be found on:
- Etherscan/Basescan for verified contracts
- Official GitHub repositories for each protocol
- OpenZeppelin for standard interfaces

### Integration Tips

1. **Uniswap V3 & PancakeSwap V3**: Share the same interface, can use shared code
2. **Aerodrome SlipStream**: Uses Uniswap V3 interface
3. **Aerodrome Classic**: Uses Uniswap V2 interface
4. **Curve**: Use MetaRegistry for pool discovery, Router for swaps
5. **Balancer**: All interactions go through the Vault contract

### Fee Tiers (V3 DEXs)

- 0.01% (100): For stable pairs
- 0.05% (500): For similar assets
- 0.3% (3000): Standard tier
- 1% (10000): For exotic pairs

---

## Verification

All addresses have been verified against:
- Official documentation from each protocol
- Basescan verification
- Cross-referenced with multiple sources

Last Updated: December 2024

---

## Additional Resources

### Documentation
- Uniswap V3: https://docs.uniswap.org/
- PancakeSwap V3: https://docs.pancakeswap.finance/
- Aerodrome: https://docs.aerodrome.finance/
- SushiSwap: https://docs.sushi.com/
- Balancer: https://docs.balancer.fi/
- Curve: https://docs.curve.finance/

### Contract Verification
- Basescan: https://basescan.org/
- DefiLlama: https://defillama.com/

### Security Audits
- Always verify contract addresses before deployment
- Check for recent security audits
- Monitor protocol announcements for upgrades