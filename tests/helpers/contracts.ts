/**
 * Contract helpers: provider, wallet, contract factories, liquidity checks.
 */

import { ethers } from 'ethers';
import { getPrivateKey } from './config';
import { TEST_CONFIG, PANCAKE_V2 } from './constants';

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
}

export function getTestWallet(provider?: ethers.Provider): ethers.Wallet {
  const privateKey = getPrivateKey();
  return provider
    ? new ethers.Wallet(privateKey, provider)
    : new ethers.Wallet(privateKey);
}

export function getTokenContract(
  tokenAddress: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): ethers.Contract {
  return new ethers.Contract(
    tokenAddress,
    [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function approve(address,uint256) returns (bool)',
      'function allowance(address,address) view returns (uint256)',
    ],
    signerOrProvider
  );
}

export function getV3PoolContract(
  poolAddress: string,
  provider: ethers.Provider
): ethers.Contract {
  return new ethers.Contract(
    poolAddress,
    [
      'function token0() view returns (address)',
      'function token1() view returns (address)',
      'function fee() view returns (uint24)',
      'function liquidity() view returns (uint128)',
      'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
    ],
    provider
  );
}

export function getV2PairContract(
  pairAddress: string,
  provider: ethers.Provider
): ethers.Contract {
  return new ethers.Contract(
    pairAddress,
    [
      'function getReserves() view returns (uint112,uint112,uint32)',
      'function token0() view returns (address)',
      'function token1() view returns (address)',
    ],
    provider
  );
}

export function calculateV2PairAddress(tokenA: string, tokenB: string): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  const salt = ethers.keccak256(
    ethers.solidityPacked(['address', 'address'], [token0, token1])
  );

  return ethers.getCreate2Address(
    PANCAKE_V2.FACTORY,
    salt,
    PANCAKE_V2.INIT_CODE_HASH
  );
}

export function calculateMinReturn(
  expectedAmount: bigint,
  slippageBps: number
): bigint {
  return expectedAmount * BigInt(10000 - slippageBps) / 10000n;
}

export function formatReceipt(receipt: ethers.TransactionReceipt | null): string {
  if (!receipt) return 'No receipt';
  return `Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed} | Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`;
}

export async function checkV2Liquidity(
  pairAddress: string,
  provider: ethers.Provider
): Promise<{ hasLiquidity: boolean; reserve0: bigint; reserve1: bigint }> {
  try {
    const pair = getV2PairContract(pairAddress, provider);
    const reserves = await pair.getReserves();
    return {
      hasLiquidity: reserves[0] > 0n && reserves[1] > 0n,
      reserve0: reserves[0],
      reserve1: reserves[1],
    };
  } catch {
    return { hasLiquidity: false, reserve0: 0n, reserve1: 0n };
  }
}

export async function checkV3Liquidity(
  poolAddress: string,
  provider: ethers.Provider
): Promise<{ hasLiquidity: boolean; liquidity: bigint }> {
  try {
    const pool = getV3PoolContract(poolAddress, provider);
    const liquidity = await pool.liquidity();
    return { hasLiquidity: liquidity > 0n, liquidity };
  } catch {
    return { hasLiquidity: false, liquidity: 0n };
  }
}
