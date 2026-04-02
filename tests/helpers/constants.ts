/**
 * Test constants: token addresses, pool addresses, amounts, slippage.
 */

import { ethers } from 'ethers';
import { NATIVE_TOKEN_ADDRESS } from '../../src';
import { getNetworkConfig } from './config';

export { NATIVE_TOKEN_ADDRESS };

const CONFIG = getNetworkConfig();

// Token addresses (network-aware)
export const MAINNET_TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // Bitcoin BEP2
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // Ethereum BEP2
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // PancakeSwap
};

export const CHAPEL_TOKENS = {
  WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
  USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
  USDC: '0x64544969ed7EBf5f083679233325356EbE738930',
  BUSD: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
  BTCB: '', // Not available on testnet
  ETH: '', // Not available on testnet
  CAKE: '', // Not available on testnet
};

export const TOKENS = CONFIG.network === 'mainnet' ? MAINNET_TOKENS : CHAPEL_TOKENS;

// Peach deployed contracts
export const PEACH_CONTRACTS = {
  ROUTER: '0x893cD684bCB27D3D4d5Dba938daD9D196fC1e4e5',
  PANCAKEV2_ADAPTER: '0xF0a2802dc3CEc9D85CeFa120fa20d80241733F5E',
  PANCAKEV3_ADAPTER: '0x1cC809aE576babcE78e8D52E1cd3200797FdE208',
  UNISWAPV3_ADAPTER: '0x431753669c9082615038bff353204D0ACc4fb915',
  DODO_ADAPTER: '0xFC610C90196E1601118dCE85FEEBf9Dba346D405',
  THENA_ADAPTER: '0x7f9675B01ccDBbeb59f7D6710d8373B95496efC9',
};

export const PEACH_AGGREGATOR_ADDRESS = CONFIG.peachRouterAddress;

// Token decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.WBNB]: 18,
  [TOKENS.USDC]: 18,
  [TOKENS.USDT]: 18,
  [TOKENS.BUSD]: 18,
  [TOKENS.BTCB]: 18,
  [TOKENS.ETH]: 18,
  [TOKENS.CAKE]: 18,
};

// PancakeSwap V2
export const PANCAKE_V2 = {
  ROUTER: CONFIG.pancakeV2Router,
  FACTORY: CONFIG.pancakeV2Factory,
  INIT_CODE_HASH: '0xd0d4c4cd0848c93cb4fd1f498d7013ee6bfb25783ea21593d5834f5d250ece66',
  PAIRS: CONFIG.network === 'mainnet'
    ? { 'WBNB-USDC': '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0' }
    : { 'WBNB-USDC': '0xBBbEA32C9f6400d36ABA0804F907bd860BA8a96f' },
};

// PancakeSwap V3
export const PANCAKE_V3 = {
  FACTORY: CONFIG.pancakeV3Factory,
  QUOTER: CONFIG.pancakeV3Quoter,
  POOLS: CONFIG.network === 'mainnet'
    ? {
        'WBNB-USDC-0.01%': '0x3f2f68DB81e29c6fA5a4e197b9230a4545FDA979',
        'WBNB-USDC-0.05%': '0x133B3D95bAD5405d14d53473671200e9342723c8',
        'WBNB-USDT-0.01%': '0x172fcD41E0913e95784454560d5c68234FF1FEe0',
        'WBNB-USDT-0.05%': '0x36696169C63e42cd08ce11f5deeBbCeBae652050',
        'USDC-USDT-1%': '0x4f3126d5DE26413AbDCF6948943FB9D0847d9818',
      }
    : {
        'WBNB-USDC-0.01%': '0x750b4bEae21C8b43994b85EB26e7DAf8Eb06eCe2',
        'WBNB-USDC-0.05%': '0x3E9eB43FDcbC21790008AFc127AbE261F048ed58',
        'USDC-USDT-1%': '0x6BA8d27dC9D08e447fC1568e0B68d3E2340B62B8',
        'WBNB-USDT-0.01%': '0x29A37a042b71705F7231F6aa7022D5C30c52A588',
        'WBNB-USDT-0.05%': '0x2dbB5a4c235164B9f772179A43faca2c71a8abDB',
      },
};

// Test amounts (in wei)
export const TEST_AMOUNTS = {
  TINY: ethers.parseEther('0.0001'),
  SMALL: ethers.parseEther('0.001'),
  MEDIUM: ethers.parseEther('0.01'),
  LARGE: ethers.parseEther('0.1'),
};

// Slippage tolerance (basis points)
export const SLIPPAGE = {
  VERY_LOW: 10,    // 0.1%
  LOW: 50,         // 0.5%
  NORMAL: 100,     // 1%
  HIGH: 300,       // 3%
  TESTNET: 1000,   // 10%
};

// Peach Aggregator API (pre-release)
export const PEACH_API = {
  BASE_URL: process.env.PEACH_API_URL || 'https://api.peach.ag',
  FIND_ROUTES: '/router/find_routes',
  STATUS: '/router/status',
  VERSION: '1100000',
};

// Network info
export const TEST_CONFIG = {
  CHAIN_ID: CONFIG.chainId,
  RPC_URL: CONFIG.rpcUrl,
  NETWORK_NAME: CONFIG.network === 'mainnet' ? 'BSC Mainnet' : 'BSC Chapel Testnet',
};
