import {
  ArkAddress,
  ArkInfo,
  ArkProvider,
  DefaultVtxo,
  Identity,
  IndexerProvider,
  InMemoryContractRepository,
  InMemoryWalletRepository,
  isSpendable,
  MnemonicIdentity,
  networks,
  Wallet,
} from "@arkade-os/sdk";
import {
  getIndexer,
  getOperator,
  getOperatorPubkey,
  getScriptParams,
} from "./operator.js";
import { hex } from "@scure/base";

// Temporary polyfill to enable using `Wallet`
import { EventSource } from "eventsource";
globalThis.EventSource ??= EventSource as never;

/** Derive admin identity from `ADMIN_SEED` */
const getIdentity = () => {
  if (!process.env.ADMIN_SEED) {
    throw new Error("ADMIN_SEED not configured");
  }
  return MnemonicIdentity.fromMnemonic(process.env.ADMIN_SEED!);
};

/** Get address for a given identity */
const getAddress = async (identity: Identity, operatorInfo?: ArkInfo) => {
  const scriptParams = await getScriptParams(operatorInfo);
  const script = new DefaultVtxo.Script({
    pubKey: await identity.xOnlyPublicKey(),
    ...scriptParams,
  });
  const operatorPubkey = await getOperatorPubkey(operatorInfo);
  return script.address(networks.bitcoin.hrp, operatorPubkey);
};

/** Get spendable outputs for an address */
const getSpendableOutputs = async (
  address: ArkAddress,
  indexer: IndexerProvider,
) => {
  const { pkScript } = address;
  const { vtxos } = await indexer.getVtxos({
    scripts: [hex.encode(pkScript)],
    spendableOnly: true,
  });
  /** Sanity check */
  return vtxos.filter(
    (output) =>
      ["settled", "preconfirmed"].includes(output.virtualStatus.state) &&
      isSpendable(output),
  );
};

/**
 * Get previously sent asset outputs
 * @remarks used to avoid double-issuing a bridged asset
 */
const getAssetOutputs = async (
  address: ArkAddress,
  assetId: string,
  indexer: IndexerProvider,
) => {
  const { pkScript } = address;
  const { vtxos } = await indexer.getVtxos({
    scripts: [hex.encode(pkScript)],
  });
  return vtxos.filter((output) =>
    output.assets?.find((asset) => asset.assetId === assetId),
  );
};

/* Temporary while `AssetManager` not exposed */
const getWallet = async (
  identity?: Identity,
  indexer?: IndexerProvider,
  operator?: ArkProvider,
) => {
  const _identity = identity || getIdentity();
  const _indexer = indexer || getIndexer();
  const _operator = operator || getOperator();
  return await Wallet.create({
    identity: _identity,
    arkProvider: _operator,
    indexerProvider: _indexer,
    settlementConfig: false,
    storage: {
      walletRepository: new InMemoryWalletRepository(),
      contractRepository: new InMemoryContractRepository(),
    },
  });
};

export {
  getIdentity,
  getAddress,
  getSpendableOutputs,
  getAssetOutputs,
  getWallet,
};
