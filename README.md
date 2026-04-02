# Peach Aggregator SDK

TypeScript SDK for the DEX Aggregator on BSC.

## Documentation

GitBook-ready documentation pages live in [`docs/`](docs/README.md). The docs are organized around the actual integration flow:

- quick start
- quote, approve, swap, and simulation flow
- compact SDK/API reference and troubleshooting

## Install

```bash
npm install @peachprojects/aggregator-sdk ethers
```

## Quick Start

```typescript
import { PeachClient, BSC_MAINNET_CONFIG, withWalletSendTimeout } from '@peachprojects/aggregator-sdk';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');

const client = new PeachClient(BSC_MAINNET_CONFIG, provider);

// By default uses https://api.peach.ag. Override with:
// new PeachClient(config, provider, { api: { baseUrl: 'https://api.cipheron.org' } });

// Get quote
const quote = await client.getQuote({
  srcToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  dstToken: '0x55d398326f99059fF775485246999027B3197955', // USDT
  amountIn: ethers.parseEther('1'),
  options: {
    providers: ['PANCAKEV3'],
  },
});

console.log('Amount out:', ethers.formatUnits(quote.amountOut, 18));
console.log('Price impact:', quote.priceImpact);
console.log('Gas estimate:', quote.gasEstimate.toString());

// Build tx requests (slippageBps is required)
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const prepared = await client.swap(quote, await signer.getAddress(), { slippageBps: 50 });

if (prepared.approval) {
  const approvalTx = await signer.sendTransaction(prepared.approval.tx);
  await approvalTx.wait();
}

const tx = await signer.sendTransaction(prepared.tx);
await tx.wait();
```

## getQuote

```typescript
const quote = await client.getQuote({
  srcToken: string,       // Source token address
  dstToken: string,       // Destination token address
  amountIn: bigint,       // Input amount in wei
  options?: {
    byAmountIn?: boolean,   // true: input→output (default: true)
    depth?: number,         // Route search depth (default: 3)
    splitCount?: number,    // Trade split count (default: 20)
    providers?: string[],   // DEX providers (default: all 7 — PANCAKEV2, PANCAKEV3, PANCAKE_INFINITY_CL, UNISWAPV3, UNISWAPV4, DODO, THENA)
    deadlineSeconds?: number, // Tx deadline in seconds (default: 1200 = 20min)
  }
});
```

Returns a `Quote` object:

```typescript
interface Quote {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  gasEstimate: bigint;
  route: SplitRoute;       // Route details for display
  params: SwapParams;      // Contract call parameters
  routerAddress: string;   // Router contract returned by API
}

interface SwapParams {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOutMin: bigint;       // Starts as quoted output; slippage is applied at execute/simulate time
  steps: SwapStep[];
  intermediateTokens: string[];
  deadline: bigint;
  quoteId: string;            // Off-chain quote correlation ID (bytes32)
  expectAmountOut: bigint;    // Pre-calculated expected output
}
```

## swap

```typescript
const prepared = await client.swap(quote, ownerAddress, {
  slippageBps: 50,   // Slippage in bps (0.5%). Required.
  gasPrice?: bigint,  // Gas price in wei
  gasLimit?: bigint,  // Gas limit for the swap tx
});
```

- `quote` — Quote object from `getQuote`
- `ownerAddress` — Wallet address used to check allowance
- `options` — `slippageBps` is required; optionally supports custom `gasPrice` and `gasLimit`

Returns:
- `routerAddress` — Router contract address for the swap
- `method` — Call method: `'swap'` or `'swapETH'`
- `tx` — Swap transaction request to pass to your wallet/client
- `approval` — Included only when ERC20 allowance is insufficient

Example:

```typescript
const prepared = await client.swap(quote, await signer.getAddress(), { slippageBps: 50 });

if (prepared.approval) {
  const approvalTx = await withWalletSendTimeout(
    signer.sendTransaction(prepared.approval.tx)
  );
  await approvalTx.wait();
}

const swapTx = await withWalletSendTimeout(signer.sendTransaction(prepared.tx));
await swapTx.wait();
```

