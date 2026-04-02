export { getNetwork, getPrivateKey, getNetworkConfig } from './config';
export type { NetworkName, NetworkConfig } from './config';

export {
  MAINNET_TOKENS,
  CHAPEL_TOKENS,
  TOKENS,
  PEACH_CONTRACTS,
  PEACH_AGGREGATOR_ADDRESS,
  TOKEN_DECIMALS,
  PANCAKE_V2,
  PANCAKE_V3,
  TEST_AMOUNTS,
  SLIPPAGE,
  PEACH_API,
  TEST_CONFIG,
  NATIVE_TOKEN_ADDRESS,
} from './constants';

// Convenience re-exports for common tokens
import { TOKENS } from './constants';
export const { WBNB, USDT, USDC, BUSD, BTCB, ETH, CAKE } = TOKENS;

export {
  getProvider,
  getTestWallet,
  getTokenContract,
  getV3PoolContract,
  getV2PairContract,
  calculateV2PairAddress,
  calculateMinReturn,
  formatReceipt,
  checkV2Liquidity,
  checkV3Liquidity,
} from './contracts';

export { decodeSwapCalldata, printDecodedSwapCalldata } from './decode-swap-calldata';
export type { DecodedStep } from './decode-swap-calldata';
export { findFailingStep, printFailingStep, diagnoseRouteFailure, simulateAndPrintStepOutputs } from './find-failing-step';
export type { FindFailingStepResult, PoolDiagnostic, SellDirection, DiagnoseRouteFailureOptions } from './find-failing-step';

export {
  fetchRouteForDex,
  simulateSwapETH,
  simulateSwap,
  analyzeQuoteVsSimulation,
  checkAdapterDeployed,
  checkAdapterRegistered,
  buildSwapParamsFromApi,
  checkProviderSynced,
} from './dex-test-utils';
export type { ApiFindRouteResponse, SwapParamsInput } from './dex-test-utils';

/**
 * JSON.stringify that handles BigInt by converting to string with 'n' suffix.
 * Usage: prettyPrint(quote) or console.log(stringify(quote))
 */
export function stringify(obj: unknown, indent = 2): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === 'bigint' ? `${value}n` : value
  , indent);
}

export function prettyPrint(obj: unknown): void {
  console.log(stringify(obj));
}
