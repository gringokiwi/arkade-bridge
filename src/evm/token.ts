import { ReadClient } from "./client.js";
import { Address, erc20Abi, getAddress } from "viem";
import { ChainCode, ChainId, chains } from "./chain.js";

/** Used by getTokenMetadata */
type TokenMetadata = {
  /** Token name e.g. Tether USD */
  name: string;
  /** Token symbol e.g. USDT */
  symbol: string;
  /** Token decimal precision e.g. 6 */
  decimals: number;
};

/**
 * USDC deployments
 * Last updated 2026-05-13
 * https://developers.circle.com/stablecoins/usdc-contract-addresses
 * https://developers.circle.com/cctp/concepts/supported-chains-and-domains
 * https://developers.circle.com/cctp/references/contract-addresses
 */
const usdc = [
  {
    chainCode: "arbitrum",
    chainId: chains.arbitrum.id,
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    domain: 3,
  },
  {
    chainCode: "ethereum",
    chainId: chains.ethereum.id,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    domain: 0,
  },
  {
    chainCode: "optimism",
    chainId: chains.optimism.id,
    address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    domain: 2,
  },
  {
    chainCode: "polygon",
    chainId: chains.polygon.id,
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    domain: 7,
  },
] as const satisfies Array<{
  chainCode: ChainCode;
  chainId: ChainId;
  address: Address;
  tokenMessenger: Address;
  messageTransmitter: Address;
  domain: number;
}>;

/**
 * USDT0 native deployments
 * Last updated 2026-05-13
 * https://tether.to/en/supported-protocols
 * https://docs.usdt0.to/technical-documentation/deployments
 */
const usdt = [
  {
    chainCode: "arbitrum",
    chainId: chains.arbitrum.id,
    address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    oft: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92",
    eid: 30110,
  },
  {
    chainCode: "ethereum",
    chainId: chains.ethereum.id,
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    oft: "0x1F748c76dE468e9D11bd340fA9D5CBADf315dFB0",
    eid: 30101,
  },
  {
    chainCode: "optimism",
    chainId: chains.optimism.id,
    address: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    oft: "0xF03b4d9AC1D5d1E7c4cEf54C2A313b9fe051A0aD",
    eid: 30111,
  },
  {
    chainCode: "polygon",
    chainId: chains.polygon.id,
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    oft: "0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13",
    eid: 30109,
  },
] as const satisfies Array<{
  chainCode: ChainCode;
  chainId: ChainId;
  address: Address;
  oft: Address;
  eid: number;
}>;

const tokens = [...usdc, ...usdt] as const;

/** Get token balances for an address */
const getTokenBalances = async (address: Address, client: ReadClient) => {
  const tokenBalances = new Map<Address, bigint>();
  const filteredTokens = tokens.filter(
    (token) => token.chainId === client.chain.id,
  );
  if (!filteredTokens.length) {
    return tokenBalances;
  }
  const contracts = filteredTokens.map(
    (token) =>
      ({
        address: getAddress(token.address),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }) as const,
  );
  const results = await client.multicall({
    contracts,
    allowFailure: false,
  });
  for (const [_index, token] of Object.entries(filteredTokens)) {
    const index = Number(_index);
    const tokenAmount = BigInt(results[index]);
    if (tokenAmount > 0n) {
      tokenBalances.set(getAddress(token.address), tokenAmount);
    }
  }
  return tokenBalances;
};

/** Get metadata for a set of given token addresses */
const getTokenMetadata = async (
  tokenAddresses: Set<Address>,
  client: ReadClient,
) => {
  const tokenMetadata = new Map<Address, TokenMetadata>();
  const filteredTokens = tokens.filter(
    (token) =>
      token.chainId === client.chain.id &&
      tokenAddresses.has(getAddress(token.address)),
  );
  if (!filteredTokens.length) {
    return tokenMetadata;
  }
  const contracts = filteredTokens.flatMap((token) => {
    const address = getAddress(token.address);
    return [
      {
        address,
        abi: erc20Abi,
        functionName: "name",
      },
      {
        address,
        abi: erc20Abi,
        functionName: "symbol",
      },
      {
        address,
        abi: erc20Abi,
        functionName: "decimals",
      },
    ] as const;
  });
  const results = await client.multicall({
    contracts,
    allowFailure: false,
  });
  for (const [_index, token] of Object.entries(filteredTokens)) {
    const index = Number(_index) * 3;
    const name = results[index] as string;
    const symbol = results[index + 1] as string;
    const decimals = results[index + 2] as number;
    tokenMetadata.set(getAddress(token.address), {
      name,
      symbol,
      decimals,
    });
  }
  return tokenMetadata;
};

export { usdc, usdt, TokenMetadata, getTokenBalances, getTokenMetadata };
