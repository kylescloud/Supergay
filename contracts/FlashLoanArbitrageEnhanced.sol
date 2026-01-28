// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";

/**
 * @title FlashLoanArbitrageEnhanced
 * @dev Enhanced flash loan arbitrage contract with automated execution support
 * Supports multiple DEXs and advanced routing on Base Network
 */
contract FlashLoanArbitrageEnhanced is FlashLoanSimpleReceiverBase, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // Aave V3 Pool on Base
    address public constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4b422E3588869B8325B;
    
    // Common token addresses on Base
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913;
    address public constant USDbC = 0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA;
    address public constant DAI = 0x50C5725949A6F0c72E6C4a641F24049A917DB0Cb;
    
    // DEX Router addresses
    address public uniswapV2Router = 0x4752ba5DBC23f44D87826276BF6Fd6b1C1252c36;
    address public uniswapV3Router = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address public aerodromeRouter = 0xcfE90b3E7d4C8b2d11C5115D6240226F2F5fd937;
    address public alienBaseRouter = 0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7;
    address public swapBasedRouter = 0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066;
    
    // Additional DEX Routers (6 missing DEXs added)
    address public sushiswapV3Router = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    address public pancakeSwapV3Router = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address public baseSwapRouter = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public aerodromeSlipStreamRouter = 0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5;
    address public aerodromeSlipStream2Router = 0x51ca29d9828867C363572C37c424E3d6b380c61e;
    address public hydrexRouter = 0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7; // V2-style, same as AlienBase
    
    // Route structure
    struct Route {
        string dex;
        address[] pools;
        address[] path;
        uint256 minProfit;
        uint256 deadline;
    }
    
    // Execution statistics
    struct ExecutionStats {
        uint256 totalExecutions;
        uint256 successfulExecutions;
        uint256 failedExecutions;
        uint256 totalProfit;
        uint256 totalGasUsed;
    }
    
    ExecutionStats public stats;
    
    // Events
    event ArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        Route[] routes,
        uint256 gasUsed
    );
    
    event FlashLoanReceived(
        address indexed asset,
        uint256 amount,
        uint256 premium
    );
    
    event ArbitrageFailed(
        address indexed asset,
        uint256 amount,
        string reason
    );
    
    event RouteExecuted(
        string indexed dex,
        uint256 amountIn,
        uint256 amountOut,
        uint256 gasUsed
    );
    
    event ProfitCollected(
        address indexed token,
        uint256 amount
    );

    constructor() FlashLoanSimpleReceiverBase(AAVE_POOL) Ownable(msg.sender) {}

    /**
     * @dev Main entry point for arbitrage execution
     * @param asset The asset to borrow
     * @param amount The amount to borrow
     * @param routes Array of routes for swaps
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        Route[] calldata routes
    ) external onlyOwner returns (bool) {
        require(amount > 0, "Amount must be greater than 0");
        require(routes.length > 0, "At least one route required");
        require(!paused(), "Contract is paused");
        
        // Update stats
        stats.totalExecutions++;
        
        // Get balance before
        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        
        // Request flash loan from Aave
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            abi.encode(routes),
            0 // referral code
        );
        
        // Get balance after
        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        
        require(balanceAfter > balanceBefore, "No profit made");
        
        uint256 profit = balanceAfter - balanceBefore;
        
        // Update stats
        stats.successfulExecutions++;
        stats.totalProfit += profit;
        
        emit ArbitrageExecuted(asset, amount, profit, routes, 0);
        
        // Transfer profit to owner
        IERC20(asset).safeTransfer(owner(), profit);
        emit ProfitCollected(asset, profit);
        
        return true;
    }
    
    /**
     * @dev Callback function for Aave flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == AAVE_POOL, "Only Aave pool can call");
        require(initiator == address(this), "Invalid initiator");
        
        emit FlashLoanReceived(asset, amount, premium);
        
        // Decode routes
        Route[] memory routes = abi.decode(params, (Route[]));
        
        // Execute arbitrage trades
        try this.executeArbitrageTrades(asset, amount, routes) {
            // Calculate amount to repay (principal + premium)
            uint256 amountToRepay = amount + premium;
            uint256 currentBalance = IERC20(asset).balanceOf(address(this));
            
            require(currentBalance >= amountToRepay, "Insufficient balance to repay");
            
            // Approve Aave pool to pull the repayment
            IERC20(asset).safeApprove(AAVE_POOL, amountToRepay);
            
            return true;
        } catch Error(string memory reason) {
            stats.failedExecutions++;
            emit ArbitrageFailed(asset, amount, reason);
            revert(reason);
        } catch {
            stats.failedExecutions++;
            emit ArbitrageFailed(asset, amount, "Unknown error");
            revert("Arbitrage execution failed");
        }
    }
    
    /**
     * @dev Execute the actual arbitrage trades across DEXs
     */
    function executeArbitrageTrades(
        address asset,
        uint256 amount,
        Route[] memory routes
    ) external returns (uint256) {
        require(msg.sender == address(this), "Only this contract can call");
        
        uint256 balance = amount;
        
        for (uint256 i = 0; i < routes.length; i++) {
            Route memory route = routes[i];
            uint256 balanceBefore = balance;
            
            if (keccak256(bytes(route.dex)) == keccak256(bytes("UniswapV2"))) {
                balance = executeUniswapV2Swap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("UniswapV3"))) {
                balance = executeUniswapV3Swap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("Aerodrome"))) {
                balance = executeAerodromeSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("AlienBase"))) {
                balance = executeAlienBaseSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("SwapBased"))) {
                balance = executeSwapBasedSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("SushiSwapV3"))) {
                balance = executeSushiSwapV3Swap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("PancakeSwapV3"))) {
                balance = executePancakeSwapV3Swap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("BaseSwap"))) {
                balance = executeBaseSwapSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("AerodromeSlipStream"))) {
                balance = executeAerodromeSlipStreamSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("AerodromeSlipStream2"))) {
                balance = executeAerodromeSlipStream2Swap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("Hydrex"))) {
                balance = executeHydrexSwap(route.pools, route.path, balance, route.deadline);
            } else if (keccak256(bytes(route.dex)) == keccak256(bytes("MultiDEX"))) {
                balance = executeMultiDEXSwap(route.pools, route.path, balance, route.deadline);
            } else {
                // Default to UniswapV2 for unknown DEXs
                balance = executeUniswapV2Swap(route.pools, route.path, balance, route.deadline);
            }
            
            emit RouteExecuted(route.dex, balanceBefore, balance, 0);
            
            // Check minimum profit requirement for this route
            if (route.minProfit > 0) {
                uint256 profit = balance - balanceBefore;
                require(profit >= route.minProfit, "Route profit below minimum");
            }
        }
        
        return balance;
    }
    
    /**
     * @dev Execute swap on Uniswap V2
     */
    function executeUniswapV2Swap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        uint256 amountOut = amountIn;
        
        for (uint256 i = 0; i < pools.length && i < path.length - 1; i++) {
            address pool = pools[i];
            address tokenIn = path[i];
            address tokenOut = path[i + 1];
            
            // Get pool reserves
            (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pool).getReserves();
            (address token0, ) = IUniswapV2Pair(pool).tokens();
            
            // Calculate output amount with 0.3% fee
            uint256 amountInForSwap = amountOut;
            if (tokenIn == token0) {
                amountOut = (amountInForSwap * uint256(reserve1)) / uint256(reserve0) * 997 / 1000;
            } else {
                amountOut = (amountInForSwap * uint256(reserve0)) / uint256(reserve1) * 997 / 1000;
            }
            
            // Approve and swap
            IERC20(tokenIn).safeApprove(pool, amountInForSwap);
            IUniswapV2Pair(pool).swap(
                tokenIn == token0 ? 0 : amountOut,
                tokenIn == token0 ? amountOut : 0,
                address(this),
                new bytes(0)
            );
            IERC20(tokenIn).safeApprove(pool, 0);
        }
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on Uniswap V3
     */
    function executeUniswapV3Swap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        // For V3, we'll use the router
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: path[0],
            tokenOut: path[1],
            fee: 3000, // 0.3% fee
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        IERC20(path[0]).safeApprove(uniswapV3Router, amountIn);
        
        // Execute swap via router
        uint256 amountOut = ISwapRouter(uniswapV3Router).exactInputSingle(params);
        
        IERC20(path[0]).safeApprove(uniswapV3Router, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on Aerodrome
     */
    function executeAerodromeSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        return executeUniswapV2Swap(pools, path, amountIn, deadline);
    }
    
    /**
     * @dev Execute swap on AlienBase
     */
    function executeAlienBaseSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        return executeUniswapV2Swap(pools, path, amountIn, deadline);
    }
    
    /**
     * @dev Execute swap on SwapBased
     */
    function executeSwapBasedSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        return executeUniswapV2Swap(pools, path, amountIn, deadline);
    }
    
    /**
     * @dev Execute swap on SushiSwap V3
     */
    function executeSushiSwapV3Swap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: path[0],
            tokenOut: path[1],
            fee: 3000,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        IERC20(path[0]).safeApprove(sushiswapV3Router, amountIn);
        uint256 amountOut = ISwapRouter(sushiswapV3Router).exactInputSingle(params);
        IERC20(path[0]).safeApprove(sushiswapV3Router, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on PancakeSwap V3
     */
    function executePancakeSwapV3Swap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: path[0],
            tokenOut: path[1],
            fee: 3000,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        IERC20(path[0]).safeApprove(pancakeSwapV3Router, amountIn);
        uint256 amountOut = ISwapRouter(pancakeSwapV3Router).exactInputSingle(params);
        IERC20(path[0]).safeApprove(pancakeSwapV3Router, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on BaseSwap
     */
    function executeBaseSwapSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        return executeUniswapV2Swap(pools, path, amountIn, deadline);
    }
    
    /**
     * @dev Execute swap on Aerodrome SlipStream
     */
    function executeAerodromeSlipStreamSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: path[0],
            tokenOut: path[1],
            fee: 3000,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        IERC20(path[0]).safeApprove(aerodromeSlipStreamRouter, amountIn);
        uint256 amountOut = ISwapRouter(aerodromeSlipStreamRouter).exactInputSingle(params);
        IERC20(path[0]).safeApprove(aerodromeSlipStreamRouter, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on Aerodrome SlipStream 2
     */
    function executeAerodromeSlipStream2Swap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        require(pools.length > 0, "No pools provided");
        require(path.length >= 2, "Invalid path");
        require(block.timestamp <= deadline, "Transaction expired");
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: path[0],
            tokenOut: path[1],
            fee: 3000,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        
        IERC20(path[0]).safeApprove(aerodromeSlipStream2Router, amountIn);
        uint256 amountOut = ISwapRouter(aerodromeSlipStream2Router).exactInputSingle(params);
        IERC20(path[0]).safeApprove(aerodromeSlipStream2Router, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Execute swap on Hydrex
     */
    function executeHydrexSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        return executeUniswapV2Swap(pools, path, amountIn, deadline);
    }
    
    /**
     * @dev Execute multi-DEX swap
     */
    function executeMultiDEXSwap(
        address[] memory pools,
        address[] memory path,
        uint256 amountIn,
        uint256 deadline
    ) internal returns (uint256) {
        // Try each DEX in sequence until one succeeds
        uint256 amountOut = amountIn;
        
        // Try Uniswap V2
        try this.executeUniswapV2Swap(pools, path, amountOut, deadline) returns (uint256 result) {
            return result;
        } catch {
            // Try Aerodrome
            try this.executeAerodromeSwap(pools, path, amountOut, deadline) returns (uint256 result) {
                return result;
            } catch {
                // Try AlienBase
                return this.executeAlienBaseSwap(pools, path, amountOut, deadline);
            }
        }
    }
    
    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Set DEX router addresses
     */
    function setRouters(
        address _uniswapV2Router,
        address _uniswapV3Router,
        address _aerodromeRouter,
        address _alienBaseRouter,
        address _swapBasedRouter
    ) external onlyOwner {
        uniswapV2Router = _uniswapV2Router;
        uniswapV3Router = _uniswapV3Router;
        aerodromeRouter = _aerodromeRouter;
        alienBaseRouter = _alienBaseRouter;
        swapBasedRouter = _swapBasedRouter;
    }
    
    /**
     * @dev Set additional DEX router addresses
     */
    function setAdditionalRouters(
        address _sushiswapV3Router,
        address _pancakeSwapV3Router,
        address _baseSwapRouter,
        address _aerodromeSlipStreamRouter,
        address _aerodromeSlipStream2Router,
        address _hydrexRouter
    ) external onlyOwner {
        sushiswapV3Router = _sushiswapV3Router;
        pancakeSwapV3Router = _pancakeSwapV3Router;
        baseSwapRouter = _baseSwapRouter;
        aerodromeSlipStreamRouter = _aerodromeSlipStreamRouter;
        aerodromeSlipStream2Router = _aerodromeSlipStream2Router;
        hydrexRouter = _hydrexRouter;
    }
    
    /**
     * @dev Withdraw tokens from contract
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    /**
     * @dev Withdraw ETH from contract
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }
    
    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {}
}

// Interfaces
interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function tokens() external view returns (address token0, address token1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}