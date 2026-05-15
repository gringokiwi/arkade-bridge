import { isAddress, isHash } from "viem/utils";
import { arbitrum, mainnet as ethereum, optimism, polygon } from "viem/chains";
import { defineChain } from "viem/chains/utils";

const chains = {
  arbitrum: defineChain({
    ...arbitrum,
    rpcUrls: {
      default: {
        http: ["https://arb-mainnet.g.alchemy.com/v2/"],
      },
    },
  }),
  ethereum: defineChain({
    ...ethereum,
    rpcUrls: {
      default: {
        http: ["https://eth-mainnet.g.alchemy.com/v2/"],
      },
    },
  }),
  optimism: defineChain({
    ...optimism,
    rpcUrls: {
      default: {
        http: ["https://opt-mainnet.g.alchemy.com/v2/"],
      },
    },
  }),
  polygon: defineChain({
    ...polygon,
    rpcUrls: {
      default: {
        http: ["https://polygon-mainnet.g.alchemy.com/v2/"],
      },
    },
  }),
} as const;

type ChainCode = keyof typeof chains;
type SupportedChain = (typeof chains)[ChainCode];
type ChainId = SupportedChain["id"];

/** Get configuration for a given chain code */
const getChain = (chainCode: string) => {
  const chain = chains[chainCode as ChainCode];
  if (!chain) {
    throw new Error(`Chain not found: ${chainCode}`);
  }
  return chain;
};

const chainIdMap = {
  [arbitrum.id]: "arbitrum",
  [ethereum.id]: "ethereum",
  [optimism.id]: "optimism",
  [polygon.id]: "polygon",
} as const satisfies Record<ChainId, ChainCode>;

/** Get human-readable chain code from a machine-readable ID */
const getChainCode = (chainId: number) => {
  const chainCode = chainIdMap[chainId as ChainId];
  if (!chainCode) {
    throw new Error(`Chain code not found: ${chainId}`);
  }
  return chainCode;
};

/** Get explorer link for a given transaction hash or address */
const getExplorerLink = (string: string, chainCode: string) => {
  const chain = getChain(chainCode);
  if (isAddress(string)) {
    return `${chain.blockExplorers.default.url}/address/${string}`;
  }
  if (isHash(string)) {
    return `${chain.blockExplorers.default.url}/tx/${string}`;
  }
  throw new Error(`Could not generate ${chain.name} explorer link: ${string}`);
};

export {
  chains,
  ChainCode,
  SupportedChain,
  ChainId,
  getChain,
  getChainCode,
  getExplorerLink,
};
