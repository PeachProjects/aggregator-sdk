---
title: Core Features
description: Quote retrieval, swap preparation, simulation, and error recovery.
---

# Core Features

## Get Quote

Use `PeachClient.getQuote()` to retrieve a normalized `Quote`.

```ts
const quote = await client.getQuote({
  srcToken,
  dstToken,
  amountIn,
  options: {
    providers: ["PANCAKEV3", "UNISWAPV3"],  // optional — all 7 providers enabled by default
    deadlineSeconds: 1200,                    // optional — default 20 minutes
  },
});
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `srcToken` | `string` | Yes | Source token address |
| `dstToken` | `string` | Yes | Destination token address |
| `amountIn` | `bigint` | Yes | Input amount in wei |
| `options` | `QuoteOptions` | No | See options table below |

**Options** (`QuoteOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `byAmountIn` | `boolean` | `true` | `true`: input to output; `false`: output to input |
| `depth` | `number` | `3` | Route search depth / max hops |
| `splitCount` | `number` | `20` | Trade split count for large trades |
| `providers` | `Provider[]` | All 7 providers | DEX providers to query |
| `deadlineSeconds` | `number` | `1200` | Transaction deadline in seconds |

**Returns** (`Quote`)

| Field | Type | Description |
| --- | --- | --- |
| `srcToken` | `string` | Source token address |
| `dstToken` | `string` | Destination token address |
| `amountIn` | `bigint` | Input amount |
| `amountOut` | `bigint` | Expected output amount |
| `priceImpact` | `number` | Estimated price impact |
| `gasEstimate` | `bigint` | Estimated gas cost |
| `route` | `SplitRoute` | Split route data for display |
| `params` | `SwapParams` | Swap parameters for execution |
| `routerAddress` | `string?` | Router contract address from API |

## Approve and Swap

Use `swap()` to build transactions without broadcasting them.

```ts
const prepared = await client.swap(quote, ownerAddress, {
  slippageBps: 50,
});
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `quote` | `Quote` | Yes | Quote object from `getQuote()` |
| `ownerAddress` | `string` | Yes | Wallet address for allowance check |
| `options` | `SwapOptions` | Yes | See options table below |

**Options** (`SwapOptions`)

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `slippageBps` | `number` | Yes | — | Slippage tolerance in bps (e.g. 50 = 0.5%) |
| `gasPrice` | `bigint` | No | — | Gas price in wei |
| `gasLimit` | `bigint` | No | — | Gas limit for the swap tx |

**Returns** (`SwapRequest`)

| Field | Type | Description |
| --- | --- | --- |
| `routerAddress` | `string` | Router contract address |
| `method` | `"swap" \| "swapETH"` | Call method |
| `tx` | `SwapTxRequest` | Swap transaction request (`to`, `data`, `value`) |
| `approval` | `SwapApprovalRequest?` | Included only when ERC20 allowance is insufficient |

Send approval first when it exists, then send the swap transaction.

```ts
import { withWalletSendTimeout } from "@peachprojects/aggregator-sdk";

if (prepared.approval) {
  const approvalTx = await withWalletSendTimeout(
    signer.sendTransaction(prepared.approval.tx)
  );
  await approvalTx.wait();
}

const swapTx = await withWalletSendTimeout(signer.sendTransaction(prepared.tx));
await swapTx.wait();
```

`swap()` only prepares tx requests. Browser-wallet integrations should wrap their own `sendTransaction()` calls with timeout and recovery logic. `withWalletSendTimeout()` is the lightweight helper the SDK exposes for that path.

## Native and ERC20 Handling

- Native BNB input does not require approval
- ERC20 input may require approval — `swap()` checks allowance automatically
- Native BNB uses `swapETH`; ERC20 uses `swap`
- Native BNB in the SDK is represented by `NATIVE_TOKEN_ADDRESS` (`0xEeee...eEEeE`)

## Encode Swap Calldata

Encode swap calldata for simulation or building custom transactions.

```ts
const { to, data, value, method } = client.encodeSwapCalldata(quote, slippageBps);
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `quote` | `Quote` | Yes | Quote object from `getQuote()` |
| `slippageBps` | `number` | Yes | Slippage tolerance in bps (e.g. 50 = 0.5%) |

**Returns**

| Field | Type | Description |
| --- | --- | --- |
| `to` | `string` | Router contract address |
| `data` | `string` | Encoded calldata |
| `value` | `bigint` | BNB amount (`quote.amountIn` for native, `0n` otherwise) |
| `method` | `"swap" \| "swapETH"` | Call method |

## Simulate

