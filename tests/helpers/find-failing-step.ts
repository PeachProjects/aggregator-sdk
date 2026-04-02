/**
 * Locate which step in a swap quote causes simulation to revert (e.g. OVERFLOW, TARGET_IS_ZERO).
 * Uses "simulate with first N steps" until the same revert is reproduced.
 *
 * Usage:
 *   const result = await findFailingStep(quote, (q) => client.simulate(q, 500, from));
 *   if (result) console.log('Failing step index:', result.stepIndex, result.step);
 *
 * For split routes (e.g. DODO multi-path), use diagnoseRouteFailure instead:
 *   await diagnoseRouteFailure(quote, provider, err);
 */

import { ethers } from 'ethers';
import type { Quote, SwapStep } from '../../src';

/**
 * Build a quote that only includes the first `stepCount` steps (and matching intermediateTokens).
 */
function quoteWithFirstNSteps(quote: Quote, stepCount: number): Quote {
  const steps = quote.params.steps.slice(0, stepCount);
  const dstLower = quote.dstToken.toLowerCase();
  // Use a Set (keyed by lowercase) to deduplicate intermediate tokens.
  // Split routes can have the same token as output of multiple parallel steps
  // (e.g. two USDT→tokenX hops both produce tokenX), causing duplicates without this.
  const seen = new Set<string>();
  const intermediateTokens: string[] = [];
  for (const s of steps) {
    const lower = s.tokenOut.toLowerCase();
    if (lower !== dstLower && !seen.has(lower)) {
      seen.add(lower);
      intermediateTokens.push(s.tokenOut);
    }
  }

  return {
    ...quote,
    params: {
      ...quote.params,
      steps,
      intermediateTokens,
    },
  };
}

export interface FindFailingStepResult {
  stepIndex: number;
  step: SwapStep;
  error: unknown;
  revertMessage?: string;
}

/**
 * Find the first step index that causes simulate to revert.
 * Calls simulate with steps [0..1], [0..2], ... until one reverts.
 *
 * NOTE: For split/multi-path routes, partial simulation may fail for unrelated reasons
 * (e.g. wrong dstToken at intermediate steps). Use diagnoseRouteFailure for DODO routes.
 *
 * @param quote - Full quote from getQuote
 * @param simulate - e.g. (q) => client.simulate(q, slippageBps, fromAddress)
 * @returns The failing step index and step details, or null if full route succeeds
 */
export async function findFailingStep(
  quote: Quote,
  simulate: (q: Quote) => Promise<void>
): Promise<FindFailingStepResult | null> {
  const steps = quote.params.steps;
  if (!steps.length) return null;

  let lastError: unknown;
  let revertMessage: string | undefined;

  for (let n = 1; n <= steps.length; n++) {
    const truncated = quoteWithFirstNSteps(quote, n);
    try {
      await simulate(truncated);
    } catch (err: unknown) {
      lastError = err;
      const msg = (err as { message?: string; reason?: string; shortMessage?: string })?.message
        ?? (err as { reason?: string })?.reason
        ?? (err as { shortMessage?: string })?.shortMessage;
      if (typeof msg === 'string') revertMessage = msg;
      const stepIndex = n - 1;
      return {
        stepIndex,
        step: steps[stepIndex]!,
        error: err,
        revertMessage,
      };
    }
  }

  return null;
}

/**
 * Print failing step to console (pool, adapter, tokenIn/Out, amountIn).
 */
export function printFailingStep(result: FindFailingStepResult): void {
  const { stepIndex, step, revertMessage } = result;
  console.log('\n--- Failing step (simulate with first N steps) ---');
  console.log('Step index:', stepIndex);
  console.log('Revert:', revertMessage ?? '(no message)');
  console.log('Pool:', step.pool);
  console.log('Adapter:', step.adapter);
  console.log('TokenIn:', step.tokenIn);
  console.log('TokenOut:', step.tokenOut);
  console.log('AmountIn:', step.amountIn.toString());
  console.log('---\n');
}

// ─── Pool Diagnostics ──────────────────────────────────────────────────────────

