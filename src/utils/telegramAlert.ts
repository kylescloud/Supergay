/**
 * Telegram Alerting System for Arbitrage Bot
 * 
 * Sends real-time alerts for:
 * - New arbitrage opportunities
 * - Execution attempts
 * - Execution results
 * - Errors and warnings
 */

import TelegramBot from 'node-telegram-bot-api';
import { ethers } from 'ethers';
import { ArbitrageOpportunity } from '../types';
import { OpportunityLogEntry } from './logger';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface AlertConfig {
  opportunities: boolean;
  execution: boolean;
  errors: boolean;
  minProfitThreshold?: bigint;
}

export class TelegramAlert {
  private bot!: TelegramBot;
  private config: TelegramConfig;
  private alertConfig: AlertConfig;
  private isInitialized: boolean = false;

  constructor(config: TelegramConfig, alertConfig?: AlertConfig) {
    this.config = config;
    this.alertConfig = alertConfig || {
      opportunities: true,
      execution: true,
      errors: true,
    };

    if (this.config.enabled) {
      this.bot = new TelegramBot(this.config.botToken, { polling: false });
      this.isInitialized = true;
    }
  }

  /**
   * Send opportunity alert
   */
  async sendOpportunityAlert(
    entry: OpportunityLogEntry
  ): Promise<void> {
    if (!this.isInitialized || !this.config.enabled || !this.alertConfig.opportunities) {
      return;
    }

    // Check minimum profit threshold
    if (this.alertConfig.minProfitThreshold) {
      const netProfit = BigInt(entry.netProfit);
      if (netProfit < this.alertConfig.minProfitThreshold) {
        return;
      }
    }

    const message = this.formatOpportunityMessage(entry);

    try {
      await this.bot.sendMessage(this.config.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending Telegram alert:', error);
    }
  }

  /**
   * Send execution attempt alert
   */
  async sendExecutionAlert(
    opportunity: ArbitrageOpportunity,
    txHash: string
  ): Promise<void> {
    if (!this.isInitialized || !this.config.enabled || !this.alertConfig.execution) {
      return;
    }

    const message = `
🚀 <b>ARBITRAGE EXECUTION STARTED</b>

📊 Strategy: Unknown
💰 Net Profit: ${ethers.formatEther(opportunity.netProfit || BigInt(0))} ETH
🔗 TX Hash: <code>${txHash}</code>

🕐 ${new Date().toISOString()}
`;

    try {
      await this.bot.sendMessage(this.config.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending execution alert:', error);
    }
  }

  /**
   * Send execution result alert
   */
  async sendExecutionResultAlert(
    txHash: string,
    status: 'success' | 'failed',
    gasUsed: bigint,
    actualProfit?: bigint,
    errorMessage?: string
  ): Promise<void> {
    if (!this.isInitialized || !this.config.enabled || !this.alertConfig.execution) {
      return;
    }

    const statusEmoji = status === 'success' ? '✅' : '❌';
    const statusColor = status === 'success' ? 'green' : 'red';

    let message = `
${statusEmoji} <b>EXECUTION ${status.toUpperCase()}</b>

🔗 TX Hash: <code>${txHash}</code>
⛽ Gas Used: ${gasUsed.toString()}
`;

    if (actualProfit) {
      message += `💰 Actual Profit: ${ethers.formatEther(actualProfit)} ETH\n`;
    }

    if (errorMessage) {
      message += `❌ Error: <code>${errorMessage}</code>\n`;
    }

    message += `\n🕐 ${new Date().toISOString()}`;

    try {
      await this.bot.sendMessage(this.config.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending execution result alert:', error);
    }
  }

  /**
   * Send error alert
   */
  async sendErrorAlert(
    errorType: string,
    errorMessage: string,
    context?: any
  ): Promise<void> {
    if (!this.isInitialized || !this.config.enabled || !this.alertConfig.errors) {
      return;
    }

    let message = `
⚠️ <b>ERROR ALERT</b>

🔧 Type: ${errorType}
📝 Message: <code>${errorMessage}</code>
`;

    if (context) {
      message += `\n📊 Context:\n<code>${JSON.stringify(context, null, 2)}</code>\n`;
    }

    message += `\n🕐 ${new Date().toISOString()}`;

    try {
      await this.bot.sendMessage(this.config.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending error alert:', error);
    }
  }

  /**
   * Format opportunity message for Telegram
   */
  private formatOpportunityMessage(entry: OpportunityLogEntry): string {
    const emoji = entry.meetsThreshold ? '🎯' : '👁️';
    const profitColor = entry.meetsThreshold ? 'green' : 'yellow';

    let message = `
${emoji} <b>ARBITRAGE OPPORTUNITY</b>

📊 Strategy: ${entry.strategy}
🔢 Block: ${entry.blockNumber}
⚡ Score: ${entry.score.toFixed(4)}

💰 <b>Flash Loan:</b> ${entry.flashLoanAmountFormatted}

🔄 <b>Route:</b>
`;

    // Add token path
    entry.tokens.forEach((token, i) => {
      const dex = entry.dexes[i] || 'Unknown';
      message += `  ${i + 1}. <b>${token.symbol}</b> via ${dex}\n`;
    });

    message += `
💵 <b>Profit:</b>
  Gross: <code>${entry.grossProfitFormatted}</code>
  Net: <b>${entry.netProfitFormatted}</b>
  Threshold: <code>${entry.minProfitThresholdFormatted}</code>

📊 <b>Fees:</b>
  Slippage: <code>${entry.feesFormatted.slippage}</code>
  Swap Fees: <code>${entry.feesFormatted.swapFees}</code>
  Gas: <code>${entry.feesFormatted.gas}</code>
  Flash Fee: <code>${entry.feesFormatted.flashLoanPremium}</code>

🎯 <b>Decision:</b> ${entry.meetsThreshold ? '✅ EXECUTE' : '❌ SKIP'}

🕐 ${entry.timestamp}
`;

    return message;
  }

  /**
   * Send system status update
   */
  async sendSystemStatus(
    status: 'running' | 'stopped' | 'error',
    metrics?: {
      scanCount?: number;
      opportunitiesFound?: number;
      executions?: number;
      uptime?: string;
    }
  ): Promise<void> {
    if (!this.isInitialized || !this.config.enabled) {
      return;
    }

    const statusEmoji = status === 'running' ? '🟢' : status === 'stopped' ? '🔴' : '🟡';

    let message = `
${statusEmoji} <b>SYSTEM STATUS: ${status.toUpperCase()}</b>
`;

    if (metrics) {
      if (metrics.scanCount) message += `📊 Scans: ${metrics.scanCount}\n`;
      if (metrics.opportunitiesFound) message += `🎯 Opportunities: ${metrics.opportunitiesFound}\n`;
      if (metrics.executions) message += `🚀 Executions: ${metrics.executions}\n`;
      if (metrics.uptime) message += `⏱️ Uptime: ${metrics.uptime}\n`;
    }

    message += `\n🕐 ${new Date().toISOString()}`;

    try {
      await this.bot.sendMessage(this.config.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending system status:', error);
    }
  }

  /**
   * Test the Telegram connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isInitialized || !this.config.enabled) {
      return false;
    }

    try {
      await this.bot.sendMessage(this.config.chatId, '✅ Telegram alerts are working correctly!');
      return true;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }

  /**
   * Check if alerts are enabled
   */
  isEnabled(): boolean {
    return this.isInitialized && this.config.enabled;
  }
}