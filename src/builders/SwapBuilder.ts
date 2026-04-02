/**
 * SwapBuilder - Swap parameters builder
 *
 * Core features:
 * 1. Flatten split routes into step list
 * 2. Merge identical pools (pool merging optimization)
 * 3. Topological sort (ensure correct dependency order)
 * 4. Generate final SwapParams
 */

import { ethers } from "ethers";
import {
  SwapParams,
  SwapStep,
  SplitRoute,
  Route,
  RouteStep,
  PoolInfo,
  ProtocolType,
  BPS_DENOMINATOR,
  DEFAULT_DEADLINE_SECONDS,
} from "../types";

export class SwapBuilder {
  private adapters: Map<ProtocolType, string>;

  constructor(adapters: Map<ProtocolType, string>) {
    this.adapters = adapters;
  }

  /**
   * Build SwapParams from split route
   */
  build(
    splitRoute: SplitRoute,
    srcToken: string,
    dstToken: string,
    amountOutMin: bigint,
    deadlineSeconds: number = DEFAULT_DEADLINE_SECONDS
  ): SwapParams {
    // 1. Flatten all routes into step list
    const flatSteps = this.flattenRoutes(splitRoute);

    // 2. Merge identical pools
    const mergedSteps = this.mergeIdenticalPools(flatSteps);

    // 3. Topological sort
    const sortedSteps = this.topologicalSort(mergedSteps, srcToken);

    // 4. Convert to SwapStep format
    const steps = this.convertToSwapSteps(sortedSteps);

    // 5. Extract intermediate tokens
    const intermediateTokens = this.extractIntermediates(
      sortedSteps,
      srcToken,
      dstToken
    );

    // 6. Calculate deadline
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    return {
      srcToken,
      dstToken,
      amountIn: splitRoute.totalAmountIn,
      amountOutMin,
      steps,
      intermediateTokens,
      deadline,
      quoteId: ethers.ZeroHash,
      expectAmountOut: splitRoute.totalAmountOut,
    };
  }

  /**
   * Flatten split route
   */
  private flattenRoutes(splitRoute: SplitRoute): InternalStep[] {
    const steps: InternalStep[] = [];

    for (let i = 0; i < splitRoute.routes.length; i++) {
      const route = splitRoute.routes[i];
      const percentage = splitRoute.percentages[i];

      // Calculate allocated amount for this route
      const routeAmount =
        (splitRoute.totalAmountIn * BigInt(percentage)) / BPS_DENOMINATOR;

      for (let j = 0; j < route.steps.length; j++) {
        const routeStep = route.steps[j];

        steps.push({
          pool: routeStep.pool,
          tokenIn: routeStep.tokenIn,
          tokenOut: routeStep.tokenOut,
          // Only first step has fixed amount, subsequent steps depend on previous output
          amountIn: j === 0 ? routeAmount : 0n,
          routeIndex: i,
          stepIndex: j,
        });
      }
    }

    return steps;
  }

  /**
   * Merge identical pools
   * Key: pool + tokenIn + tokenOut
   */
  private mergeIdenticalPools(steps: InternalStep[]): InternalStep[] {
    const poolMap = new Map<string, InternalStep>();
    const result: InternalStep[] = [];

    for (const step of steps) {
      const key = `${step.pool.address}-${step.tokenIn}-${step.tokenOut}`;

      if (poolMap.has(key)) {
        // Identical pool already exists
        const existing = poolMap.get(key)!;

        // If current step has fixed input, accumulate to existing step
        if (step.amountIn > 0n) {
          if (existing.amountIn > 0n) {
            // Both have fixed input - this shouldn't happen after first hop
            // Keep consume all mode
            existing.amountIn = 0n;
          }
        }
        // If existing step is already consume all (0n), keep it unchanged
      } else {
        const newStep = { ...step };
        poolMap.set(key, newStep);
        result.push(newStep);
      }
    }

    // For merged pools with multiple input sources, set to consume all
    for (const step of result) {
      const key = `${step.pool.address}-${step.tokenIn}-${step.tokenOut}`;
      const allStepsForPool = steps.filter(
        (s) =>
          `${s.pool.address}-${s.tokenIn}-${s.tokenOut}` === key
      );

      if (allStepsForPool.length > 1) {
        // Multiple input sources, use consume all
        step.amountIn = 0n;
      }
    }

    return result;
  }