const DODO_POOL_ABI = [
  'function _BASE_TOKEN_() view returns (address)',
  'function _QUOTE_TOKEN_() view returns (address)',
  'function _BASE_RESERVE_() view returns (uint112)',
  'function _QUOTE_RESERVE_() view returns (uint112)',
  'function querySellBase(address trader, uint256 payBaseAmount) external view returns (uint256 receiveQuoteAmount, uint256 mtFee)',
  'function querySellQuote(address trader, uint256 payQuoteAmount) external view returns (uint256 receiveBaseAmount, uint256 mtFee)',
];

const ZERO_TRADER = '0x0000000000000000000000000000000000000001';

/** Inferred from tokenIn === baseToken (sellBase) or tokenIn === quoteToken (sellQuote). */
export type SellDirection = 'base' | 'quote' | null;

export interface PoolDiagnostic {
  stepIndex: number;
  pool: string;
  adapter: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  baseToken: string | null;
  quoteToken: string | null;
  baseReserve: bigint | null;
  quoteReserve: bigint | null;
  sellBaseOut: bigint | null;
  sellBaseError: string | null;
  sellQuoteOut: bigint | null;
  sellQuoteError: string | null;
  /** Inferred: tokenIn === base → 'base' (use querySellBase), tokenIn === quote → 'quote' (use querySellQuote). Set only for DODO pools. */
  sellDirection: SellDirection;
  /** True when pool has _BASE_TOKEN_/_QUOTE_TOKEN_ (DODO); only then do we apply DODO check logic. */
  isDodoPool: boolean;
  /** Expected amountOut for this step from the quote (route.routes[0].steps[i].amountOut). Used to compare with querySellBase/querySellQuote result. */
  expectedAmountOut: bigint | null;
  /** For DODO: whether the relevant query (querySellBase or querySellQuote) return value matches quote's expected amount_out. */
  queryResultMatchesQuote: boolean | null;
  /** True if pool has zero/missing reserves or both sell directions fail */
  suspicious: boolean;
  suspicionReason: string[];
}

