---
title: Overview
description: Overview of Peach Aggregator — BSC DEX aggregation SDK with multi-protocol routing, simulation, and swap execution.
---

# Overview

Peach Aggregator is a BSC DEX aggregation service with a TypeScript SDK for route discovery, quote retrieval, transaction preparation, simulation, and swap execution.

## What It Does

Peach is built for integrators that need:

- **Route discovery** — find optimal swap paths across multiple DEX protocols
- **Quote retrieval** — get real-time price quotes with gas estimates and price impact
- **Transaction preparation** — build ready-to-sign approval and swap transactions
- **Simulation** — verify swap outcomes via `eth_call` before broadcasting
- **Error recovery** — diagnose failing steps and recover from timeout or stale routes

## Supported DEX Protocols

| Provider | Protocol | Description |
| --- | --- | --- |
| `PANCAKEV2` | PancakeSwap V2 | AMM constant-product pools |
| `PANCAKEV3` | PancakeSwap V3 | Concentrated liquidity pools |
| `PANCAKE_INFINITY_CL` | PancakeSwap Infinity CL | PancakeSwap Infinity concentrated liquidity |
| `UNISWAPV3` | Uniswap V3 | Concentrated liquidity pools |
| `UNISWAPV4` | Uniswap V4 | Singleton pool architecture |
| `DODO` | DODO | PMM (Proactive Market Maker) pools |
| `THENA` | Thena | ve(3,3) AMM pools |

All seven providers are enabled by default. You can restrict to specific providers via `options.providers` in `getQuote()`.

## Current Scope

- **Chain**: BSC (mainnet chain ID 56, testnet chain ID 97)
- **Runtime**: Node.js >= 18, browser environments with ethers v6
- **Package**: `@peachprojects/aggregator-sdk`
- **Recommended integration path**: SDK (`PeachClient`)
- **Direct API support**:
  - `GET /router/find_routes` — route discovery and quote
  - `GET /router/status` — provider availability and chainflow sync status

## Integration Entry Points

### SDK

Use the SDK when you want the fastest integration path and a cleaner abstraction around quotes, approvals, and transaction building.

```ts
import { PeachClient, BSC_MAINNET_CONFIG } from "@peachprojects/aggregator-sdk";

const client = new PeachClient(config, provider?, options?);
```

Recommended flow:

1. `getQuote()` — retrieve a quote with routing details
2. `swap()` — build approval + swap transaction requests
3. Send transactions via your wallet/signer
4. `simulate()` — optional preflight verification

### API

Use the API directly when you want full control over the request layer and map Peach routing into your own internal models.

- `GET /router/find_routes` — returns route paths, amounts, gas estimate, and contract addresses
- `GET /router/status` — returns available providers and chainflow sync status

## Documentation Structure

- **Getting Started**: install, initialize, and run the minimum integration
- **Core Features**: quote, approve, swap, simulate, and error recovery
- **API Reference**: HTTP endpoints, SDK exports, and operational notes
- **Changelog**: release history and migration direction

{% content-ref url="getting-started.md" %}
[getting-started.md](getting-started.md)
{% endcontent-ref %}

{% content-ref url="core-features.md" %}
[core-features.md](core-features.md)
{% endcontent-ref %}

{% content-ref url="api-reference.md" %}
[api-reference.md](api-reference.md)
{% endcontent-ref %}

{% content-ref url="changelog.md" %}
[changelog.md](changelog.md)
{% endcontent-ref %}