`swap()` only prepares tx requests. Browser-wallet integrations should still wrap their own `sendTransaction()` calls with timeout and recovery logic, and `withWalletSendTimeout()` is the lightweight helper the SDK exposes for that path.

## execute (legacy)

```typescript
const tx = await client.execute(quote, signer, {
  slippageBps: 50,
  timeoutMs: 60_000, // Optional override. Default is 60_000; set 0 to disable.
  transactionResponsePollingIntervalsMs: [50, 100, 200, 400], // Optional backoff intervals after txHash is available
});
await tx.wait();
```

`execute()` remains available as a compatibility wrapper, but browser-wallet integrations should prefer `swap()` and send the returned tx requests directly.

If `execute()` times out after the wallet has already broadcast the tx, it throws an `ExecuteTimeoutError` with:
- `stage: 'provider_index'`
- `txHash` set to the broadcast transaction hash

Use that `txHash` to recover UI state and keep tracking the transaction instead of re-submitting blindly.

## encodeSwapCalldata

Encode swap calldata for simulation or building custom transactions.

```typescript
const { to, data, value, method } = client.encodeSwapCalldata(quote, slippageBps);
```

Parameters:
- `quote` — Quote object from `getQuote`
- `slippageBps` — Slippage tolerance in basis points (e.g. 50 = 0.5%). Required.

Returns:
- `to` — Router contract address
- `data` — Encoded calldata
- `value` — BNB amount to send (`quote.amountIn` for native BNB swaps, `0n` otherwise)
- `method` — Call method: `'swap'` or `'swapETH'`

Example:

```typescript
const quote = await client.getQuote({...});

// Get encoded calldata (slippageBps required)
const { to, data, value, method } = client.encodeSwapCalldata(quote, 50);

// Use for eth_call simulation
const result = await provider.call({ to, data, value });

// Or build custom transaction
const tx = await signer.sendTransaction({ to, data, value });
```

## simulate

Simulate swap via `eth_call` without gas fees or state changes. Useful for verifying quote accuracy.

```typescript
const { amountOut, method } = await client.simulate(
  quote,
  slippageBps,           // Slippage in bps (e.g. 50 = 0.5%). Required.
  fromAddress?,          // Optional, caller address for simulation
  stateOverrides?,       // Optional, state overrides for ERC20 balance/allowance
);
```

Parameters:
- `quote` — Quote object from `getQuote`
- `slippageBps` — Slippage tolerance in basis points (e.g. 50 = 0.5%). Required.
- `fromAddress` — Optional, caller address for simulation (default: zero address)
- `stateOverrides` — Optional, state overrides for ERC20 token balance and allowance. Requires a `JsonRpcProvider`-compatible provider.

Example:

```typescript
const quote = await client.getQuote({...});

// Native BNB swap - no state overrides needed
const { amountOut, method } = await client.simulate(quote, 50);
console.log(`Simulated output: ${amountOut}, method: ${method}`);

// ERC20 swap - use state overrides to simulate balance
const testCaller = '0x1111111111111111111111111111111111111111';
const stateOverrides = client.buildStateOverrides(USDT_ADDRESS, testCaller, quote.routerAddress);
const { amountOut } = await client.simulate(quote, 50, testCaller, stateOverrides);
```

## buildStateOverrides

Build state overrides for ERC20 tokens, used with `simulate` to mock token balance and allowance.

```typescript
const stateOverrides = client.buildStateOverrides(
  tokenAddress,    // ERC20 token address
  owner,           // Owner address
  routerAddress,   // Router/spender address
  balance?,        // Balance (default: 1M tokens)
  balanceSlot?,    // Balance storage slot (default: 1)
  allowanceSlot?,  // Allowance storage slot (default: 2)
);
```

Note: Default storage slots (balanceSlot=1, allowanceSlot=2) work for most standard ERC20 tokens. Some tokens (e.g., USDC) may use different slots.

## getTokenInfo

Fetch ERC20 metadata and, optionally, the balance for a given owner.

```typescript
const tokenInfo = await client.getTokenInfo(tokenAddress, ownerAddress?);
```

Returns:
- `symbol` — Token symbol
- `decimals` — Token decimals
- `balance` — Included only when `ownerAddress` is provided

## License

MIT
