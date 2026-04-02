---
title: API Reference
description: HTTP API endpoints, request/response formats, SDK exports, and operational notes.
---

# API Reference

## Response Envelope

All API responses use a common wrapper:

```ts
interface ApiResponse<T> {
  code: number;   // 200 = success
  msg: string;
  data: T;
}
```

- HTTP non-200 responses indicate transport or gateway failures
- Payloads with `code != 200` indicate API-level failures (use `ApiError`)

---

## Endpoints

### `GET /router/find_routes`

Route discovery and quote retrieval.

Query fields:

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `from` | Yes | — | Input token address |
| `target` | Yes | — | Output token address |
| `amount` | Yes | — | Raw token amount (string) |
| `by_amount_in` | No | `true` | `true`: input to output |
| `depth` | No | `3` | Route search depth |
| `split_count` | No | `20` | Trade split count |
| `providers` | No | All 7 | Comma-separated provider list |
| `v` | No | `1001500` | Client version |

Response data:

| Field | Type | Description |
| --- | --- | --- |
| `request_id` | `string` | Unique request identifier |
| `amount_in` | `string` | Total input amount |
| `amount_out` | `string` | Total output amount |
| `deviation_ratio` | `string` | Price deviation ratio |
| `paths` | `ApiRoutePath[]` | Route paths with pool, provider, amounts, and fee info |
| `contracts` | `ApiContractAddresses` | `{ router, adapters }` contract addresses |
| `gas` | `number` | Estimated gas |

`contracts.router` is the router address used for transaction building.

#### Route Path Object

Each entry in `paths`:

| Field | Type | Description |
| --- | --- | --- |
| `pool` | `string` | Pool contract address |
| `provider` | `string` | Provider name (e.g., `"PANCAKEV3"`) |
| `adapter` | `string` | Adapter contract address |
| `token_in` | `string` | Input token address |
| `token_out` | `string` | Output token address |
| `direction` | `boolean` | `true` = token0 → token1 |
| `fee_rate` | `string` | Fee rate (e.g., `"0.0005"` for 0.05%) |
| `amount_in` | `string` | Input amount |
| `amount_out` | `string` | Output amount |
| `extra_data` | `string?` | Extra data for adapter (hex encoded) |

### `GET /router/status`

Provider availability and chainflow sync status.

Response data:

| Field | Type | Description |
| --- | --- | --- |
| `providers` | `string[]` | Available provider names |
| `chainflows` | `ChainflowStatus[]` | Sync status per provider |

#### Chainflow Status Object

| Field | Type | Description |
| --- | --- | --- |
| `provider` | `string` | Provider name |
| `tx_cursor` | `string \| null` | Current sync transaction cursor |
| `version.latest_block_number` | `number` | Latest synced block number |
| `version.latest_transaction_index` | `number` | Latest synced tx index in that block |
| `update_at` | `number` | Last update timestamp (ms) |

---

## SDK Reference

### `PeachClient`

```ts
new PeachClient(config, provider?, options?)
```

- `config` — `PeachConfig` (use `BSC_MAINNET_CONFIG` for BSC)
- `provider` — optional `ethers.Provider` (created from `config.rpcUrl` if omitted)
- `options.api.baseUrl` — API endpoint, defaults to `https://api.peach.ag`

Core methods:

| Method | Description |
| --- | --- |
| `getQuote()` | Retrieve a quote with routing details |
| `swap()` | Build approval + swap transaction requests |
| `simulate()` | Preflight `eth_call` simulation |
| `encodeSwapCalldata()` | Encode calldata for custom tx building |
| `execute()` | Legacy: sign and send in one step |
| `getAvailableProviders()` | Query available DEX providers from API |
| `buildQuoteFromRouteData()` | Build a quote from raw API route data |
| `buildStateOverrides()` | Build ERC20 state overrides for simulation |
| `findFailingStep()` | Identify which swap step caused a revert |
| `getTokenInfo()` | Fetch ERC20 metadata and balance |

### `ApiClient`

Lower-level HTTP client for direct API access. Defaults to `https://api.peach.ag`.

| Method | Description |
| --- | --- |
| `findRoutes()` | Call `GET /router/find_routes` |
| `getStatus()` | Call `GET /router/status` |
| `getAvailableProviders()` | Get provider list from status endpoint |

### `RouteDiscovery`

Local route discovery for on-chain pool lookups:

- Used internally by `PeachClient` for local quote building
- Supports PancakeV2, PancakeV3, and UniswapV3 pools

### `SwapBuilder`

Builds contract-level swap calldata:

- Encodes swap and swapETH calls for the PeachAggregator router
- Handles all seven protocol types

---

## Exports

### Types

- `Quote`, `QuoteOptions`, `SwapOptions`, `ExecuteOptions`
- `SwapRequest`, `SwapTxRequest`, `SwapApprovalRequest`
- `SwapParams`, `SwapStep`, `SwapResult`
- `SplitRoute`, `Route`, `RouteStep`, `PoolInfo`
- `PeachConfig`, `AdapterConfig`
- `KnownProvider`, `Provider`
- `FindFailingStepResult`, `ExecuteTimeoutStage`
- `ApiFindRouteRequest`, `ApiFindRouteData`, `ApiFindRouteResponse`
- `ApiResponse`, `ApiContractAddresses`, `ApiRoutePath`
- `ApiStatusData`, `ApiStatusResponse`, `ChainflowStatus`

### Constants

- `BSC_MAINNET_CONFIG` / `BSC_TESTNET_CONFIG` — preset chain configs
- `DEFAULT_API_URL` — `"https://api.peach.ag"` (production API endpoint)
- `NATIVE_TOKEN_ADDRESS` — native BNB sentinel address (`0xEeee...eEEeE`)
- `DEFAULT_SLIPPAGE_BPS` — `50` (0.5%)
- `DEFAULT_DEADLINE_SECONDS` — `1200` (20 min)
- `DEFAULT_EXECUTE_TIMEOUT_MS` — `60_000` (60 sec)
- `API_DEFAULTS` — default API parameters (depth, splitCount, providers, clientVersion)

### Classes and Helpers

- `PeachClient`, `ApiClient`, `RouteDiscovery`, `SwapBuilder`
- `ApiError` — API-level error with status code
- `ExecuteTimeoutError` — timeout error with `stage` and `txHash`
- `ProtocolType` — enum of supported protocols
- `withWalletSendTimeout()` — lightweight wallet send timeout wrapper
- `isNativeTokenAddress()` — check if address is native token sentinel

---

## Operational Notes

- `ApiClient` defaults to a 10-second HTTP timeout
- Use `withWalletSendTimeout()` in browser-wallet flows to avoid stuck pending states
- HTTP non-200 responses indicate transport or gateway failures
- Payloads with `code != 200` indicate API-level failures (use `ApiError`)
- Prefer `getQuote()` → `swap()` → app-managed sending for new integrations