async function diagnoseSinglePool(
  provider: ethers.Provider,
  stepIndex: number,
  step: SwapStep,
  expectedAmountOut?: bigint,
  /** Effective amount_in for this step: step 0 uses step.amountIn, step i>0 uses previous step's amountOut from route. */
  effectiveAmountIn?: bigint
): Promise<PoolDiagnostic> {
  const contract = new ethers.Contract(step.pool, DODO_POOL_ABI, provider);

  const get = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); } catch { return null; }
  };

  const getErr = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (e: unknown) {
      return (e as { reason?: string; shortMessage?: string; message?: string })?.reason
        ?? (e as { shortMessage?: string })?.shortMessage
        ?? (e as { message?: string })?.message
        ?? 'unknown error';
    }
  };

  // Use effective amount_in for this step (step 0: params amountIn; step i>0: previous step's amountOut). Never use 1n for non-first steps.
  const probeAmount =
    effectiveAmountIn != null && effectiveAmountIn > 0n
      ? effectiveAmountIn
      : step.amountIn > 0n
        ? step.amountIn
        : 1n;

  const [baseToken, quoteToken, baseReserve, quoteReserve, sellBaseResult, sellQuoteResult] =
    await Promise.all([
      get(() => contract._BASE_TOKEN_() as Promise<string>),
      get(() => contract._QUOTE_TOKEN_() as Promise<string>),
      get(() => contract._BASE_RESERVE_() as Promise<bigint>),
      get(() => contract._QUOTE_RESERVE_() as Promise<bigint>),
      contract.querySellBase(ZERO_TRADER, probeAmount)
        .then((r: [bigint, bigint]) => ({ out: r[0], err: null as string | null }))
        .catch((e: unknown) => ({ out: null as bigint | null, err: String((e as { reason?: string; shortMessage?: string; message?: string })?.reason ?? (e as { shortMessage?: string })?.shortMessage ?? (e as { message?: string })?.message ?? 'unknown') })),
      contract.querySellQuote(ZERO_TRADER, probeAmount)
        .then((r: [bigint, bigint]) => ({ out: r[0], err: null as string | null }))
        .catch((e: unknown) => ({ out: null as bigint | null, err: String((e as { reason?: string; shortMessage?: string; message?: string })?.reason ?? (e as { shortMessage?: string })?.shortMessage ?? (e as { message?: string })?.message ?? 'unknown') })),
    ]);

  const sellBaseOut = sellBaseResult.out;
  const sellBaseErr = sellBaseResult.err;
  const sellQuoteOut = sellQuoteResult.out;
  const sellQuoteErr = sellQuoteResult.err;

  const tokenInLower = step.tokenIn.toLowerCase();
  const tokenOutLower = step.tokenOut.toLowerCase();
  // amount_out is what we receive. querySellBase returns receiveQuoteAmount, querySellQuote returns receiveBaseAmount.
  // So: we receive quote (tokenOut===pool quote) → use querySellBase; we receive base (tokenOut===pool base) → use querySellQuote.
  const tokenOutIsPoolQuote = baseToken && quoteToken && tokenOutLower === quoteToken.toLowerCase();
  const tokenOutIsPoolBase = baseToken && quoteToken && tokenOutLower === baseToken.toLowerCase();
  let sellDirection: SellDirection =
    tokenOutIsPoolQuote ? 'base' : tokenOutIsPoolBase ? 'quote' : null;
  // If both queries succeeded, pick the one whose result equals quote amount_out (Peach API) to handle pool/API convention differences.
  if (expectedAmountOut != null && sellBaseOut !== null && sellQuoteOut !== null && !sellBaseErr && !sellQuoteErr) {
    if (BigInt(sellBaseOut) === expectedAmountOut && BigInt(sellQuoteOut) !== expectedAmountOut) {
      sellDirection = 'base';
    } else if (BigInt(sellQuoteOut) === expectedAmountOut && BigInt(sellBaseOut) !== expectedAmountOut) {
      sellDirection = 'quote';
    }
    // else keep sellDirection from tokenOut so display is consistent
  }

  const isDodoPool = baseToken !== null && quoteToken !== null;
  const suspicionReason: string[] = [];

  // Only DODO pools: apply query/reserve/direction checks. Non-DODO (e.g. PancakeV3) skip this logic.
  if (isDodoPool) {
    if (baseReserve !== null && baseReserve === 0n) suspicionReason.push('baseReserve=0');
    if (quoteReserve !== null && quoteReserve === 0n) suspicionReason.push('quoteReserve=0');
    if (sellBaseErr?.includes('TARGET_IS_ZERO')) suspicionReason.push('querySellBase→TARGET_IS_ZERO');
    if (sellQuoteErr?.includes('TARGET_IS_ZERO')) suspicionReason.push('querySellQuote→TARGET_IS_ZERO');
    if (sellBaseErr?.includes('OVERFLOW')) suspicionReason.push('querySellBase→OVERFLOW');
    if (sellQuoteErr?.includes('OVERFLOW')) suspicionReason.push('querySellQuote→OVERFLOW');
    if (sellBaseErr?.includes('MUL_ERROR')) suspicionReason.push('querySellBase→MUL_ERROR');
    if (sellQuoteErr?.includes('MUL_ERROR')) suspicionReason.push('querySellQuote→MUL_ERROR');
    // Flag when the step's direction's query fails (ignore output 0)
    if (sellDirection === 'base' && sellBaseErr) {
      suspicionReason.push(`step is sellBase; querySellBase failed: ${sellBaseErr.slice(0, 50)}`);
    } else if (sellDirection === 'quote' && sellQuoteErr) {
      suspicionReason.push(`step is sellQuote; querySellQuote failed: ${sellQuoteErr.slice(0, 50)}`);
    }
    const isNotImplemented = (e: string | null) =>
      !e || e.includes('no data') || e.includes('could not decode') || e.includes('missing revert data') || e.includes('require(false)');
    if (sellBaseErr && sellQuoteErr && !isNotImplemented(sellBaseErr) && !isNotImplemented(sellQuoteErr)) {
      suspicionReason.push(`bothQueriesFail(${sellBaseErr.slice(0, 40)})`);
    }
    if (step.amountIn > 0n) {
      const isSellingBase = tokenInLower === baseToken!.toLowerCase();
      const isSellingQuote = tokenInLower === quoteToken!.toLowerCase();
      if (isSellingBase && baseReserve !== null && step.amountIn > baseReserve) {
        suspicionReason.push(`amountIn(${step.amountIn})>baseReserve(${baseReserve})→OVERFLOW risk`);
      }
      if (isSellingQuote && quoteReserve !== null && step.amountIn > quoteReserve) {
        suspicionReason.push(`amountIn(${step.amountIn})>quoteReserve(${quoteReserve})→OVERFLOW risk`);
      }
    }
    const OVERFLOW_RESERVE_THRESHOLD = BigInt('1000000000000000000000000000'); // 1e27
    if (baseReserve !== null && baseReserve > OVERFLOW_RESERVE_THRESHOLD) {
      suspicionReason.push(`baseReserve(${baseReserve}) abnormally large→SafeMath OVERFLOW risk`);
    }
    if (quoteReserve !== null && quoteReserve > OVERFLOW_RESERVE_THRESHOLD) {
      suspicionReason.push(`quoteReserve(${quoteReserve}) abnormally large→SafeMath OVERFLOW risk`);
    }
    const OVERFLOW_OUTPUT_THRESHOLD = BigInt('1000000000000000000000000000000'); // 1e30
    if (sellBaseOut !== null && sellBaseOut > OVERFLOW_OUTPUT_THRESHOLD) {
      suspicionReason.push(`querySellBase output(${sellBaseOut}) unreasonably large→broken pool math`);
    }
    if (sellQuoteOut !== null && sellQuoteOut > OVERFLOW_OUTPUT_THRESHOLD) {
      suspicionReason.push(`querySellQuote output(${sellQuoteOut}) unreasonably large→broken pool math`);
    }
    if (expectedAmountOut != null) {
      const actual = sellDirection === 'base' ? sellBaseOut : sellDirection === 'quote' ? sellQuoteOut : null;
      if (actual !== null && actual !== expectedAmountOut) {
        suspicionReason.push(`on-chain query returned ${actual} !== quote amount_out (Peach API) ${expectedAmountOut}`);
      }
    }
  }

  const expected = expectedAmountOut ?? null;
  let queryResultMatchesQuote: boolean | null = null;
  if (isDodoPool && expected !== null) {
    const actual = sellDirection === 'base' ? sellBaseOut : sellDirection === 'quote' ? sellQuoteOut : null;
    queryResultMatchesQuote = actual !== null ? actual === expected : null;
  }

  return {
    stepIndex,
    pool: step.pool,
    adapter: step.adapter,
    tokenIn: step.tokenIn,
    tokenOut: step.tokenOut,
    amountIn: step.amountIn,
    baseToken,
    quoteToken,
    baseReserve: baseReserve ?? null,
    quoteReserve: quoteReserve ?? null,
    sellBaseOut: sellBaseOut ?? null,
    sellBaseError: sellBaseErr,
    sellQuoteOut: sellQuoteOut ?? null,
    sellQuoteError: sellQuoteErr,
    sellDirection,
    isDodoPool,
    expectedAmountOut: expected,
    queryResultMatchesQuote,
    suspicious: suspicionReason.length > 0,
    suspicionReason,
  };
}

