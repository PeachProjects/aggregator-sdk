/**
 * RouteDiscovery - Route discovery and optimization
 *
 * Features:
 * 1. Discover available pools
 * 2. Calculate optimal routes
 * 3. Split large trades
 */

import { ethers } from "ethers";
import {
  PeachConfig,
  PoolInfo,
  Route,
  RouteStep,
  SplitRoute,
  ProtocolType,
} from "../types";

// PancakeSwap V2 Pair ABI
const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

// PancakeSwap V3 Pool ABI
const V3_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
];

// PancakeSwap V2 Factory
const V2_FACTORY_ADDRESS = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

// PancakeSwap V3 Factory
const V3_FACTORY_ADDRESS = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const V3_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

// V3 fee tiers
const V3_FEE_TIERS = [100, 500, 2500, 10000];

// Gas estimation constants
const GAS_PER_V2_SWAP = 60000n;
const GAS_PER_V3_SWAP = 120000n;
const GAS_PER_DODO_SWAP = 100000n;

export class RouteDiscovery {
  private provider: ethers.Provider;
  private config: PeachConfig;
  private v2Factory: ethers.Contract;
  private v3Factory: ethers.Contract;

  // Pool cache
  private poolCache = new Map<string, PoolInfo>();

  constructor(provider: ethers.Provider, config: PeachConfig) {
    this.provider = provider;
    this.config = config;
    this.v2Factory = new ethers.Contract(
      V2_FACTORY_ADDRESS,
      V2_FACTORY_ABI,
      provider
    );
    this.v3Factory = new ethers.Contract(
      V3_FACTORY_ADDRESS,
      V3_FACTORY_ABI,
      provider
    );
  }

  /**
   * Discover optimal route
   */
  async findBestRoute(
    srcToken: string,
    dstToken: string,
    amountIn: bigint,
    
  ): Promise<SplitRoute> {
    // 1. Discover all available pools
    const pools = await this.discoverPools(srcToken, dstToken);

    if (pools.length === 0) {
      throw new Error(`No pools found for ${srcToken} -> ${dstToken}`);
    }

    // 2. Calculate quotes for each pool
    const routes = await this.calculateRoutes(
      pools,
      srcToken,
      dstToken,
      amountIn
    );

    // 3. Select optimal route (currently simple selection of max output single route)
    // TODO: Implement split route optimization
    const bestRoute = routes.reduce((best, current) =>
      current.amountOut > best.amountOut ? current : best
    );

    return {
      routes: [bestRoute],
      percentages: [10000], // 100%
      totalAmountIn: amountIn,
      totalAmountOut: bestRoute.amountOut,
      totalGasEstimate: bestRoute.gasEstimate,
    };
  }

  /**
   * Discover available pools (direct path)
   */
  private async discoverPools(
    tokenA: string,
    tokenB: string
  ): Promise<PoolInfo[]> {
    const pools: PoolInfo[] = [];

    // 1. Find V2 pool
    try {
      const v2Pool = await this.findV2Pool(tokenA, tokenB);
      if (v2Pool) {
        pools.push(v2Pool);
      }
    } catch (e) {
      // V2 pool doesn't exist
    }

    // 2. Find V3 pools (all fee tiers)
    for (const fee of V3_FEE_TIERS) {
      try {
        const v3Pool = await this.findV3Pool(tokenA, tokenB, fee);
        if (v3Pool) {
          pools.push(v3Pool);
        }
      } catch (e) {
        // V3 pool with this fee tier doesn't exist
      }
    }

    return pools;
  }