  /**
   * Topological sort (Kahn's Algorithm)
   */
  private topologicalSort(
    steps: InternalStep[],
    srcToken: string
  ): InternalStep[] {
    // Build adjacency list and in-degree
    const inDegree = new Map<string, number>();
    const stepMap = new Map<string, InternalStep>();
    const graph = new Map<string, string[]>(); // tokenOut -> [stepKeys that consume it]

    for (const step of steps) {
      const key = this.stepKey(step);
      stepMap.set(key, step);
      inDegree.set(key, 0);
      graph.set(key, []);
    }

    // Calculate in-degree
    for (const step of steps) {
      const key = this.stepKey(step);

      // If tokenIn is not source token, need to wait for producer
      if (step.tokenIn !== srcToken) {
        // Find steps that produce this token
        for (const producer of steps) {
          if (producer.tokenOut === step.tokenIn) {
            const producerKey = this.stepKey(producer);
            if (producerKey !== key) {
              // Add edge: producer -> step
              graph.get(producerKey)!.push(key);
              inDegree.set(key, (inDegree.get(key) || 0) + 1);
            }
          }
        }
      }
    }

    // BFS
    const queue: string[] = [];
    for (const [key, degree] of inDegree) {
      if (degree === 0) {
        queue.push(key);
      }
    }

    const result: InternalStep[] = [];
    while (queue.length > 0) {
      const key = queue.shift()!;
      const step = stepMap.get(key)!;
      result.push(step);

      // Update in-degree of steps dependent on this step
      for (const dependent of graph.get(key) || []) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== steps.length) {
      throw new Error("Circular dependency detected in route");
    }

    return result;
  }

  /**
   * Convert to contract SwapStep format
   */
  private convertToSwapSteps(steps: InternalStep[]): SwapStep[] {
    return steps.map((step) => {
      const adapter = this.adapters.get(step.pool.protocol);
      if (!adapter) {
        throw new Error(`No adapter for protocol: ${step.pool.protocol}`);
      }

      return {
        adapter,
        pool: step.pool.address,
        tokenIn: step.tokenIn,
        tokenOut: step.tokenOut,
        amountIn: step.amountIn,
        extraData: this.encodeExtraData(step.pool),
      };
    });
  }

  /**
   * Encode protocol-specific parameters
   */
  private encodeExtraData(pool: PoolInfo): string {
    switch (pool.protocol) {
      case ProtocolType.PancakeV2:
        return "0x"; // V2 doesn't need extra parameters

      case ProtocolType.PancakeV3:
      case ProtocolType.UniswapV3:
      case ProtocolType.UniswapV4:
        // V3/V4 fee can be read from pool contract, no need to pass in extraData
        return "0x";

      case ProtocolType.Dodo:
        // DODO adapter typically uses pool-specific extraData from API or 0x
        return "0x";

      default:
        return "0x";
    }
  }

  /**
   * Extract intermediate tokens
   */
  private extractIntermediates(
    steps: InternalStep[],
    srcToken: string,
    dstToken: string
  ): string[] {
    const tokens = new Set<string>();

    for (const step of steps) {
      // tokenOut that is not destination token is intermediate token
      if (step.tokenOut !== dstToken) {
        tokens.add(step.tokenOut);
      }
    }

    // Exclude source and destination tokens
    tokens.delete(srcToken);
    tokens.delete(dstToken);

    return Array.from(tokens);
  }

  /**
   * Generate unique step key
   */
  private stepKey(step: InternalStep): string {
    return `${step.pool.address}-${step.tokenIn}-${step.tokenOut}`;
  }
}

/**
 * Internal step type
 */
interface InternalStep {
  pool: PoolInfo;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  routeIndex: number;
  stepIndex: number;
}
