// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICurvePool
 * @notice Interface for Curve StableSwap pools
 * @dev Used for stable-to-stable and stable-to-volatile swaps
 */
interface ICurvePool {
    /**
     * @notice Exchange tokens in the pool
     * @param i Index of input token (0, 1, 2...)
     * @param j Index of output token (0, 1, 2...)
     * @param dx Amount of input token
     * @param min_dy Minimum amount of output token
     * @return Amount of output token received
     */
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    /**
     * @notice Get the balance of a token in the pool
     * @param i Index of token (0, 1, 2...)
     * @return Token balance
     */
    function balances(uint256 i) external view returns (uint256);

    /**
     * @notice Get the number of tokens in the pool
     * @return Number of tokens
     */
    function N_COINS() external view returns (uint256);

    /**
     * @notice Get the address of a token by index
     * @param i Index of token (0, 1, 2...)
     * @return Token address
     */
    function coins(uint256 i) external view returns (address);

    /**
     * @notice Calculate the amount of output tokens for a given input
     * @param i Index of input token
     * @param j Index of output token
     * @param dx Amount of input token
     * @return Amount of output tokens
     */
    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    /**
     * @notice Get the pool's A parameter (amplification coefficient)
     * @return A parameter
     */
    function A() external view returns (uint256);

    /**
     * @notice Get the pool's fee
     * @return Fee in basis points
     */
    function fee() external view returns (uint256);
}