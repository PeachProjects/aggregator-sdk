---
title: Changelog
description: Release history for Peach Aggregator SDK.
---

# Changelog

## v0.1.1 — 2026-04-01

First official release.

### Highlights

- **7 DEX protocols**: PancakeV2, PancakeV3, PancakeInfinityCL, UniswapV3, UniswapV4, DODO, Thena
- **`getQuote()`** — route discovery with configurable providers, depth, and split count
- **`swap()`** — build approval + swap tx requests (recommended for browser-wallet flows)
- **`simulate()`** — preflight `eth_call` with optional ERC20 state overrides
- **`execute()`** — legacy one-step sign-and-send with timeout and polling backoff
- **Native BNB** support via `NATIVE_TOKEN_ADDRESS` sentinel, auto `swapETH` routing
- **Split routing** with multi-path allocation and dead-path filtering
- **`withWalletSendTimeout()`** and `ExecuteTimeoutError` for transaction recovery
- **Configurable API endpoint** — defaults to `https://api.peach.ag`, override via `options.api.baseUrl`
- Dual CJS/ESM build, ethers v6, Node.js >= 18
