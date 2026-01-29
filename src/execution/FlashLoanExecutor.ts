import { ethers } from 'ethers';
import FlashLoanArbitrageArtifact from '../../artifacts/contracts/FlashLoanArbitrage.sol/FlashLoanArbitrage.json';
import { PRIVATE_RPC_NODES } from '../config/constants';
import fs from 'fs';

interface Opportunity {
  id: string;
  timestamp: number;
  strategy: string;
  profitPercent: number;
  path: string[];
  pools: string[];
  estimatedGas: number;
  profitAfterGas: number;
  status: 'detected' | 'executed' | 'skipped' | 'failed';
}

// DEX Type enum matching the contract
enum DEXType {
  UniswapV2 = 0,
  UniswapV3 = 1,
  UniswapV4 = 2,
  Curve = 3,
  AerodromeV2 = 4,
  AerodromeV3 = 5,
  SushiSwapV3 = 6,
  PancakeSwapV3 = 7,
  BaseSwap = 8,
  Hydrex = 9
}

interface Swap {
  dexType: number;      // 0: V2, 1: V3, 2: V4, 3: Curve
  tokenIn: string;      // Input token address
  tokenOut: string;     // Output token address
  amount: bigint;       // Amount to swap
  minAmount: bigint;    // Minimum amount out (slippage protection)
  dexRouter: string;    // DEX router address
  fee: number;          // Fee tier (for V3)
  swapData: string;     // Encoded swap data (for V4)
}

interface SwapParams {
  swaps: Swap[];           // Array of swaps to execute
  minProfitAmount: bigint; // Minimum profit required
  dexPath: string;         // String representation of DEX path
}

interface FlashLoanParams {
  asset: string;
  amount: bigint;
  swapParams: SwapParams;
}

export class FlashLoanExecutor {
  private provider: ethers.JsonRpcProvider;
  private backupProvider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet;
  private flashLoanContract: ethers.Contract;
  private config: any;
  private executionHistory: Map<string, any> = new Map();
  private currentRPCIndex: number = 0;
  
  // DEX Router addresses (must match contract) - all lowercase for checksumming
  private readonly DEX_ROUTERS: Record<string, string> = {
    UniswapV2: '0x4752ba5dbc23f44d87826276bf6fd6b1c1252c36',
    UniswapV3: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
    UniswapV4: '0x33128a8fc17869897dce68ed026d694621f6fdfd', // Universal router
    Curve: '0x445fe580ef8d70ff569ab36e80c647af338db351',
    AerodromeV2: '0xcfe90b3e7d4c8b2d11c5115d6240226f2f5fd937',
    AerodromeV3: '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
    SushiSwapV3: '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506',
    PancakeSwapV3: '0x1b81d678ffb9c0263b24a97847620c99d213eb14',
    BaseSwap: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    Hydrex: '0x8c1a3cf8f83074169fe5d7ad50b978e1cd6b37c7',
    // Aliases for various identifier formats
    Aerodrome: '0xcfe90b3e7d4c8b2d11c5115d6240226f2f5fd937',
    'Aerodrome SlipStream': '0xbe6d8f0d05cc4be24d5167a3ef062215be6d18a5',
    'Aerodrome SlipStream 2': '0x51ca29d9828867c363572c37c424e3d6b380c61e',
    'SushiSwap V3': '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506',
    'PancakeSwap V3': '0x1b81d678ffb9c0263b24a97847620c99d213eb14'
  };

  // Token addresses map
  private tokenAddresses: Record<string, string> = {};

