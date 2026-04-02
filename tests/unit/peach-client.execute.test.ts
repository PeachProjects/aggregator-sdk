import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";

import {
  PeachClient,
  BSC_MAINNET_CONFIG,
  DEFAULT_EXECUTE_TIMEOUT_MS,
  DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS,
  withWalletSendTimeout,
} from "../../src";
import { makeQuote } from "../helpers/peach-client-test-utils";

describe("withWalletSendTimeout()", () => {
  it("should reject with an ExecuteTimeoutError after the default timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = withWalletSendTimeout(new Promise(() => {}));
      const assertion = expect(pending).rejects.toMatchObject({
        name: "ExecuteTimeoutError",
        stage: "wallet_send",
        txHash: undefined,
        message: `Wallet did not settle sendTransaction within ${DEFAULT_EXECUTE_TIMEOUT_MS}ms.`,
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_EXECUTE_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PeachClient execute()", () => {
  const owner = "0x3333333333333333333333333333333333333333";
  const quote = makeQuote();

  it("should send approval first, then swap tx from swap()", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
    const approvalWait = vi.fn().mockResolvedValue({ status: 1 });
    const approvalResponse = { wait: approvalWait } as unknown as ethers.TransactionResponse;
    const swapResponse = { hash: "0xabc" } as ethers.TransactionResponse;
    const sendTransaction = vi.fn()
      .mockResolvedValueOnce(approvalResponse)
      .mockResolvedValueOnce(swapResponse);
    const signer = {
      getAddress: vi.fn().mockResolvedValue(owner),
      sendTransaction,
    } as unknown as ethers.Signer;

    vi.spyOn(c, "swap").mockResolvedValue({
      routerAddress: quote.routerAddress!,
      method: "swap",
      tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
      approval: {
        token: quote.srcToken,
        owner,
        spender: quote.routerAddress!,
        currentAllowance: 0n,
        requiredAmount: quote.amountIn,
        approveAmount: ethers.MaxUint256,
        tx: { to: quote.srcToken, data: "0xabcd", value: 0n },
      },
    });

    const result = await c.execute(quote, signer, { slippageBps: 50, timeoutMs: 1000 });

    expect(sendTransaction).toHaveBeenNthCalledWith(1, {
      to: quote.srcToken,
      data: "0xabcd",
      value: 0n,
    });
    expect(approvalWait).toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenNthCalledWith(2, {
      to: quote.routerAddress!,
      data: "0x1234",
      value: 0n,
    });
    expect(result).toBe(swapResponse);
  });

  it("should reject when the wallet send promise does not settle before timeout", async () => {
    vi.useFakeTimers();
    try {
      const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
      const signer = {
        getAddress: vi.fn().mockResolvedValue(owner),
        sendTransaction: vi.fn().mockImplementation(() => new Promise(() => {})),
      } as unknown as ethers.Signer;

      vi.spyOn(c, "swap").mockResolvedValue({
        routerAddress: quote.routerAddress!,
        method: "swap",
        tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
      });

      const pending = c.execute(quote, signer, { slippageBps: 50, timeoutMs: 250 });
      const assertion = expect(pending).rejects.toMatchObject({
        name: "ExecuteTimeoutError",
        stage: "wallet_send",
        txHash: undefined,
        message: "Wallet did not settle sendTransaction within 250ms.",
      });
      await vi.advanceTimersByTimeAsync(250);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("should use the default timeout when timeoutMs is omitted", async () => {
    vi.useFakeTimers();
    try {
      const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
      const signer = {
        getAddress: vi.fn().mockResolvedValue(owner),
        sendTransaction: vi.fn().mockImplementation(() => new Promise(() => {})),
      } as unknown as ethers.Signer;

      vi.spyOn(c, "swap").mockResolvedValue({
        routerAddress: quote.routerAddress!,
        method: "swap",
        tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
      });

      const pending = c.execute(quote, signer, { slippageBps: 50 });
      const assertion = expect(pending).rejects.toMatchObject({
        name: "ExecuteTimeoutError",
        stage: "wallet_send",
        txHash: undefined,
        message: `Wallet did not settle sendTransaction within ${DEFAULT_EXECUTE_TIMEOUT_MS}ms.`,
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_EXECUTE_TIMEOUT_MS);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("should return a tx response when sendUncheckedTransaction provides a hash quickly", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
    const txResponse = { hash: "0xhash" } as ethers.TransactionResponse;
    const provider = {
      getTransaction: vi.fn().mockResolvedValue(txResponse),
    } as unknown as ethers.Provider;
    const sendUncheckedTransaction = vi.fn().mockResolvedValue("0xhash");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(owner),
      provider,
      sendUncheckedTransaction,
      sendTransaction: vi.fn(),
    } as unknown as ethers.Signer;

    vi.spyOn(c, "swap").mockResolvedValue({
      routerAddress: quote.routerAddress!,
      method: "swap",
      tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
    });

    const result = await c.execute(quote, signer, { slippageBps: 50, timeoutMs: 250 });

    expect(sendUncheckedTransaction).toHaveBeenCalledWith({
      to: quote.routerAddress!,
      data: "0x1234",
      value: 0n,
    });
    expect((provider as unknown as { getTransaction: ReturnType<typeof vi.fn> }).getTransaction)
      .toHaveBeenCalledWith("0xhash");
    expect(result).toBe(txResponse);
  });

  it("should use the configured polling intervals before timing out on provider indexing", async () => {
    vi.useFakeTimers();
    try {
      const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
      const provider = {
        getTransaction: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.Provider;
      const signer = {
        getAddress: vi.fn().mockResolvedValue(owner),
        provider,
        sendUncheckedTransaction: vi.fn().mockResolvedValue("0xhash"),
        sendTransaction: vi.fn(),
      } as unknown as ethers.Signer;

      vi.spyOn(c, "swap").mockResolvedValue({
        routerAddress: quote.routerAddress!,
        method: "swap",
        tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
      });

      const pending = c.execute(quote, signer, {
        slippageBps: 50,
        timeoutMs: 250,
        transactionResponsePollingIntervalsMs: [10, 20, 40],
      });
      const assertion = expect(pending).rejects.toMatchObject({
        name: "ExecuteTimeoutError",
        stage: "provider_index",
        txHash: "0xhash",
        message:
          "Transaction was broadcast but provider did not return TransactionResponse within 250ms (8 null response(s)).",
      });
      await vi.advanceTimersByTimeAsync(300);

      await assertion;
      expect((provider as unknown as { getTransaction: ReturnType<typeof vi.fn> }).getTransaction)
        .toHaveBeenCalledTimes(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should mention transient provider errors separately from null responses", async () => {
    vi.useFakeTimers();
    try {
      const c = new PeachClient(BSC_MAINNET_CONFIG, {} as ethers.Provider);
      const provider = {
        getTransaction: vi.fn()
          .mockRejectedValueOnce(new Error("temporary rpc failure"))
          .mockResolvedValue(null),
      } as unknown as ethers.Provider;
      const signer = {
        getAddress: vi.fn().mockResolvedValue(owner),
        provider,
        sendUncheckedTransaction: vi.fn().mockResolvedValue("0xhash"),
        sendTransaction: vi.fn(),
      } as unknown as ethers.Signer;

      vi.spyOn(c, "swap").mockResolvedValue({
        routerAddress: quote.routerAddress!,
        method: "swap",
        tx: { to: quote.routerAddress!, data: "0x1234", value: 0n },
      });

      const pending = c.execute(quote, signer, {
        slippageBps: 50,
        timeoutMs: 200,
        transactionResponsePollingIntervalsMs: [50],
      });
      const assertion = expect(pending).rejects.toMatchObject({
        name: "ExecuteTimeoutError",
        stage: "provider_index",
        txHash: "0xhash",
        message:
          "Transaction was broadcast but provider did not return TransactionResponse within 200ms (1 transient provider error(s) and 3 null response(s)).",
      });
      await vi.advanceTimersByTimeAsync(250);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("should use the default polling backoff when no intervals are provided", () => {
    expect([...DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS]).toEqual([50, 100, 200, 400, 800, 1200]);
  });
});