/**
 * Run simulate with steps [0..1], [0..2], ... and print each step's chain-simulated amountOut.
 * Stops at first failing step. Use the same quote/simulate params as your real simulate call.
 *
 * @param quote - Full quote
 * @param simulate - e.g. (q) => client.simulate(q, 500, from, stateOverrides).then(r => r.amountOut)
 */
export async function simulateAndPrintStepOutputs(
  quote: Quote,
  simulate: (q: Quote) => Promise<bigint>
): Promise<void> {
  const steps = quote.params.steps;
  const routeSteps = quote.route.routes[0]?.steps;
  if (!steps.length) return;

  console.log('\n--- Chain simulation: per-step amountOut ---');
  console.log(`  Total steps: ${steps.length}, quote amountIn: ${quote.amountIn}`);
  let successCount = 0;
  for (let n = 1; n <= steps.length; n++) {
    const truncated = quoteWithFirstNSteps(quote, n);
    const stepIndex = n - 1;
    const step = steps[stepIndex]!;
    const tokenOut = routeSteps?.[stepIndex]?.tokenOut ?? step.tokenOut;
    const expectedOut = routeSteps?.[stepIndex]?.amountOut;
    console.log(`  step[${stepIndex}] pool=${step.pool.slice(0, 10)}... tokenIn→tokenOut, quote expected amountOut: ${expectedOut ?? '—'}`);
    try {
      const amountOut = await simulate(truncated);
      successCount++;
      const match = expectedOut != null ? (amountOut === expectedOut ? ' (match quote)' : ` (quote expected ${expectedOut})`) : '';
      console.log(`         → chain amountOut: ${amountOut}${match}`);
    } catch (err: unknown) {
      const msg = (err as { reason?: string })?.reason ?? (err as { shortMessage?: string })?.shortMessage ?? (err as { message?: string })?.message ?? String(err);
      console.log(`         → failed: ${typeof msg === 'string' ? msg.slice(0, 120) : msg}`);
      console.log(`  (${successCount} step(s) succeeded before failure)`);
      break;
    }
  }
  if (successCount === steps.length) {
    console.log(`  All ${steps.length} steps succeeded.`);
  }
  console.log('---\n');
}

