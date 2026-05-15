import { Asset, IndexerProvider } from "@arkade-os/sdk";
import { hex, utf8 } from "@scure/base";
import { getChainCode } from "../evm/chain.js";

/** Consolidates a set of asset-containing outputs into a map */
const consolidateAssets = (
  outputs: Array<{
    assets?: Asset[];
  }>,
) => {
  const assets = new Map<string, bigint>();
  for (const output of outputs) {
    if (output.assets) {
      for (const { assetId, amount } of output.assets) {
        const current = assets.get(assetId) || 0n;
        assets.set(assetId, current + amount);
      }
    }
  }
  return assets;
};

type BridgedAssetMetadata = {
  /** EVM token contract address */
  tokenAddress: string;
  /** Human-readable chain code e.g. 'arbitrum' */
  chainCode: string;
  /** Machine-readable chain ID, e.g. 42161 */
  chainId: number;
  /** Token name e.g. Tether USD */
  name: string;
  /** Token symbol e.g. USDT */
  symbol: string;
  /** Token decimal precision e.g. 6 */
  decimals: number;
  /** Output key for this asset */
  outputKey: string;
  /** Control asset ID (always present for bridged assets) */
  controlAssetId: string;
  /** Asset ID */
  assetId: string;
};

/**
 * Get metadata for a set of asset IDs
 * @remarks ignores non-bridged assets
 */
const getBridgedAssetMetadata = async (
  assetIds: Set<string>,
  indexer: IndexerProvider,
) => {
  const assetMetadata = new Map<string, BridgedAssetMetadata>();
  for (const assetId of assetIds) {
    const asset = await indexer.getAssetDetails(assetId);
    /** Skip assets without controller */
    if (!asset.controlAssetId) continue;
    /** Skip assets without metadata */
    if (!asset.metadata) continue;
    const { name, ticker, decimals, tokenAddress, chainId, outputKey } =
      asset.metadata;
    /** Skip assets without required metadata fields */
    if (
      ![name, ticker, decimals, tokenAddress, chainId, outputKey].every(
        (field) => !!field,
      )
    ) {
      continue;
    }
    const _chainId = Number(utf8.encode(hex.decode(chainId! as string)));
    assetMetadata.set(assetId, {
      tokenAddress: utf8.encode(hex.decode(tokenAddress! as string)),
      chainCode: getChainCode(_chainId),
      chainId: _chainId,
      name: name!,
      symbol: ticker!,
      decimals: decimals!,
      outputKey: utf8.encode(hex.decode(outputKey! as string)),
      controlAssetId: asset.controlAssetId,
      assetId,
    });
  }
  return assetMetadata;
};

type BridgedAsset = BridgedAssetMetadata & {
  /** Raw asset amount e.g. 1_000_000 */
  assetAmount: bigint;
  /** Formatted token amount e.g. 1.000000 */
  formattedAmount: string;
};

/** Looks for bridged assets in a map of consolidated assets */
const parseBridgedAssets = async (
  assets: Map<string, bigint>,
  indexer: IndexerProvider,
) => {
  const assetIds = new Set(Array.from(assets.keys()));
  const bridgedAssetMetadata = await getBridgedAssetMetadata(assetIds, indexer);
  const bridgedAssets = new Map<string, BridgedAsset>();
  for (const [assetId, assetMetadata] of bridgedAssetMetadata.entries()) {
    const { decimals, controlAssetId } = assetMetadata;
    /** Skip assets that can't be reissued */
    if (!assets.has(controlAssetId)) continue;
    const assetAmount = assets.get(assetId)!;
    bridgedAssets.set(assetId, {
      ...assetMetadata,
      assetAmount,
      formattedAmount: (assetAmount / BigInt(10 ** decimals)).toString(),
    });
  }
  return bridgedAssets;
};

export { consolidateAssets, BridgedAssetMetadata, parseBridgedAssets };
