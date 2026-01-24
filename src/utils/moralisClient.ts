import { MORALIS_CONFIG } from '../config/constants';

// Moralis API Types
export interface MoralisToken {
  token_address: string;
  token_name: string;
  token_symbol: string;
  token_logo: string;
  token_decimals: number;
  pair_token_type: string;
  liquidity_usd: string;
}

export interface MoralisPair {
  exchange_address: string;
  exchange_name: string;
  exchange_logo: string;
  pair_label: string;
  pair_address: string;
  usd_price: string;
  usd_price_24hr: string;
  usd_price_24hr_percent_change: string;
  usd_price_24hr_usd_change: string;
  liquidity_usd: string;
  inactive_pair: boolean;
  base_token: MoralisToken;
  quote_token: MoralisToken;
  volume_24h_native: string;
  volume_24h_usd: string;
}

export interface MoralisPairsResponse {
  pairs: MoralisPair[];
  cursor: string;
  page_size: number;
  page: number;
}

export interface MoralisPairReserves {
  reserve0: string;
  reserve1: string;
  pair_address: string;
}

export class MoralisClient {
  private apiKey: string;
  private baseURL: string;
  private chain: string;
  private maxRetries: number;
  private requestTimeout: number;

  constructor() {
    this.apiKey = MORALIS_CONFIG.apiKey;
    this.baseURL = MORALIS_CONFIG.baseURL;
    this.chain = MORALIS_CONFIG.chain;
    this.maxRetries = MORALIS_CONFIG.maxRetries;
    this.requestTimeout = MORALIS_CONFIG.requestTimeout;
  }

  /**
   * Generic HTTP request with retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'accept': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers,
    };

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Moralis API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error as Error;
        
        // If it's a timeout or 429 (rate limit), wait before retry
        if (error instanceof Error && 
            (error.name === 'AbortError' || error.message.includes('429'))) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Get all token pairs for a specific token address
   */
  async getTokenPairs(
    tokenAddress: string,
    cursor?: string,
    limit: number = 100
  ): Promise<MoralisPairsResponse> {
    const params = new URLSearchParams({
      chain: this.chain,
      limit: limit.toString(),
    });

    if (cursor) {
      params.append('cursor', cursor);
    }

    const endpoint = `/erc20/${tokenAddress}/pairs?${params.toString()}`;
    return this.request<MoralisPairsResponse>(endpoint);
  }

  /**
   * Get all pairs for a token with automatic pagination
   */
  async getAllTokenPairs(
    tokenAddress: string,
    maxPages: number = 10
  ): Promise<MoralisPair[]> {
    const allPairs: MoralisPair[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    while (pageCount < maxPages) {
      const response = await this.getTokenPairs(tokenAddress, cursor, 50); // Max limit is 50
      
      allPairs.push(...response.pairs);
      
      if (!response.cursor || response.pairs.length === 0) {
        break;
      }

      cursor = response.cursor;
      pageCount++;
    }

    return allPairs;
  }

  /**
   * Get pair reserves for a specific pool
   */
  async getPairReserves(pairAddress: string): Promise<MoralisPairReserves> {
    const endpoint = `/dex/${this.chain}/pairs/${pairAddress}/reserves`;
    return this.request<MoralisPairReserves>(endpoint);
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(tokenAddress: string): Promise<any> {
    const params = new URLSearchParams({ chain: this.chain });
    const endpoint = `/erc20/${tokenAddress}/metadata?${params.toString()}`;
    return this.request(endpoint);
  }

  /**
   * Filter pairs by DEX
   */
  filterPairsByDEX(pairs: MoralisPair[], dexName: string): MoralisPair[] {
    return pairs.filter(pair => 
      pair.exchange_name && pair.exchange_name.toLowerCase().includes(dexName.toLowerCase())
    );
  }

  /**
   * Filter pairs by minimum liquidity
   */
  filterPairsByLiquidity(pairs: MoralisPair[], minLiquidityUSD: number): MoralisPair[] {
    return pairs.filter(pair => {
      const liquidity = parseFloat(pair.liquidity_usd || '0');
      return liquidity >= minLiquidityUSD && !pair.inactive_pair;
    });
  }

  /**
   * Get DEX type from exchange name
   */
  getDEXType(exchangeName: string | null): string {
    if (!exchangeName) return 'unknown';
    
    const name = exchangeName.toLowerCase();
    
    if (name.includes('uniswap v4')) return 'uniswapV4';
    if (name.includes('uniswap v3')) return 'uniswapV3';
    if (name.includes('uniswap') || name.includes('v2')) return 'uniswapV2';
    if (name.includes('sushiswap')) return 'sushiswapV3';
    if (name.includes('pancakeswap')) return 'pancakeSwapV3';
    if (name.includes('aerodrome')) return 'aerodrome';
    if (name.includes('baseswap')) return 'baseSwap';
    if (name.includes('curve')) return 'curve';
    
    return 'unknown';
  }

  /**
   * Extract fee tier from pair label for V3 pools
   */
  extractFeeTier(pairLabel: string): number | null {
    // Match patterns like "0.05%", "0.3%", etc.
    const match = pairLabel.match(/(\d+\.?\d*)%/);
    if (match) {
      const percentage = parseFloat(match[1]);
      // Convert percentage to basis points (0.3% -> 3000)
      return Math.round(percentage * 10000);
    }
    return null;
  }
}

// Export singleton instance
export const moralisClient = new MoralisClient();