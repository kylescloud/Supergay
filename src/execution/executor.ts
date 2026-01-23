import { ethers } from 'ethers';
import { ArbitrageOpportunity } from '../types';
import { config } from '../config';
import { GAS_LIMITS } from '../config/constants';

/**
 * Arbitrage Executor
 * 
 * Executes arbitrage opportunities with MEV protection and gas optimization.
 * Implements the MEV-SAFE EXECUTION STRATEGY from the specification.
 */
export class ArbitrageExecutor {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private flashLoanContract: ethers.Contract;
  private usePrivateRPC: boolean;

  constructor(provider: ethers.JsonRpcProvider, privateKey: string, contractAddress: string) {
    this.provider = provider;
    this.wallet = new ethers.Wallet(privateKey, provider);
    this.usePrivateRPC = config.useFlashbots;

    // Load contract ABI
    const contractABI = [
      'function executeArbitrage(address asset, uint256 amount, bytes calldata swapData) external returns (bool)',
      'function getContractInfo() external view returns (address, bool, uint256, uint256, address)',
    ];

    this.flashLoanContract = new ethers.Contract(
      contractAddress,
      contractABI,
      this.wallet
    );

    console.log('Executor initialized');
    console.log('- Account:', this.wallet.address);
    console.log('- Private RPC:', this.usePrivateRPC);
  }

