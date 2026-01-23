// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDEXRouter
 * @notice Interface for DEX routers (Uniswap V2/V3/V4, SushiSwap V3, PancakeSwap V3, Aerodrome, BaseSwap)
 */
interface IDEXRouter {
    /**
     * @notice Get amount out for exact input
     * @param amountIn Amount input
     * @param path Token path
     * @return amounts Amount out
     */
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Swap exact tokens for tokens
     * @param amountIn Amount in
     * @param amountOutMin Minimum amount out
     * @param path Token path
     * @param to Recipient
     * @param deadline Transaction deadline
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /**
     * @notice Swap exact ETH for tokens
     * @param amountOutMin Minimum amount out
     * @param path Token path
     * @param to Recipient
     * @param deadline Transaction deadline
     */
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    /**
     * @notice Swap exact tokens for ETH
     * @param amountIn Amount in
     * @param amountOutMin Minimum amount out
     * @param path Token path
     * @param to Recipient
     * @param deadline Transaction deadline
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/**
 * @title ISwapRouter
 * @notice Interface for Uniswap V3/V4-style routers (Uniswap V3, SushiSwap V3, PancakeSwap V3, Aerodrome SlipStream)
 */
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    /**
     * @notice Swap exact input single
     */
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);

    /**
     * @notice Swap exact input
     */
    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut);
}

/**
 * @title ICurveRouter
 * @notice Interface for Curve router
 */
interface ICurveRouter {
    /**
     * @notice Exchange tokens
     */
    function exchange(
        uint256 poolId,
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

/**
 * @title ICurvePool
 * @notice Interface for Curve pools
 */
interface ICurvePool {
    /**
     * @notice Exchange tokens
     */
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    /**
     * @notice Get dy (expected output)
     */
    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    /**
     * @notice Get balances
     */
    function get_balances() external view returns (uint256[2] memory);

    /**
     * @notice Get coins
     */
    function coins(uint256 index) external view returns (address);
}

/**
 * @title IUniswapV4PoolManager
 * @notice Interface for Uniswap V4 Pool Manager
 */
interface IUniswapV4PoolManager {
    /**
     * @notice Pool key structure
     */
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    /**
     * @notice Swap parameters
     */
    struct PoolSwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    /**
     * @notice Balance delta
     */
    struct BalanceDelta {
        int128 delta0;
        int128 delta1;
    }

    /**
     * @notice Swap tokens in V4 pool
     */
    function swap(
        address sender,
        bytes calldata key,
        PoolSwapParams calldata swapParams,
        bytes calldata hookData
    ) external returns (BalanceDelta memory delta);
}