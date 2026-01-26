import { ethers } from 'ethers';
import { FlashLoanArbitrage__factory } from '../../artifacts/contracts/FlashLoanArbitrage.sol/FlashLoanArbitrage.js';
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

interface FlashLoanParams {
  asset: string;
  amount: bigint;
  routes: Array<{
    dex: string;
    pools: string[];
    path: string[];
  }>;
}

export class FlashLoanExecutor {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private flashLoanContract: ethers.Contract;
  private config: any;
  private executionHistory: Map<string, any> = new Map();

  constructor(
    privateKey: string,
    contractAddress: string,
    providerUrl: string
  ) {
    this.provider = new ethers.JsonRpcProvider(providerUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.flashLoanContract = FlashLoanArbitrage__factory.connect(
      contractAddress,
      this.wallet
    );
    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync('config.json')) {
      this.config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } else {
      throw new Error('Config file not found!');
    }
  }

  async executeOpportunity(opportunity: Opportunity): Promise<boolean> {
    console.log(`\n🚀 Executing opportunity: ${opportunity.id}`);
    console.log(`   Strategy: ${opportunity.strategy}`);
    console.log(`   Profit: ${opportunity.profitPercent.toFixed(4)}%`);
    console.log(`   Profit after gas: ${opportunity.profitAfterGas.toFixed(4)}%`);

    try {
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

      // Estimate gas cost
      const gasEstimate = await this.estimateGasCost(opportunity, flashLoanParams);
      console.log(`   Estimated gas cost: ${ethers.formatEther(gasEstimate)} ETH`);

      // Check if still profitable after actual gas estimate
      const actualGasCostWei = gasEstimate * (await this.provider.getFeeData()).gasPrice || BigInt(0);
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
    // Use WETH or USDC as they have most liquidity
    const path = opportunity.path;
    const pools = opportunity.pools;

    // Default to WETH for flash loan
    const wethAddress = '0x4200000000000000000000000000000000000006';
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913';

    // Choose USDC if it's in the path, otherwise use WETH
    const flashLoanAsset = path.includes('USDC') ? usdcAddress : wethAddress;

    // Calculate flash loan amount (use a reasonable amount)
    // Start with $10,000 worth of tokens
    const flashLoanAmount = ethers.parseUnits('10000', 18); // Default to 18 decimals

    return {
      asset: flashLoanAsset,
      amount: flashLoanAmount,
      routes: [{
        dex: 'MultiDEX',
        pools: pools,
        path: path
      }]
    };
  }

  private async estimateGasCost(
    opportunity: Opportunity,
    flashLoanParams: FlashLoanParams
  ): Promise<bigint> {
    try {
      const gasEstimate = await this.flashLoanContract.executeArbitrage.estimateGas(
        flashLoanParams.asset,
        flashLoanParams.amount,
        flashLoanParams.routes
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
    return await this.flashLoanContract.executeArbitrage(
      flashLoanParams.asset,
      flashLoanParams.amount,
      flashLoanParams.routes,
      txOptions
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