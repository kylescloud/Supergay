// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "./interfaces/IDEXRouter.sol";
import "./interfaces/IMultiDEX.sol";
import "./interfaces/ICurvePool.sol";

/**
 * @title FlashLoanArbitrage - FIXED VERSION
 * @notice Executes arbitrage using Aave V3 flash loans on Base across multiple DEXs
 * @dev Implements MEV protection and profit validation
 * @dev Supports: Uniswap V4, V3, V2, Curve, SushiSwap V3, PancakeSwap V3, Aerodrome Finance, Aerodrome SlipStream, Aerodrome SlipStream 2, BaseSwap, Hydrex
 * @dev FIXES APPLIED:
 *      1. Added all missing DEX type cases (AerodromeV2, AerodromeV3, SushiSwapV3, PancakeSwapV3, BaseSwap)
 *      2. Implemented proper balance tracking for multi-hop swaps
 *      3. Fixed Curve swap implementation with proper token indices
 *      4. Added flash loan amount validation
 *      5. Added router validation before execution
 */
contract FlashLoanArbitrage is FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    // Swap structs
    struct Swap {
        uint8 dexType;        // 0: V2, 1: V3, 2: V4, 3: Curve, 4: AerodromeV2, 5: AerodromeV3, 6: SushiSwapV3, 7: PancakeSwapV3, 8: BaseSwap, 9: Hydrex
        address tokenIn;      // Input token address
        address tokenOut;     // Output token address
        uint256 amount;       // Amount to swap (only used for first swap, ignored for others)
        uint256 minAmount;    // Minimum amount out
        address dexRouter;    // DEX router address
        uint24 fee;           // Fee tier (for V3)
        bytes swapData;       // Encoded swap data (for V4 and Curve)
    }

    struct SwapParams {
        Swap[] swaps;           // Array of swaps to execute
        uint256 minProfitAmount; // Minimum profit required
        string dexPath;          // String representation of DEX path
    }

    address public owner;
    bool public paused;

    // Execution parameters
    uint256 public minProfit;
    uint256 public maxGasPrice;

    // DEX Router addresses (settable) - 11 required DEXs
    address public uniswapV4PoolManager;
    address public uniswapV4UniversalRouter;
    address public uniswapV3Router;
    address public uniswapV2Router;
    address public curveRouter;
    address public sushiswapV3Router;
    address public pancakeSwapV3Router;
    address public aerodromeRouter; // Aerodrome Finance (V2-style)
    address public aerodromeSlipStreamRouter; // Aerodrome SlipStream (V3-style)
    address public aerodromeSlipStream2Router; // Aerodrome SlipStream 2 (V3-style)
    address public baseSwapRouter; // BaseSwap (V2-style)
    address public hydrexRouter; // Hydrex (V2-style)

    // DEX Type enumeration
    enum DEXType {
        UniswapV2,       // 0
        UniswapV3,       // 1
        UniswapV4,       // 2
        Curve,           // 3
        AerodromeV2,     // 4
        AerodromeV3,     // 5
        SushiSwapV3,     // 6
        PancakeSwapV3,   // 7
        BaseSwap,        // 8
        Hydrex           // 9
    }

    // Events
    event ArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        uint256 gasUsed,
        string dexPath
    );
    event ArbitrageFailed(
        address indexed asset,
        uint256 amount,
        string reason
    );
    event OwnerUpdated(address indexed newOwner);
    event PausedUpdated(bool indexed paused);
    event ParametersUpdated(uint256 minProfit, uint256 maxGasPrice);
    event RouterUpdated(string indexed dex, address indexed router);

    // Errors
    error NotOwner();
    error ContractPaused();
    error InsufficientProfit();
    error GasPriceTooHigh();
    error InvalidSwap();
    error SwapFailed();
    error InvalidDEX();
    error InvalidRouter();
    error ZeroAddress();
    error InvalidFlashLoan();
    error RouterNotApproved();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    /**
     * @notice Constructor
     * @param _addressProvider Aave PoolAddressesProvider address
     */
    constructor(
        address _addressProvider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) {
        owner = msg.sender;
        paused = false;
        minProfit = 0.001 ether; // Minimum 0.001 ETH profit
        maxGasPrice = 20 gwei;

        // Set default DEX router addresses on Base
        // Uniswap V4
        uniswapV4PoolManager = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
        uniswapV4UniversalRouter = 0x6fF5693b99212Da76ad316178A184AB56D299b43;
        
        // Uniswap V3
        uniswapV3Router = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
        
        // Uniswap V2
        uniswapV2Router = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
        
        // Curve
        curveRouter = 0x99A583981D3D968c3D71425676B72C720f02b734;
        
        // SushiSwap V3
        sushiswapV3Router = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
        
        // PancakeSwap V3
        pancakeSwapV3Router = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
        
        // Aerodrome Finance (V2-style)
        aerodromeRouter = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
        
        // Aerodrome SlipStream (V3-style)
        aerodromeSlipStreamRouter = 0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5;
        
        // Aerodrome SlipStream 2 (V3-style)
        aerodromeSlipStream2Router = 0x51ca29d9828867C363572C37c424E3d6b380c61e;
        
        // BaseSwap (V2-style)
        baseSwapRouter = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
        
        // Hydrex (V2-style)
        hydrexRouter = 0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7;
    }

    /**
     * @notice Execute arbitrage with flash loan
     * @param asset Asset to borrow
     * @param amount Amount to borrow
     * @param swapParams Encoded swap parameters for multi-DEX path
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        bytes calldata swapParams
    ) external whenNotPaused returns (bool) {
        // Check gas price
        if (tx.gasprice > maxGasPrice) revert GasPriceTooHigh();

        // Validate asset
        if (asset == address(0)) revert ZeroAddress();

        // Execute flash loan
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            swapParams,
            0 // Referral code
        );

        return true;
    }

    /**
     * @notice Flash loan callback - executes arbitrage logic (FIXED VERSION)
     * @param asset The address of the flash-borrowed asset
     * @param amount The amount of the flash-borrowed asset
     * @param premium The fee of the flash-borrowed asset
     * @param initiator The address of the flashloan initiator
     * @param params Encoded parameters (swap data)
     * @return success Whether the operation succeeded
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Only accept calls from Aave pool
        if (msg.sender != address(POOL)) {
            revert InvalidSwap();
        }

        // Decode swap parameters
        (
            SwapParams memory swapParams
        ) = abi.decode(params, (SwapParams));

        // FIX #4: Validate we received the full flash loan amount
        uint256 receivedAmount = IERC20(asset).balanceOf(address(this));
        if (receivedAmount < amount) revert InvalidFlashLoan();

        // FIX #5: Validate all routers before execution
        for (uint256 i = 0; i < swapParams.swaps.length; i++) {
            if (!_isApprovedRouter(swapParams.swaps[i].dexRouter)) {
                revert RouterNotApproved();
            }
        }

        // FIX #2 & #3: Track actual balances for multi-hop swaps
        uint256 currentAmount = receivedAmount;
        
        for (uint256 i = 0; i < swapParams.swaps.length; i++) {
            Swap memory swap = swapParams.swaps[i];
            
            // For multi-hop, use actual token balance, not encoded amount
            if (i > 0) {
                currentAmount = IERC20(swap.tokenIn).balanceOf(address(this));
                
                // Safety check: ensure we have tokens to swap
                if (currentAmount == 0) revert SwapFailed();
            }
            
            // FIX #1: Handle all DEX types (previously missing 5 DEXs)
            if (swap.dexType == uint8(DEXType.UniswapV2) || 
                swap.dexType == uint8(DEXType.BaseSwap) ||
                swap.dexType == uint8(DEXType.Hydrex) ||
                swap.dexType == uint8(DEXType.AerodromeV2)) {
                // V2-style DEXs: Uniswap V2, BaseSwap, Hydrex, Aerodrome Finance
                _swapV2(swap.tokenIn, swap.tokenOut, currentAmount, swap.minAmount, swap.dexRouter);
                
            } else if (swap.dexType == uint8(DEXType.UniswapV3) ||
                       swap.dexType == uint8(DEXType.SushiSwapV3) ||
                       swap.dexType == uint8(DEXType.PancakeSwapV3) ||
                       swap.dexType == uint8(DEXType.AerodromeV3)) {
                // V3-style DEXs: Uniswap V3, SushiSwap V3, PancakeSwap V3, Aerodrome SlipStream
                _swapV3(swap.tokenIn, swap.tokenOut, currentAmount, swap.minAmount, swap.fee, swap.dexRouter);
                
            } else if (swap.dexType == uint8(DEXType.UniswapV4)) {
                // Uniswap V4
                _swapV4(swap.tokenIn, swap.tokenOut, currentAmount, swap.minAmount, swap.swapData);
                
            } else if (swap.dexType == uint8(DEXType.Curve)) {
                // FIX #3: Curve with proper pool data
                _swapCurve(swap.tokenIn, swap.tokenOut, currentAmount, swap.minAmount, swap.swapData);
                
            } else {
                revert InvalidDEX();
            }
        }

        // Calculate final balance and profit
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 totalDebt = amount + premium;
        uint256 profit = finalBalance - totalDebt;

        // Validate profit
        if (profit < swapParams.minProfitAmount) {
            revert InsufficientProfit();
        }

        // Approve Aave pool to pull borrowed amount + premium
        IERC20(asset).forceApprove(address(POOL), totalDebt);

        // Emit success event
        emit ArbitrageExecuted(
            asset,
            amount,
            profit,
            tx.gasprice * gasleft(),
            swapParams.dexPath
        );

        return true;
    }

    /**
     * @notice Execute swap on Uniswap V2-style DEX (Uniswap V2, BaseSwap, Aerodrome Finance, Hydrex)
     */
    function _swapV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address router
    ) internal {
        IERC20(tokenIn).forceApprove(router, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        IDEXRouter(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp
        );
    }

    /**
     * @notice Execute swap on Uniswap V3-style DEX (Uniswap V3, SushiSwap V3, PancakeSwap V3, Aerodrome SlipStream)
     */
    function _swapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee,
        address router
    ) internal {
        IERC20(tokenIn).forceApprove(router, amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        ISwapRouter(router).exactInputSingle(params);
    }

    /**
     * @notice Execute swap on Uniswap V4 (new architecture)
     */
    function _swapV4(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes memory swapData
    ) internal {
        IERC20(tokenIn).forceApprove(uniswapV4UniversalRouter, amountIn);

        // Use Universal Router for V4 swaps
        (bool success, ) = uniswapV4UniversalRouter.call(swapData);
        if (!success) revert SwapFailed();
    }

    /**
     * @notice Execute swap on Curve (FIXED VERSION)
     * @dev Now properly decodes pool address and token indices from swapData
     */
    function _swapCurve(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes memory swapData
    ) internal {
        // FIX #3: Decode pool address and token indices from swapData
        (address pool, int128 i, int128 j) = abi.decode(swapData, (address, int128, int128));
        
        // Approve the pool directly (not the router)
        IERC20(tokenIn).forceApprove(pool, amountIn);
        
        // Call the pool's exchange function with proper token indices
        ICurvePool(pool).exchange(i, j, amountIn, amountOutMin);
    }

    /**
     * @notice Check if a router is approved for use
     */
    function _isApprovedRouter(address router) internal view returns (bool) {
        return router == uniswapV2Router ||
               router == uniswapV3Router ||
               router == uniswapV4UniversalRouter ||
               router == curveRouter ||
               router == sushiswapV3Router ||
               router == pancakeSwapV3Router ||
               router == aerodromeRouter ||
               router == aerodromeSlipStreamRouter ||
               router == aerodromeSlipStream2Router ||
               router == baseSwapRouter ||
               router == hydrexRouter;
    }

    /**
     * @notice Update owner
     */
    function updateOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /**
     * @notice Pause/unpause contract
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedUpdated(_paused);
    }

    /**
     * @notice Update execution parameters
     */
    function updateParameters(uint256 _minProfit, uint256 _maxGasPrice) external onlyOwner {
        minProfit = _minProfit;
        maxGasPrice = _maxGasPrice;
        emit ParametersUpdated(_minProfit, _maxGasPrice);
    }

    /**
     * @notice Update DEX router addresses
     */
    function updateRouter(string calldata dex, address router) external onlyOwner {
        if (router == address(0)) revert InvalidRouter();
        
        if (keccak256(bytes(dex)) == keccak256(bytes("uniswapV4PoolManager"))) {
            uniswapV4PoolManager = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("uniswapV4UniversalRouter"))) {
            uniswapV4UniversalRouter = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("uniswapV3Router"))) {
            uniswapV3Router = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("uniswapV2Router"))) {
            uniswapV2Router = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("curveRouter"))) {
            curveRouter = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("sushiswapV3Router"))) {
            sushiswapV3Router = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("pancakeSwapV3Router"))) {
            pancakeSwapV3Router = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("uniswapV2Router"))) {
            aerodromeRouter = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("aerodromeSlipStreamRouter"))) {
            aerodromeSlipStreamRouter = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("aerodromeSlipStream2Router"))) {
            aerodromeSlipStream2Router = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("baseSwapRouter"))) {
            baseSwapRouter = router;
        } else if (keccak256(bytes(dex)) == keccak256(bytes("hydrexRouter"))) {
            hydrexRouter = router;
        } else {
            revert InvalidDEX();
        }
        
        emit RouterUpdated(dex, router);
    }

    /**
     * @notice Withdraw stuck tokens
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }

    /**
     * @notice Withdraw ETH
     */
    function withdrawETH() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {}
}