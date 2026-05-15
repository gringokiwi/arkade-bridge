import { Address, formatUnits, Hash, Hex, isHash } from "viem";
import { getWriteClient, getReadClient } from "./client.js";
import { getSweptTokenEvents, getWriteFactory } from "./factory.js";
import { getTokenBalances, getTokenMetadata, TokenMetadata } from "./token.js";
import { ChainCode, ChainId, getExplorerLink } from "./chain.js";
import { computeBridgeAddress } from "./factory.js";

/** Higher-level wrapper for computeBridgeAddress */
const getBridgeAddress = async (
  outputKey: string,
  chainCode: ChainCode = "arbitrum",
) => {
  if (!isHash(outputKey)) {
    throw new Error("Invalid output key");
  }
  const client = getReadClient(chainCode);
  return await computeBridgeAddress(outputKey, true, client);
};

type PendingToken = {
  /** Token contract address */
  tokenAddress: Address;
  /** Human-readable chain code e.g. 'arbitrum' */
  chainCode: ChainCode;
  /** Machine-readable chain ID, e.g. 42161 */
  chainId: ChainId;
} & TokenMetadata & {
    /** Raw token amount e.g. 1_000_000 */
    tokenAmount: string;
    /** Formatted token amount e.g. 1.000000 */
    formattedAmount: string;
  };

/** List pending token deposits associated with a given output key */
const getPendingTokens = async (
  outputKey: string,
  chainCodes: ChainCode[] = ["arbitrum", "ethereum", "optimism", "polygon"],
) => {
  if (!isHash(outputKey)) {
    throw new Error("Invalid output key");
  }
  const pendingTokens: PendingToken[] = [];
  for (const chainCode of chainCodes) {
    const client = getReadClient(chainCode);
    const bridgeAddress = await computeBridgeAddress(outputKey, false, client);
    const tokenBalances = await getTokenBalances(bridgeAddress, client);
    /** Skip processing if no token balances found */
    if (!tokenBalances.size) continue;
    const tokenAddresses = new Set(Array.from(tokenBalances.keys()));
    const tokenMetadata = await getTokenMetadata(tokenAddresses, client);
    for (const [tokenAddress, tokenAmount] of tokenBalances.entries()) {
      const { name, symbol, decimals } = tokenMetadata.get(tokenAddress)!;
      pendingTokens.push({
        tokenAddress,
        chainCode,
        chainId: client.chain.id,
        name,
        symbol,
        decimals,
        tokenAmount: tokenAmount.toString(),
        formattedAmount: formatUnits(tokenAmount, decimals),
      });
    }
  }
  return pendingTokens;
};

type SweptToken = PendingToken & {
  /** Output key corresponding to this sweep */
  outputKey: Hash;
  /** EVM transaction hash where the token was swept */
  sweepTxHash: Hash;
  /** EVM log index where the token was swept */
  sweepLogIndex: number;
};

/** List swept token deposits associated with a given output key */
const getSweptTokens = async (
  outputKey: string,
  chainCodes: ChainCode[] = ["arbitrum", "ethereum", "optimism", "polygon"],
) => {
  if (!isHash(outputKey)) {
    throw new Error("Invalid output key");
  }
  const sweptTokens: SweptToken[] = [];
  for (const chainCode of chainCodes) {
    const client = getReadClient(chainCode);
    const sweepEvents = await getSweptTokenEvents(outputKey, client);
    /** Skip processing if no sweep events found */
    if (!sweepEvents.length) continue;
    const tokenAddresses = new Set(
      sweepEvents.map((event) => event.tokenAddress),
    );
    const tokenMetadata = await getTokenMetadata(tokenAddresses, client);
    for (const {
      tokenAddress,
      tokenAmount,
      sweepTxHash,
      sweepLogIndex,
    } of sweepEvents) {
      const { name, symbol, decimals } = tokenMetadata.get(tokenAddress)!;
      sweptTokens.push({
        tokenAddress,
        chainCode,
        chainId: client.chain.id,
        name,
        symbol,
        decimals,
        tokenAmount: tokenAmount.toString(),
        formattedAmount: formatUnits(tokenAmount, decimals),
        outputKey,
        sweepTxHash,
        sweepLogIndex,
      });
    }
  }
  return sweptTokens;
};

type SweepRequest = {
  /** Token contract address */
  tokenAddress: Address;
  /** Human-readable chain code e.g. 'arbitrum' */
  chainCode: ChainCode;
  /** Raw token amount e.g. 1_000_000 */
  tokenAmount: string;
  /** Output key corresponding to this sweep */
  outputKey: Hash;
} & (
  | {
      /** EVM transaction hash where the token was swept */
      sweepTxHash: Hash;
    }
  | {
      /** Reason for skipping sweep */
      skipReason: string;
    }
);

/** Sweep token deposits for a given output key */
const sweepTokens = async (
  outputKey: string,
  chainCodes: ChainCode[] = ["arbitrum", "ethereum", "optimism", "polygon"],
) => {
  if (!isHash(outputKey)) {
    throw new Error("Invalid output key");
  }
  const sweepRequests: SweepRequest[] = [];
  for (const chainCode of chainCodes) {
    const readClient = getReadClient(chainCode);
    const bridgeAddress = await computeBridgeAddress(
      outputKey,
      false,
      readClient,
    );
    const tokenBalances = await getTokenBalances(bridgeAddress, readClient);
    /** Skip processing if no token balances found */
    if (!tokenBalances.size) continue;
    const writeClient = getWriteClient(chainCode);
    const factory = await getWriteFactory(true, writeClient);
    for (const [tokenAddress, tokenAmount] of tokenBalances.entries()) {
      const sweepRequest = {
        tokenAddress,
        chainCode,
        tokenAmount: tokenAmount.toString(),
        outputKey,
      } as const;
      /** Don't process amounts less than $5 for Ethereum */
      if (chainCode === "ethereum" && tokenAmount < 5_000_000) {
        sweepRequests.push({
          ...sweepRequest,
          skipReason: `Value too low: ${getExplorerLink(bridgeAddress, chainCode)}`,
        });
        continue;
      }
      const sweepTxHash = await factory.write.sweep([outputKey, tokenAddress]);
      sweepRequests.push({
        ...sweepRequest,
        sweepTxHash,
      });
    }
  }
  return sweepRequests;
};

export {
  getBridgeAddress,
  PendingToken,
  getPendingTokens,
  SweptToken,
  getSweptTokens,
  SweepRequest,
  sweepTokens,
};