  constructor(
    privateKey: string,
    contractAddress: string,
    providerUrl?: string
  ) {
    // Use private RPC by default, fallback to provided URL or public RPC
    const rpcUrl = providerUrl || PRIVATE_RPC_NODES[0];
    
    // Initialize primary provider with private RPC
    this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
      batchMaxCount: 10,
      batchStallTime: 10
    });
    
    // Initialize backup provider if available
    if (PRIVATE_RPC_NODES.length > 1) {
      this.backupProvider = new ethers.JsonRpcProvider(PRIVATE_RPC_NODES[1], undefined, {
        staticNetwork: true,
        batchMaxCount: 10,
        batchStallTime: 10
      });
    }
    
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.flashLoanContract = new ethers.Contract(
      contractAddress,
      FlashLoanArbitrageArtifact.abi,
      this.wallet
    );
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const configData = fs.readFileSync('config.json', 'utf-8');
      this.config = JSON.parse(configData);
    } catch (error) {
      console.warn('Could not load config.json, using defaults');
      this.config = {
        minProfitPercent: 0.1,
        maxGasPrice: 50000000000
      };
    }
  }

  /**
   * Load token addresses from pool registry
   */
  private loadTokenAddresses(pools: any[]) {
    const tokenMap: Record<string, string> = {};
    
    for (const pool of pools) {
      if (pool.token0) {
        tokenMap[pool.token0] = pool.token0;
      }
      if (pool.token1) {
        tokenMap[pool.token1] = pool.token1;
      }
    }
    
    // Add common tokens
    tokenMap['WETH'] = '0x4200000000000000000000000000000000000006';
    tokenMap['USDC'] = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    tokenMap['USDbC'] = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
    tokenMap['DAI'] = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';
    
    this.tokenAddresses = tokenMap;
    console.log(`Loaded ${Object.keys(tokenMap).length} token addresses`);
  }

  /**
   * Get token address with validation - CRITICAL FIX #1
   * Throws error if token symbol not found instead of falling back to WETH
   */
  private getTokenAddress(symbol: string, required: boolean = true): string {
    const address = this.tokenAddresses[symbol.toLowerCase()];
    
    if (!address && required) {
      throw new Error(`Token address not found for symbol: ${symbol}. Available tokens: ${Object.keys(this.tokenAddresses).join(', ')}`);
    }
    
    if (!address) {
      throw new Error(`Unknown token symbol: ${symbol}. Please add to token addresses.`);
    }
    
    return checksumAddress(address);
  }
  
  private async testRPCConnection(rpcUrl: string): Promise<boolean> {
    try {
      const testProvider = new ethers.JsonRpcProvider(rpcUrl);
      await testProvider.getBlockNumber();
      return true;
    } catch (error) {
      console.log(`   ⚠️  RPC connection test failed for ${rpcUrl}`);
      return false;
    }
  }
  
  private async switchToBackupRPC(): Promise<void> {
    if (!this.backupProvider) {
      throw new Error('No backup RPC available');
    }
    
    const backupConnected = await this.testRPCConnection(PRIVATE_RPC_NODES[1]);
    if (backupConnected) {
      this.provider = this.backupProvider!;
      this.wallet = new ethers.Wallet(this.wallet.privateKey, this.provider);
      this.flashLoanContract = new ethers.Contract(
        this.flashLoanContract.target as string,
        FlashLoanArbitrageArtifact.abi,
        this.wallet
      );
      this.currentRPCIndex = 1;
      console.log('   🔄 Switched to backup private RPC');
    } else {
      throw new Error('All private RPCs failed');
    }
  }
  
  private async ensureRPCHealth(): Promise<void> {
    try {
      await this.provider.getBlockNumber();
    } catch (error) {
      console.log('   ⚠️  Primary RPC failed, attempting to switch...');
      await this.switchToBackupRPC();
    }
  }

  async executeOpportunity(opportunity: Opportunity): Promise<boolean> {
    console.log(`\n🚀 Executing opportunity: ${opportunity.id}`);
    console.log(`   Strategy: ${opportunity.strategy}`);
    console.log(`   Profit: ${opportunity.profitPercent.toFixed(4)}%`);
    console.log(`   Profit after gas: ${opportunity.profitAfterGas.toFixed(4)}%`);

    try {
      // Ensure RPC health before execution
      await this.ensureRPCHealth();
      
      // Check if opportunity meets minimum threshold
      const minProfit = this.config.minProfitPercent || 0.1;
      if (opportunity.profitAfterGas < minProfit) {
        console.log(`   ❌ Profit below threshold (${minProfit}%). Skipping.`);
        opportunity.status = 'skipped';
        return false;
      }

      // Determine flash loan asset and amount
      const flashLoanParams = this.buildFlashLoanParams(opportunity);
      console.log(`   Flash loan asset: ${flashLoanParams.asset}`);
      console.log(`   Flash loan amount: ${ethers.formatEther(flashLoanParams.amount)} tokens`);
      console.log(`   Number of swaps: ${flashLoanParams.swapParams.swaps.length}`);
      console.log(`   DEX path: ${flashLoanParams.swapParams.dexPath}`);
      console.log(`   Min profit amount: ${ethers.formatEther(flashLoanParams.swapParams.minProfitAmount)} tokens`);

      // Estimate gas cost
      const gasEstimate = await this.estimateGasCost(opportunity, flashLoanParams);
      console.log(`   Estimated gas cost: ${ethers.formatEther(gasEstimate)} ETH`);

      // Check if still profitable after actual gas estimate
      const feeData1 = await this.provider.getFeeData();
      const gasPrice1 = feeData1.gasPrice || BigInt(0);
      const actualGasCostWei = gasEstimate * gasPrice1;
      const actualGasCostPercent = Number(ethers.formatEther(actualGasCostWei)) * 100;
      const finalProfitPercent = opportunity.profitPercent - actualGasCostPercent;

      if (finalProfitPercent < minProfit) {
        console.log(`   ❌ Not profitable after gas cost (${finalProfitPercent.toFixed(4)}% < ${minProfit}%). Skipping.`);
        opportunity.status = 'skipped';
        return false;
      }

      // Get current gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);
      const maxFeePerGas = feeData.maxFeePerGas || gasPrice;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || BigInt(0);

      console.log(`   Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

      // Execute the flash loan arbitrage
      const tx = await this.executeFlashLoan(flashLoanParams, {
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas
      });

      console.log(`   ✅ Transaction submitted: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt!.status === 1) {
        console.log(`   ✅ Transaction successful! Block: ${receipt!.blockNumber}`);
        console.log(`   Gas used: ${receipt!.gasUsed.toString()}`);
        console.log(`   Actual profit: ${finalProfitPercent.toFixed(4)}%`);

        opportunity.status = 'executed';
        this.recordExecution(opportunity, tx, receipt!);

        return true;
      } else {
        console.log(`   ❌ Transaction failed`);
        opportunity.status = 'failed';
        return false;
      }

    } catch (error: any) {
      console.log(`   ❌ Execution error: ${error?.message || 'Unknown error'}`);
      opportunity.status = 'failed';
      this.recordExecution(opportunity, null, null, error);
      return false;
    }
  }

  private buildFlashLoanParams(opportunity: Opportunity): FlashLoanParams {
    // Determine the best asset to borrow for flash loan
    const path = opportunity.path;
    const pools = opportunity.pools;
    
    // Token addresses on Base (proper checksummed addresses)
    const wethAddress = '0x4200000000000000000000000000000000000006';
    const usdcAddress = '0x833589fcd6ede6e08f4c7c32d4f71b54bda02913';
    const usdbCAddress = '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca';
    const daiAddress = '0x50c5725949a6f0c72e6c4a641f24049a917db0cb';
    
    // Use a simple checksum function for addresses
    const checksumAddress = (addr: string): string => {
      try {
        return ethers.getAddress(addr);
      } catch {
        return addr; // Return as-is if checksumming fails
      }
    };

    // Token symbol to address mapping (with checksumming)
    const tokenAddresses: Record<string, string> = {
      'WETH': checksumAddress(wethAddress),
      'ETH': checksumAddress(wethAddress),
      'USDC': checksumAddress(usdcAddress),
      'USDbC': checksumAddress(usdbCAddress),
      'DAI': checksumAddress(daiAddress)
    };

    // Choose USDC if it's in the path, otherwise use WETH
    const flashLoanAssetSymbol = path.some(p => p === 'USDC' || p === 'USDbC') ? 'USDC' : 'WETH';
    
    // CRITICAL FIX #1: Validate flash loan asset exists
    if (!tokenAddresses[flashLoanAssetSymbol]) {
      throw new Error(`Flash loan asset ${flashLoanAssetSymbol} not found in token addresses`);
    }
    const flashLoanAsset = tokenAddresses[flashLoanAssetSymbol];

    // Calculate flash loan amount (use a reasonable amount)
    // Start with $10,000 worth of tokens
    const flashLoanAmount = ethers.parseUnits('10000', flashLoanAssetSymbol === 'USDC' ? 6 : 18);

    // Get dexTypes and dexIdentifiers from opportunity
    const dexTypes = (opportunity as any).dexTypes || ['MultiDEX'];
    const dexIdentifiers = (opportunity as any).dexIdentifiers || ['MultiDEX'];
    
    // Get pool fees if available
    const poolFees = (opportunity as any).poolFees || [];

    // Build swaps array
    const swaps: Swap[] = [];
    const dexPath: string[] = [];
    
    for (let i = 0; i < pools.length; i++) {
      const dexIdentifier = dexIdentifiers[i] || dexTypes[i] || 'MultiDEX';
      const poolFee = poolFees[i] || 3000; // Default to 0.3% if not specified
      
      // Map DEX identifier to DEX type enum
      const dexType = this.mapDexIdentifierToType(dexIdentifier);
      
      // Get token addresses
      const tokenInSymbol = path[i];
      const tokenOutSymbol = path[i + 1];
      
      // CRITICAL FIX #1: Validate token addresses exist
      const tokenIn = this.getTokenAddress(tokenInSymbol);
      const tokenOut = this.getTokenAddress(tokenOutSymbol);
      
      // Calculate swap amount (for first swap, use flash loan amount, for others use output)
      const swapAmount = i === 0 ? flashLoanAmount : ethers.parseUnits('10000', 18); // Will be updated dynamically
      
      // Calculate minimum amount with slippage protection (0.3% slippage)
      const slippageTolerance = 0.003; // 0.3%
      const expectedOutput = this.calculateExpectedOutput(swapAmount, opportunity.profitPercent, pools.length);
      const minAmount = BigInt(Math.floor(Number(expectedOutput) * (1 - slippageTolerance)));
      
      // Get DEX router address
      const dexRouter = this.DEX_ROUTERS[dexIdentifier] || this.DEX_ROUTERS['UniswapV2'];
      
      // Create swap data for Curve pools
      let swapData: string = '0x';
      
      // FIX #5: Encode Curve pool data (pool address + token indices)
      if (dexType === DEXType.Curve) {
        // For Curve pools, we need to encode pool address and token indices
        // This requires knowing which pool and which token positions (0, 1, 2...)
        // For now, we'll use a simplified approach with placeholder data
        // In production, you should look up the actual Curve pool and token positions
        
        // Get pool address from opportunity data if available
        const poolAddress = (opportunity as any).poolAddresses?.[i] || dexRouter;
        
        // Determine token indices based on common Curve pool configurations
        // Most Curve pools have USDC at index 0 and DAI at index 1
        let tokenInIndex = 0;
        let tokenOutIndex = 1;
        
        // Map common tokens to Curve indices
        const tokenIndexMap: Record<string, number> = {
          'USDC': 0,
          'USDbC': 0,
          'DAI': 1,
          'USDT': 2,
          'WETH': 2
        };
        
        tokenInIndex = tokenIndexMap[tokenInSymbol] ?? 0;
        tokenOutIndex = tokenIndexMap[tokenOutSymbol] ?? 1;
        
        // Ensure indices are different
        if (tokenInIndex === tokenOutIndex) {
          tokenOutIndex = (tokenInIndex + 1) % 3;
        }
        
        // Encode pool data: (address pool, int128 i, int128 j)
        swapData = ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'int128', 'int128'],
          [checksumAddress(poolAddress), tokenInIndex, tokenOutIndex]
        );
        
        console.log(`   Curve swap encoded: pool=${poolAddress}, i=${tokenInIndex}, j=${tokenOutIndex}`);
      }
      
      // Create swap object
      const swap: Swap = {
        dexType: dexType,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amount: swapAmount,
        minAmount: minAmount,
        dexRouter: checksumAddress(dexRouter),
        fee: poolFee,
        swapData: swapData // Encoded data for Curve, V4
      };
      
      swaps.push(swap);
      dexPath.push(dexIdentifier);
    }

    // Calculate minimum profit amount (flash loan amount * min profit %)
    const minProfitPercent = this.config.minProfitPercent || 0.1;
    const minProfitAmount = flashLoanAmount * BigInt(Math.floor(minProfitPercent * 100)) / BigInt(10000);

    return {
      asset: checksumAddress(flashLoanAsset),
      amount: flashLoanAmount,
      swapParams: {
        swaps: swaps,
        minProfitAmount: minProfitAmount,
        dexPath: dexPath.join(' -> ')
      }
    };
  }

  /**
   * Map DEX identifier string to DEX type enum value
   */
  private mapDexIdentifierToType(dexIdentifier: string): number {
    const mapping: Record<string, number> = {
      'UniswapV2': DEXType.UniswapV2,
      'UniswapV3': DEXType.UniswapV3,
      'UniswapV4': DEXType.UniswapV4,
      'Curve': DEXType.Curve,
      'Aerodrome': DEXType.AerodromeV2,
      'AerodromeV2': DEXType.AerodromeV2,
      'AerodromeV3': DEXType.AerodromeV3,
      'Aerodrome SlipStream': DEXType.AerodromeV3,
      'Aerodrome SlipStream 2': DEXType.AerodromeV3,
      'SushiSwap V3': DEXType.SushiSwapV3,
      'SushiSwapV3': DEXType.SushiSwapV3,
      'PancakeSwap V3': DEXType.PancakeSwapV3,
      'PancakeSwapV3': DEXType.PancakeSwapV3,
      'BaseSwap': DEXType.BaseSwap,
      'AlienBase': DEXType.UniswapV2, // AlienBase is V2-style
      'SwapBased': DEXType.UniswapV2, // SwapBased is V2-style
      'Hydrex': DEXType.Hydrex
    };
    
    return mapping[dexIdentifier] || DEXType.UniswapV2;
  }

  /**
   * Calculate expected output amount for swap
   */
  private calculateExpectedOutput(amount: bigint, profitPercent: number, numSwaps: number): bigint {
    // Simple calculation: amount * (1 + profit% / numSwaps)
    const profitPerSwap = profitPercent / numSwaps / 100;
    const multiplier = 1 + profitPerSwap;
    return amount * BigInt(Math.floor(multiplier * 10000)) / BigInt(10000);
  }

  private async estimateGasCost(
    opportunity: Opportunity,
    flashLoanParams: FlashLoanParams
  ): Promise<bigint> {
    try {
      // Encode SwapParams struct for the contract
      const swapParamsEncoded = this.encodeSwapParams(flashLoanParams.swapParams);

      const gasEstimate = await this.flashLoanContract.executeArbitrage.estimateGas(
        flashLoanParams.asset,
        flashLoanParams.amount,
        swapParamsEncoded
      );

      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);

      return gasEstimate * gasPrice;
    } catch (error) {
      // Fallback estimate
      console.log(`   ⚠️  Could not estimate gas, using fallback estimate`);
      return ethers.parseUnits('0.01', 18); // 0.01 ETH fallback
    }
  }

  private async executeFlashLoan(
    flashLoanParams: FlashLoanParams,
    txOptions: any = {}
  ): Promise<ethers.ContractTransactionResponse> {
    // Encode SwapParams struct for the contract
    const swapParamsEncoded = this.encodeSwapParams(flashLoanParams.swapParams);

    return await this.flashLoanContract.executeArbitrage(
      flashLoanParams.asset,
      flashLoanParams.amount,
      swapParamsEncoded,
      txOptions
    );
  }

  /**
   * Encode SwapParams struct for contract call
   */
  private encodeSwapParams(swapParams: SwapParams): string {
    const swapsArray = swapParams.swaps.map(swap => [
      swap.dexType,
      swap.tokenIn,
      swap.tokenOut,
      swap.amount,
      swap.minAmount,
      swap.dexRouter,
      swap.fee,
      swap.swapData
    ]);

    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(uint8,address,address,uint256,uint256,address,uint24,bytes)[]',
        'uint256',
        'string'
      ],
      [
        swapsArray,
        swapParams.minProfitAmount,
        swapParams.dexPath
      ]
    );
  }

  private recordExecution(
    opportunity: Opportunity,
    tx: any,
    receipt: any,
    error?: any
  ) {
    const record = {
      opportunityId: opportunity.id,
      timestamp: Date.now(),
      strategy: opportunity.strategy,
      profitPercent: opportunity.profitPercent,
      profitAfterGas: opportunity.profitAfterGas,
      txHash: tx?.hash || null,
      blockNumber: receipt?.blockNumber || null,
      gasUsed: receipt?.gasUsed?.toString() || null,
      status: opportunity.status,
      error: error?.message || null
    };

    this.executionHistory.set(opportunity.id, record);

    // Save to file
    const history = Array.from(this.executionHistory.values());
    fs.writeFileSync(
      'data/execution-history.json',
      JSON.stringify(history, null, 2)
    );
  }

  getExecutionHistory(): any[] {
    return Array.from(this.executionHistory.values());
  }

  async getContractBalance(): Promise<{ [key: string]: string }> {
    const wethAddress = '0x4200000000000000000000000000000000000006';
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913';

    const wethBalance = await this.provider.getBalance(this.wallet.address);
    
    // Get USDC balance
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    const usdcBalance = await usdcContract.balanceOf(this.wallet.address);

    return {
      ETH: ethers.formatEther(wethBalance),
      USDC: ethers.formatUnits(usdcBalance, 6)
    };
  }

  async getFlashLoanContractBalance(): Promise<{ [key: string]: string }> {
    const wethAddress = '0x4200000000000000000000000000000000000006';
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913';

    const wethBalance = await this.provider.getBalance(await this.flashLoanContract.getAddress());
    
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    const usdcBalance = await usdcContract.balanceOf(await this.flashLoanContract.getAddress());

    return {
      ETH: ethers.formatEther(wethBalance),
      USDC: ethers.formatUnits(usdcBalance, 6)
    };
  }
}