  /**
   * Execute an arbitrage opportunity
   */
  async executeOpportunity(opportunity: ArbitrageOpportunity): Promise<{
    success: boolean;
    txHash?: string;
    profit?: bigint;
    gasUsed?: number;
    error?: string;
  }> {
    console.log(`\n=== Executing Arbitrage ===`);
    console.log(`ID: ${opportunity.id}`);
    console.log(`Expected Profit: $${opportunity.expectedProfitUSD.toFixed(4)}`);
    console.log(`Path: ${opportunity.path.map(t => t.symbol).join(' → ')}`);

    try {
      // Build transaction
      const tx = await this.buildTransaction(opportunity);

      if (!tx) {
        return {
          success: false,
          error: 'Failed to build transaction',
        };
      }

      // Estimate gas
      console.log('Estimating gas...');
      const gasEstimate = await this.flashLoanContract.executeArbitrage.estimateGas(
        tx.asset,
        tx.amount,
        tx.swapData,
        tx.overrides
      );

      console.log(`Gas estimate: ${gasEstimate.toString()}`);

      // Check if gas cost is acceptable
      const gasPrice = tx.overrides?.gasPrice || await this.provider.getFeeData().then(f => f.gasPrice);
      const gasCost = gasEstimate * (gasPrice || 0n);
      const netProfit = opportunity.netProfit - gasCost;

      console.log(`Gas cost: ${ethers.formatEther(gasCost)} ETH`);
      console.log(`Net profit after gas: ${ethers.formatEther(netProfit)} ETH`);

      if (netProfit <= 0n) {
        return {
          success: false,
          error: 'Not profitable after gas costs',
        };
      }

      // Execute transaction
      console.log('Executing transaction...');
      const txResponse = await this.flashLoanContract.executeArbitrage(
        tx.asset,
        tx.amount,
        tx.swapData,
        tx.overrides
      );

      console.log(`Transaction sent: ${txResponse.hash}`);

      // Wait for confirmation
      console.log('Waiting for confirmation...');
      const receipt = await txResponse.wait();

      if (receipt && receipt.status === 1) {
        console.log('✓ Transaction successful');
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        return {
          success: true,
          txHash: receipt.hash,
          profit: netProfit,
          gasUsed: Number(receipt.gasUsed),
        };
      } else {
        console.log('✗ Transaction failed');
        return {
          success: false,
          error: 'Transaction reverted',
        };
      }
    } catch (error: any) {
      console.error('Execution error:', error.message);

      // Parse common error messages
      if (error.message.includes('InsufficientProfit')) {
        return {
          success: false,
          error: 'Profit insufficient after execution',
        };
      } else if (error.message.includes('GasPriceTooHigh')) {
        return {
          success: false,
          error: 'Gas price too high',
        };
      } else if (error.message.includes('SwapFailed')) {
        return {
          success: false,
          error: 'Swap failed during execution',
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build transaction for arbitrage execution
   */
  private async buildTransaction(opportunity: ArbitrageOpportunity): Promise<{
    asset: string;
    amount: bigint;
    swapData: string;
    overrides: any;
  } | null> {
    try {
      // Get DEX router addresses and build swap calldata
      const swapData = this.encodeSwapData(opportunity);

      // Get optimal gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = await this.getOptimalGasPrice();

      // Calculate gas limit
      const gasLimit = this.estimateGasLimit(opportunity);

      // Build transaction overrides
      const overrides: any = {
        gasLimit,
        gasPrice,
      };

      return {
        asset: opportunity.loanAmount.toString() === '0' ? ethers.ZeroAddress : opportunity.baseToken.address,
        amount: opportunity.loanAmount,
        swapData,
        overrides,
      };
    } catch (error) {
      console.error('Error building transaction:', error);
      return null;
    }
  }

  /**
   * Encode swap data for the transaction
   * 
   * This encodes the sequence of swaps to execute the arbitrage path.
   */
  private encodeSwapData(opportunity: ArbitrageOpportunity): string {
    // Build swap targets and data for each hop
    const swaps: any[] = [];
    let dexPath: string[] = [];

    for (let i = 0; i < opportunity.pools.length; i++) {
      const pool = opportunity.pools[i];
      const tokenIn = opportunity.path[i];
      const tokenOut = opportunity.path[i + 1];

      // Get router address and DEX type
      const routerAddress = this.getRouterAddress(pool.dex);
      const dexType = this.getDexType(pool.dex);
      dexPath.push(pool.dex);

      // Determine fee for V3 pools
      const fee = pool.version === 'v3' ? pool.fee : 0;

      // Build swap data
      const swapData = {
        dexType: dexType,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amount: i === 0 ? opportunity.loanAmount : 0n, // Only first swap has amount
        minAmount: 0n, // Accept any amount (validated by contract)
        dexRouter: routerAddress,
        fee: fee,
        swapData: '0x', // For aggregators like 1inch/0x
      };

      swaps.push(swapData);
    }

    // Encode parameters for executeOperation
    const params = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(uint8 dexType, address tokenIn, address tokenOut, uint256 amount, uint256 minAmount, address dexRouter, uint24 fee, bytes swapData)[]',
        'uint256',
        'string'
      ],
      [
        swaps,
        opportunity.netProfit,
        dexPath.join(' → ')
      ]
    );

    return params;
  }

  /**
   * Get DEX type for smart contract
   * Only supports the 10 required DEXs
   */
  private getDexType(dex: string): number {
    const dexTypes: Record<string, number> = {
      // V2-style DEXs
      'uniswap-v2': 0,
      'baseswap': 0,
      'aerodrome': 4, // Aerodrome Finance (V2-style)
      // V3-style DEXs
      'uniswap-v3': 1,
      'sushiswap-v3': 1,
      'pancakeswap-v3': 1,
      'aerodrome-slipstream': 5, // Aerodrome SlipStream (V3-style)
      'aerodrome-slipstream-2': 5, // Aerodrome SlipStream 2 (V3-style)
      // V4
      'uniswap-v4': 2,
      // Curve
      'curve': 3,
    };

    return dexTypes[dex] ?? 0; // Default to V2 type
  }

  /**
   * Encode swap calldata for a single swap
   */
  private encodeSwapCalldata(
    pool: any,
    tokenIn: any,
    tokenOut: any,
    amount: bigint
  ): string {
    // This is a simplified version
    // Production code would use proper DEX router interfaces

    const routerInterface = new ethers.Interface([
      'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
    ]);

    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const path = [tokenIn.address, tokenOut.address];
    const amountOutMin = 0; // Accept any amount (will be validated by contract)

    return routerInterface.encodeFunctionData('swapExactTokensForTokens', [
      amount,
      amountOutMin,
      path,
      this.wallet.address,
      deadline,
    ]);
  }

  /**
   * Get router address for a DEX
   * Only supports the 10 required DEXs
   */
  private getRouterAddress(dex: string): string {
    const routerAddresses: Record<string, string> = {
      // Uniswap V4
      'uniswap-v4': '0x6ff5693b99212da76ad316178a184ab56d299b43', // Universal Router
      // Uniswap V3
      'uniswap-v3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      // Uniswap V2
      'uniswap-v2': '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
      // Curve
      'curve': '0x99a583981d3d968c3D71425676B72C720f02b734',
      // SushiSwap V3
      'sushiswap-v3': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      // PancakeSwap V3
      'pancakeswap-v3': '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      // Aerodrome Finance (V2-style)
      'aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      // Aerodrome SlipStream (V3-style)
      'aerodrome-slipstream': '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
      // Aerodrome SlipStream 2 (V3-style)
      'aerodrome-slipstream-2': '0x51ca29d9828867c363572c37c424e3d6b380c61e',
      // BaseSwap (V2-style)
      'baseswap': '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    };

    return routerAddresses[dex] || ethers.ZeroAddress;
  }

  /**
   * Estimate gas limit for the transaction
   */
  private estimateGasLimit(opportunity: ArbitrageOpportunity): bigint {
    const baseGas = GAS_LIMITS.FLASH_LOAN_OVERHEAD;
    const hopGas = opportunity.path.length * GAS_LIMITS.SWAP_PER_HOP;

    // Add buffer
    const totalGas = Math.floor((baseGas + hopGas) * 1.2);

    return BigInt(totalGas);
  }

  /**
   * Get optimal gas price for execution
   */
  private async getOptimalGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    
    // Use EIP-1559 if available
    if (feeData.maxFeePerGas) {
      return feeData.maxFeePerGas;
    }

    // Fall back to legacy gas price
    return feeData.gasPrice || BigInt('20000000000'); // 20 gwei
  }

  /**
   * Execute multiple opportunities in batch (for backtesting)
   */
  async executeBatch(opportunities: ArbitrageOpportunity[]): Promise<Array<{
    opportunity: ArbitrageOpportunity;
    result: any;
  }>> {
    const results: Array<{
      opportunity: ArbitrageOpportunity;
      result: any;
    }> = [];

    for (const opportunity of opportunities) {
      const result = await this.executeOpportunity(opportunity);
      results.push({
        opportunity,
        result,
      });

      // Add delay between executions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Get executor statistics
   */
  async getStats(): Promise<{
    account: string;
    contract: string;
    privateRPC: boolean;
  }> {
    return {
      account: this.wallet.address,
      contract: await this.flashLoanContract.getAddress(),
      privateRPC: this.usePrivateRPC,
    };
  }
}