export interface DiagnoseRouteFailureOptions {
  /** When set, run step-by-step simulation and print each step's chain amountOut before pool checks. */
  simulate?: (q: Quote) => Promise<bigint>;
}

/**
 * Diagnose a failed route by querying every pool's on-chain state.
 * Identifies empty pools, TARGET_IS_ZERO sources, and other issues.
 *
 * Much more reliable than findFailingStep for split/multi-path routes (e.g. DODO).
 *
 * Usage:
 *   try {
 *     await client.simulate(quote, 500, from);
 *   } catch (err) {
 *     await diagnoseRouteFailure(quote, provider, err, {
 *       simulate: (q) => client.simulate(q, 500, from, stateOverrides).then(r => r.amountOut),
 *     });
 *     throw err;
 *   }
 */
export async function diagnoseRouteFailure(
  quote: Quote,
  provider: ethers.Provider,
  error?: unknown,
  options?: DiagnoseRouteFailureOptions
): Promise<PoolDiagnostic[]> {
  const steps = quote.params.steps;

  console.log('\n════════ Route Failure Diagnosis ════════');

  if (error) {
    const reason = (error as { reason?: string })?.reason
      ?? (error as { shortMessage?: string })?.shortMessage
      ?? (error as { message?: string })?.message;
    console.log('Error:', reason?.slice(0, 120) ?? '(no message)');
    if (typeof reason === 'string' && /transfer amount exceeds balance/i.test(reason)) {
      console.log(
        'Note: For a failing step index > 0, this usually means the *intermediate* token (input to this step = output of previous step) is insufficient at the router, not the user\'s source token. The previous step may have returned less than the quote expected.'
      );
    }
  }

  if (options?.simulate) {
    await simulateAndPrintStepOutputs(quote, options.simulate);
  }

  console.log(`Checking ${steps.length} pool(s) on-chain (sequential to avoid RPC rate limits)...\n`);

  const routeSteps = quote.route.routes[0]?.steps;
  const srcTokenLower = quote.srcToken.toLowerCase();
  const diagnostics: PoolDiagnostic[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const expectedAmountOut = routeSteps?.[i]?.amountOut;
    // For split routes, multiple parallel paths start from srcToken (entry-point steps).
    // Use the step's own amountIn for entry points; for non-entry steps use the previous
    // step's expected amountOut as the probe amount.
    const isEntryPoint = step.tokenIn.toLowerCase() === srcTokenLower;
    const effectiveAmountIn = isEntryPoint
      ? step.amountIn
      : routeSteps?.[i - 1]?.amountOut;
    diagnostics.push(
      await diagnoseSinglePool(provider, i, step, expectedAmountOut, effectiveAmountIn)
    );
  }

  const suspicious = diagnostics.filter((d) => d.suspicious);

  for (const d of diagnostics) {
    const tag = d.suspicious ? ' ⚠️  SUSPICIOUS' : ' ✓';
    const amtStr = d.amountIn > 0n ? ` amountIn=${d.amountIn}` : '';
    console.log(`  [${d.stepIndex}]${tag} pool=${d.pool}`);
    console.log(`       tokenIn=${d.tokenIn}${amtStr} → tokenOut=${d.tokenOut}`);
    if (d.isDodoPool) {
      const dirLabel = d.sellDirection === 'base' ? 'sellBase' : d.sellDirection === 'quote' ? 'sellQuote' : '?';
      if (d.baseToken) console.log(`       base=${d.baseToken} | quote=${d.quoteToken}`);
      if (d.baseReserve !== null) console.log(`       reserves: base=${d.baseReserve} | quote=${d.quoteReserve}`);
      console.log(`       direction: ${dirLabel} (step uses ${d.sellDirection === 'base' ? 'querySellBase' : 'querySellQuote'})`);
      if (d.sellDirection === 'base') {
        const out = d.sellBaseOut !== null ? String(d.sellBaseOut) : (d.sellBaseError ?? 'error');
        const exp = d.expectedAmountOut != null ? ` | quote amount_out (Peach API): ${d.expectedAmountOut}, match: ${d.queryResultMatchesQuote === true ? 'yes' : d.queryResultMatchesQuote === false ? 'no' : '—'}` : '';
        console.log(`       on-chain querySellBase(amount_in) → ${out}${exp}`);
        if (d.sellQuoteOut !== null) console.log(`       querySellQuote(amount_in) → ${d.sellQuoteOut}`);
        if (d.sellQuoteError) console.log(`       querySellQuote error: ${d.sellQuoteError.slice(0, 80)}`);
      } else if (d.sellDirection === 'quote') {
        const out = d.sellQuoteOut !== null ? String(d.sellQuoteOut) : (d.sellQuoteError ?? 'error');
        const exp = d.expectedAmountOut != null ? ` | quote amount_out (Peach API): ${d.expectedAmountOut}, match: ${d.queryResultMatchesQuote === true ? 'yes' : d.queryResultMatchesQuote === false ? 'no' : '—'}` : '';
        console.log(`       on-chain querySellQuote(amount_in) → ${out}${exp}`);
        if (d.sellBaseOut !== null) console.log(`       querySellBase(amount_in) → ${d.sellBaseOut}`);
        if (d.sellBaseError) console.log(`       querySellBase error: ${d.sellBaseError.slice(0, 80)}`);
      }
    }
    if (d.suspicionReason.length) console.log(`       reason: ${d.suspicionReason.join(', ')}`);
  }

  if (suspicious.length > 0) {
    console.log(`\n⚠️  ${suspicious.length} problematic pool(s) found:`);
    for (const d of suspicious) {
      console.log(`  step[${d.stepIndex}] pool=${d.pool} → ${d.suspicionReason.join(', ')}`);
      if (d.isDodoPool) {
        const apiOut = d.expectedAmountOut != null ? String(d.expectedAmountOut) : '—';
        const baseOut = d.sellBaseOut !== null ? String(d.sellBaseOut) : (d.sellBaseError ?? 'error');
        const quoteOut = d.sellQuoteOut !== null ? String(d.sellQuoteOut) : (d.sellQuoteError ?? 'error');
        console.log(`       quote amount_out (Peach API): ${apiOut}`);
        console.log(`       on-chain querySellBase(amount_in) → ${baseOut}`);
        console.log(`       on-chain querySellQuote(amount_in) → ${quoteOut}`);
      }
    }
  } else {
    console.log('\nNo obviously problematic pools found. Issue may be in adapter logic or route ordering.');
  }

  console.log('════════════════════════════════════════\n');

  return diagnostics;
}
