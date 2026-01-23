// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMultiDEX
 * @notice Interface for multi-DEX arbitrage swaps
 * @dev Supports: Uniswap V4, V3, V2, Curve, SushiSwap V3, PancakeSwap V3, Aerodrome Finance, Aerodrome SlipStream, Aerodrome SlipStream 2, BaseSwap
 */
interface IMultiDEX {
    /**
     * @notice Swap parameters for a single DEX swap
     */
    struct Swap {
        uint8 dexType;        // 0: V2, 1: V3, 2: V4, 3: Curve
        address tokenIn;      // Input token address
        address tokenOut;     // Output token address
        uint256 amount;       // Amount to swap
        uint256 minAmount;    // Minimum amount out
        address dexRouter;    // DEX router address
        uint24 fee;           // Fee tier (for V3)
        bytes swapData;       // Encoded swap data (for V4)
    }

    /**
     * @notice Complete swap parameters for arbitrage
     */
    struct SwapParams {
        Swap[] swaps;           // Array of swaps to execute
        uint256 minProfitAmount; // Minimum profit required
        string dexPath;          // String representation of DEX path
    }

    }