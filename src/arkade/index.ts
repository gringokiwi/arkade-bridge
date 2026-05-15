import { ArkAddress, ArkInfo, Identity, IndexerProvider } from "@arkade-os/sdk";
import {
  getAddress,
  getAssetOutputs,
  getIdentity,
  getSpendableOutputs,
  getWallet,
} from "./client.js";
import { consolidateAssets, parseBridgedAssets } from "./asset.js";
import { SweptToken } from "../evm/index.js";
import { getIndexer, getOperatorInfo, getOperatorPubkey } from "./operator.js";
import { hex } from "@scure/base";

const postage = 330n;

/** Get address from a hex-encoded output key */
const getAddressFromOutputKey = async (
  outputKey: string,
  operatorInfo?: ArkInfo,
) => {
  const operatorPubkey = await getOperatorPubkey(operatorInfo);
  const decoded = hex.decode(outputKey.slice(2));
  if (decoded.length !== 32) {
    throw new Error(
      `Expected outputKey to be 32 bytes, got ${decoded.length}: ${outputKey}`,
    );
  }
  return new ArkAddress(operatorPubkey, decoded);
};

/** Get hex-encoded output key from an address */
const getOutputKeyFromAddress = (address: ArkAddress) => {
  return "0x" + hex.encode(address.vtxoTaprootKey);
};

/** Process a `SweptToken` event and (re)issue a bridged asset */
const _issueBridgedAsset = async (
  sweptToken: SweptToken,
  identity: Identity,
  indexer: IndexerProvider,
  operatorInfo?: ArkInfo,
) => {
  /** Get sender address */
  const senderAddress = await getAddress(identity, operatorInfo);

  /** Fetch available inputs */
  const inputs = await getSpendableOutputs(senderAddress, indexer);

  /** Calculate input total */
  const inputTotal = inputs.reduce(
    (sum, input) => sum + BigInt(input.value),
    0n,
  );

  /** Throw error if no inputs provided + address is empty */
  if (inputTotal === 0n) {
    throw new Error(`No balance in address: ${senderAddress.encode()}`);
  }

  /**
   * Calculate change minimum
   * @remarks need at least 330 sats for asset receiver, as well as 330 for control asset
   */
  const changeMinimum = postage * 2n;

  /** Throw error if not enough for change */
  if (inputTotal < changeMinimum) {
    throw new Error(`Not enough funds for change: ${senderAddress.encode()}`);
  }

  /** Consolidate input assets */
  const inputAssets = consolidateAssets(inputs);

  /** Parse inputs for bridged assets */
  const bridgedAssets = await parseBridgedAssets(inputAssets, indexer);

  /** Look for existing asset in inputs */
  let existingAssetId = Array.from(bridgedAssets.values()).find((asset) => {
    if (asset.tokenAddress !== sweptToken.tokenAddress) return false;
    if (asset.chainId !== sweptToken.chainId) return false;
    if (asset.outputKey !== sweptToken.outputKey) return false;
    return true;
  })?.assetId;

  /* Temporary while `AssetManager` not exposed */
  const wallet = await getWallet(identity, indexer);
  const assetManager = wallet.assetManager;
  if ((await wallet.getAddress()) !== senderAddress.encode()) {
    throw new Error("Wallet address does not match derived sender address");
  }

  let assetId = existingAssetId;
  let assetAmount = BigInt(sweptToken.tokenAmount);

  /** Issue bridged asset if control asset not found */
  if (!existingAssetId) {
    const { arkTxId: controlIssueTxId, assetId: controlAssetId } =
      await assetManager.issue({
        amount: 1n,
        metadata: {
          tokenAddress: sweptToken.tokenAddress,
          chainCode: sweptToken.chainCode,
          chainId: sweptToken.chainId,
          name: `${sweptToken.name} (Control)`,
          ticker: `ctrl-${sweptToken.symbol}`,
          decimals: 0,
          outputKey: sweptToken.outputKey,
        },
      });
    console.log(
      `Issued control asset: https://arkade.space/tx/${controlIssueTxId}`,
    );
    console.log("Sleeping for 1 second...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { arkTxId: issueTxId, assetId: _assetId } = await assetManager.issue({
      /** Leave an extra asset in the wallet for identification */
      amount: assetAmount + 1n,
      controlAssetId,
      metadata: {
        tokenAddress: sweptToken.tokenAddress,
        chainCode: sweptToken.chainCode,
        chainId: sweptToken.chainId,
        name: sweptToken.name,
        ticker: sweptToken.symbol,
        decimals: sweptToken.decimals,
        outputKey: sweptToken.outputKey,
      },
    });
    console.log(`Issued bridged asset: https://arkade.space/tx/${issueTxId}`);
    assetId = _assetId;
    console.log("Sleeping for 1 second...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!assetId) {
    throw new Error("Sanity check: assetId should be defined");
  }

  /** Get recipient address */
  const recipientAddress = await getAddressFromOutputKey(sweptToken.outputKey);

  /** Check if asset was previously issued */
  const assetOutputs = await getAssetOutputs(
    recipientAddress,
    assetId,
    indexer,
  );
  const matchedOutput = assetOutputs.find(
    (output) =>
      !!output.assets?.find(
        (asset) => asset.assetId === assetId && asset.amount === assetAmount,
      ),
  );

  if (matchedOutput) {
    throw new Error(
      `Found existing asset output with matching amount: https://arkade.space/tx/${matchedOutput.txid}`,
    );
  }

  /** Reissue if existing asset ID found */
  if (existingAssetId) {
    const reissueTxId = await assetManager.reissue({
      amount: assetAmount,
      assetId,
    });
    console.log(
      `Reissued bridged asset: https://arkade.space/tx/${reissueTxId}`,
    );
    console.log("Sleeping for 1 second...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /** Send asset to recipient */
  const sendTxId = await wallet.send({
    address: recipientAddress.encode(),
    assets: [
      {
        assetId,
        amount: assetAmount,
      },
    ],
  });
  console.log(
    `Sent bridged asset to recipient: https://arkade.space/tx/${sendTxId}`,
  );

  return sendTxId;
};

/** Get admin balance */
const getAdminBalance = async () => {
  const identity = getIdentity();
  const operatorInfo = await getOperatorInfo();
  const address = await getAddress(identity, operatorInfo);
  const indexer = getIndexer();
  const inputs = await getSpendableOutputs(address, indexer);
  const balance = inputs.reduce((sum, input) => sum + input.value, 0);
  const inputAssets = consolidateAssets(inputs);
  const bridgedAssets = await parseBridgedAssets(inputAssets, indexer);
  return {
    address: address.encode(),
    balance,
    assets: Array.from(bridgedAssets.values()).map((asset) => ({
      ...asset,
      assetAmount: asset.assetAmount.toString(),
    })),
  };
};

const issueBridgedAsset = async (sweptToken: SweptToken) => {
  const identity = getIdentity();
  const indexer = getIndexer();
  const operatorInfo = await getOperatorInfo();
  return await _issueBridgedAsset(sweptToken, identity, indexer, operatorInfo);
};

const burnAdminAssets = async () => {
  const identity = getIdentity();
  const indexer = getIndexer();
  const wallet = await getWallet(identity, indexer);
  const assetManager = wallet.assetManager;
  const { assets } = await wallet.getBalance();
  for (const { assetId, amount } of assets) {
    await assetManager.burn({ assetId, amount });
  }
};

export {
  getAddressFromOutputKey,
  getOutputKeyFromAddress,
  getAdminBalance,
  issueBridgedAsset,
  burnAdminAssets,
};
