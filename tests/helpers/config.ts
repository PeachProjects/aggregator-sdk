/**
 * Network configuration from environment variables.
 * Loaded by vitest via dotenv/config setupFile.
 */

export type NetworkName = 'mainnet' | 'chapel';

export interface NetworkConfig {
  network: NetworkName;
  chainId: number;
  rpcUrl: string;
  peachRouterAddress: string;
  wbnbAddress: string;
  pancakeV2Factory: string;
  pancakeV2Router: string;
  pancakeV3Factory: string;
  pancakeV3Quoter: string;
}

/** Mainnet defaults so unit tests work without a .env file. */
const MAINNET_DEFAULTS: Record<string, string> = {
  MAINNET_CHAIN_ID: '56',
  MAINNET_RPC_URL: 'https://bsc-dataseed.binance.org',
  MAINNET_PEACH_ROUTER_ADDRESS: '0x371ba011c77493038318A9662E8E760448e0D87F',
  MAINNET_WBNB_ADDRESS: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  MAINNET_PANCAKE_V2_FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  MAINNET_PANCAKE_V2_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  MAINNET_PANCAKE_V3_FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  MAINNET_PANCAKE_V3_QUOTER: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
};

function getEnvOrThrow(key: string): string {
  const value = process.env[key] || MAINNET_DEFAULTS[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getNetwork(): NetworkName {
  const network = getEnvOrDefault('NETWORK', 'mainnet');
  if (network !== 'mainnet' && network !== 'chapel') {
    throw new Error(`Invalid NETWORK: ${network}. Must be "mainnet" or "chapel".`);
  }
  return network;
}

export function getPrivateKey(): string {
  return getEnvOrThrow('PRIVATE_KEY');
}

export function getNetworkConfig(network?: NetworkName): NetworkConfig {
  const net = network || getNetwork();
  const prefix = net === 'mainnet' ? 'MAINNET' : 'CHAPEL';

  return {
    network: net,
    chainId: Number(getEnvOrThrow(`${prefix}_CHAIN_ID`)),
    rpcUrl: getEnvOrThrow(`${prefix}_RPC_URL`),
    peachRouterAddress: getEnvOrThrow(`${prefix}_PEACH_ROUTER_ADDRESS`),
    wbnbAddress: getEnvOrThrow(`${prefix}_WBNB_ADDRESS`),
    pancakeV2Factory: getEnvOrThrow(`${prefix}_PANCAKE_V2_FACTORY`),
    pancakeV2Router: getEnvOrThrow(`${prefix}_PANCAKE_V2_ROUTER`),
    pancakeV3Factory: getEnvOrThrow(`${prefix}_PANCAKE_V3_FACTORY`),
    pancakeV3Quoter: getEnvOrThrow(`${prefix}_PANCAKE_V3_QUOTER`),
  };
}