Use `simulate()` for preflight checks or failure investigation. Runs an `eth_call` with no gas cost or state change.

```ts
const { amountOut, method } = await client.simulate(quote, 50);
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `quote` | `Quote` | Yes | Quote object from `getQuote()` |
| `slippageBps` | `number` | Yes | Slippage tolerance in bps |
| `fromAddress` | `string` | No | Caller address for simulation (default: zero address) |
| `stateOverrides` | `Record<string, ...>` | No | ERC20 state overrides for balance/allowance |

**Returns**

| Field | Type | Description |
| --- | --- | --- |
| `amountOut` | `bigint` | Simulated output amount |
| `method` | `"swap" \| "swapETH"` | Call method used |

For ERC20 input from an address without on-chain balance or allowance, use `buildStateOverrides()`:

```ts
const testCaller = "0x1111111111111111111111111111111111111111";
const stateOverrides = client.buildStateOverrides(
  USDT_ADDRESS,
  testCaller,
  quote.routerAddress
);
const { amountOut } = await client.simulate(quote, 50, testCaller, stateOverrides);
```

### buildStateOverrides

Build state overrides for ERC20 tokens, used with `simulate()` to mock balance and allowance.

**Parameters**

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `tokenAddress` | `string` | Yes | — | ERC20 token address |
| `owner` | `string` | Yes | — | Owner address |
| `routerAddress` | `string` | Yes | — | Router / spender address |
| `balance` | `bigint` | No | 1M tokens | Mocked balance |
| `spenderAddress` | `string` | No | `routerAddress` | Spender for allowance override |
| `options.isNative` | `boolean` | No | `false` | Skip overrides for native token |

Default storage slots work for most standard ERC20 tokens. Some tokens (e.g., USDC) may use different slots.

## Execute (Legacy)

```ts
const tx = await client.execute(quote, signer, {
  slippageBps: 50,
  timeoutMs: 60_000,
  transactionResponsePollingIntervalsMs: [50, 100, 200, 400],
});
await tx.wait();
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `quote` | `Quote` | Yes | Quote object from `getQuote()` |
| `signer` | `Signer` | Yes | ethers Signer for signing and sending |
| `options` | `ExecuteOptions` | Yes | See options table below |

**Options** (`ExecuteOptions`, extends `SwapOptions`)

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `slippageBps` | `number` | Yes | — | Slippage tolerance in bps |
| `skipPreflight` | `boolean` | No | `false` | Skip `eth_call` simulation before sending |
| `timeoutMs` | `number` | No | `60000` | Wallet send timeout (0 to disable) |
| `transactionResponsePollingIntervalsMs` | `number[]` | No | `[50,100,200,400,800,1200]` | Polling intervals after tx hash |
| `gasPrice` | `bigint` | No | — | Gas price in wei |
| `gasLimit` | `bigint` | No | — | Gas limit |

`execute()` remains available as a compatibility wrapper. New integrations should prefer `swap()`.

If `execute()` times out after the wallet has already broadcast, it throws an `ExecuteTimeoutError` with `stage: "provider_index"` and the broadcast `txHash`. Use that hash to recover UI state.

## Error Recovery

Request a fresh quote when:

- the user waited too long before signing
- gas estimation failed without a clear revert reason
- the route may be stale
- the previous transaction never broadcast

If the route still fails:

1. Inspect the simulation error
2. Call `findFailingStep()` to identify which step reverted
3. Review provider selection, token direction, and quote freshness

## Token Info

Fetch ERC20 metadata and optionally the balance for a given owner.

```ts
const info = await client.getTokenInfo(tokenAddress, ownerAddress?);
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `tokenAddress` | `string` | Yes | ERC20 token address |
| `ownerAddress` | `string` | No | Address to query balance for |

**Returns**

| Field | Type | Description |
| --- | --- | --- |
| `symbol` | `string` | Token symbol |
| `decimals` | `number` | Token decimals |
| `balance` | `bigint?` | Included only when `ownerAddress` is provided |

---

## Common Issues

### Custom API endpoint

The SDK connects to `https://api.peach.ag` by default. Override with:

```ts
new PeachClient(config, provider, { api: { baseUrl: "https://api.cipheron.org" } });
```

### Approval did not appear

Either the input token is native BNB (no approval needed) or allowance is already sufficient.

### `estimateGas` failed without a clear reason

1. Request a fresh quote
2. Run `simulate()` to verify the route
3. Verify token direction and slippage
4. Try another RPC provider

### Simulation fails for ERC20 input

Use `buildStateOverrides()` if the simulation address has no on-chain balance or allowance.

For full SDK exports and HTTP API details, see [API Reference](api-reference.md).