  /**
   * Find V2 pool
   */
  private async findV2Pool(
    tokenA: string,
    tokenB: string
  ): Promise<PoolInfo | null> {
    const cacheKey = `v2-${tokenA}-${tokenB}`;
    if (this.poolCache.has(cacheKey)) {
      return this.poolCache.get(cacheKey)!;
    }

    const pairAddress = await this.v2Factory.getPair(tokenA, tokenB);
    if (pairAddress === ethers.ZeroAddress) {
      return null;
    }

    const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
    const [token0, token1, reserves] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
    ]);

    const pool: PoolInfo = {
      address: pairAddress,
      token0,
      token1,
      protocol: ProtocolType.PancakeV2,
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
    };

    this.poolCache.set(cacheKey, pool);
    return pool;
  }

  /**
   * Find V3 pool
   */
  private async findV3Pool(
    tokenA: string,
    tokenB: string,
    fee: number
  ): Promise<PoolInfo | null> {
    const cacheKey = `v3-${tokenA}-${tokenB}-${fee}`;
    if (this.poolCache.has(cacheKey)) {
      return this.poolCache.get(cacheKey)!;
    }

    const poolAddress = await this.v3Factory.getPool(tokenA, tokenB, fee);
    if (poolAddress === ethers.ZeroAddress) {
      return null;
    }

    const v3Pool = new ethers.Contract(poolAddress, V3_POOL_ABI, this.provider);
    const [token0, token1, liquidity] = await Promise.all([
      v3Pool.token0(),
      v3Pool.token1(),
      v3Pool.liquidity(),
    ]);

    // Skip pools with no liquidity
    if (liquidity === 0n) {
      return null;
    }

    const pool: PoolInfo = {
      address: poolAddress,
      token0,
      token1,
      protocol: ProtocolType.PancakeV3,
      fee,
      liquidity,
    };

    this.poolCache.set(cacheKey, pool);
    return pool;
  }

  /**
   * Calculate route quotes
   */
  private async calculateRoutes(
    pools: PoolInfo[],
    srcToken: string,
    dstToken: string,
    amountIn: bigint
  ): Promise<Route[]> {
    const routes: Route[] = [];

    for (const pool of pools) {
      try {
        const amountOut = await this.getAmountOut(
          pool,
          srcToken,
          dstToken,
          amountIn
        );

        if (amountOut > 0n) {
          routes.push({
            steps: [
              {
                pool,
                tokenIn: srcToken,
                tokenOut: dstToken,
                amountIn,
                amountOut,
              },
            ],
            amountIn,
            amountOut,
            gasEstimate:
              pool.protocol === ProtocolType.PancakeV2
                ? GAS_PER_V2_SWAP
                : pool.protocol === ProtocolType.Dodo
                  ? GAS_PER_DODO_SWAP
                  : GAS_PER_V3_SWAP,
          });
        }
      } catch (e) {
        // Quote failed, skip this pool
      }
    }

    return routes;
  }

  /**
   * Get output for a single pool
   */
  private async getAmountOut(
    pool: PoolInfo,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<bigint> {
    if (pool.protocol === ProtocolType.PancakeV2) {
      return this.getV2AmountOut(pool, tokenIn, amountIn);
    }
    if (pool.protocol === ProtocolType.Dodo) {
      // DODO pools are discovered via API; local discovery not implemented
      throw new Error("DODO amount out not supported in local route discovery");
    }
    // V3 requires Quoter contract or simulation, simplified here
    return this.estimateV3AmountOut(pool, tokenIn, amountIn);
  }

  /**
   * V2 output calculation
   */
  private getV2AmountOut(
    pool: PoolInfo,
    tokenIn: string,
    amountIn: bigint
  ): bigint {
    const isToken0In = tokenIn.toLowerCase() === pool.token0.toLowerCase();
    const [reserveIn, reserveOut] = isToken0In
      ? [pool.reserve0!, pool.reserve1!]
      : [pool.reserve1!, pool.reserve0!];

    const amountInWithFee = amountIn * 9975n; // 0.25% fee
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10000n + amountInWithFee;

    return numerator / denominator;
  }

  /**
   * V3 output estimation (simplified)
   */
  private estimateV3AmountOut(
    pool: PoolInfo,
    tokenIn: string,
    amountIn: bigint
  ): bigint {
    // Simplified estimation: assume linear price
    // Should use Quoter contract for accurate calculation in practice
    const fee = BigInt(pool.fee || 2500);
    const feeMultiplier = 1000000n - fee;
    return (amountIn * feeMultiplier) / 1000000n;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.poolCache.clear();
  }
}
