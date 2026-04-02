---
title: Getting Started
description: Install the SDK, initialize the client, and complete your first swap in under 5 minutes.
---

# Getting Started

## Install

```bash
npm install @peachprojects/aggregator-sdk ethers
```

Requires Node.js >= 18 and ethers v6.

## Initialize

```ts
import { PeachClient, BSC_MAINNET_CONFIG } from "@peachprojects/aggregator-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org");

const client = new PeachClient(BSC_MAINNET_CONFIG, provider);
// Uses https://api.peach.ag by default. Override with:
// new PeachClient(config, provider, { api: { baseUrl: "https://api.cipheron.org" } });
```

You can also build a quote locally with `buildQuoteFromRouteData()` if you already have route data from the API.

## Get a Quote

```ts
const quote = await client.getQuote({
  srcToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  dstToken: "0x55d398326f99059fF775485246999027B3197955", // USDT
  amountIn: ethers.parseEther("1"),
});
```

All seven DEX providers are queried by default. To restrict routing:

```ts
const quote = await client.getQuote({
  srcToken,
  dstToken,
  amountIn,
  options: {
    providers: ["PANCAKEV3", "UNISWAPV3"],
  },
});
```

## Prepare and Send the Swap

```ts
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const owner = await signer.getAddress();

const prepared = await client.swap(quote, owner, { slippageBps: 50 });

// Step 1: Approve if needed (ERC20 input only; native BNB skips this)
if (prepared.approval) {
  const approvalTx = await signer.sendTransaction(prepared.approval.tx);
  await approvalTx.wait();
}

// Step 2: Execute the swap
const swapTx = await signer.sendTransaction(prepared.tx);
await swapTx.wait();
```

`swap()` returns transaction requests — it does not broadcast. You control when and how to send.

## Optional: Simulate Before Sending

```ts
const { amountOut, method } = await client.simulate(quote, 50);
console.log("Simulated output:", amountOut.toString());
```

Simulation runs an `eth_call` with no gas cost or state change, useful for verifying the quote before committing.

## Direct API

If you prefer not to use the SDK, call the routing API directly:

| Endpoint | Purpose |
| --- | --- |
| `GET /router/find_routes` | Route discovery and quote |
| `GET /router/status` | Provider availability and sync status |

See [Core Features](core-features.md) for full API reference and query parameters.
