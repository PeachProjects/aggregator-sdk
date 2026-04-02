/**
 * Simple Swap Example
 *
 * Demonstrates basic swap functionality with the Peach SDK
 */

import { BSC_TESTNET_CONFIG, PeachClient, withWalletSendTimeout } from '../src';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rpcUrl = process.env.RPC_URL || BSC_TESTNET_CONFIG.rpcUrl;
  const apiBaseUrl = process.env.PEACH_API_URL;
  const wbnbAddress = process.env.WBNB_ADDRESS || BSC_TESTNET_CONFIG.weth;
  const routerAddress = process.env.PEACH_ROUTER_ADDRESS;

  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  console.log('Using wallet:', await signer.getAddress());
  console.log('Network:', (await provider.getNetwork()).chainId);

  // Create Peach client
  const client = new PeachClient(
    {
      ...BSC_TESTNET_CONFIG,
      rpcUrl,
      routerAddress,
      weth: wbnbAddress,
    },
    provider,
    {
      api: apiBaseUrl ? { baseUrl: apiBaseUrl } : undefined,
    }
  );

  // Token addresses (BSC Chapel testnet)
  const WBNB = wbnbAddress;
  const BUSD = '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee'; // Chapel BUSD

  console.log('\n=== Getting Quote ===');

  // Get quote for 0.1 BNB -> BUSD
  const amountIn = ethers.parseEther('0.1');
  const quote = await client.getQuote({
    srcToken: WBNB,
    dstToken: BUSD,
    amountIn,
    options: {
      providers: ['PANCAKEV2', 'PANCAKEV3'],
    },
  });

  console.log('Input:', ethers.formatEther(quote.amountIn), 'BNB');
  console.log('Expected Output:', ethers.formatEther(quote.amountOut), 'BUSD');
  console.log('Price Impact:', quote.priceImpact);
  console.log('Gas Estimate:', quote.gasEstimate.toString());
  console.log('Router:', quote.routerAddress);
  console.log(
    'Steps:',
    quote.params.steps.map((step) => `${step.tokenIn} -> ${step.tokenOut}`).join(' | ')
  );

  console.log('\n=== Preparing Swap ===');

  const owner = await signer.getAddress();
  const prepared = await client.swap(quote, owner, { slippageBps: 100 });

  if (prepared.approval) {
    console.log('Submitting approval transaction...');
    const approvalTx = await withWalletSendTimeout(
      signer.sendTransaction(prepared.approval.tx)
    );
    console.log('Approval submitted:', approvalTx.hash);
    await approvalTx.wait();
  }

  console.log('Submitting swap transaction...');
  const tx = await withWalletSendTimeout(signer.sendTransaction(prepared.tx));
  console.log('Transaction submitted:', tx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();
  console.log('Swap completed!');
  console.log('Block:', receipt?.blockNumber);
  console.log('Gas used:', receipt?.gasUsed.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
