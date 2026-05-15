import {
  ArkInfo,
  ReadonlySingleKey,
  RelativeTimelock,
  RestArkProvider,
  RestIndexerProvider,
} from "@arkade-os/sdk";
import { hex } from "@scure/base";

const OPERATOR_URL = "https://arkade.computer" as const;

const getOperator = () => new RestArkProvider(OPERATOR_URL);

const getOperatorInfo = () => getOperator().getInfo();

/** Extract x-only pubkey from operator info */
const getOperatorPubkey = async (operatorInfo?: ArkInfo) => {
  const _operatorInfo = operatorInfo || (await getOperatorInfo());
  const { signerPubkey } = _operatorInfo;
  return ReadonlySingleKey.fromPublicKey(
    hex.decode(signerPubkey),
  ).xOnlyPublicKey();
};

/** Extract params for constructing the `DefaultVtxo.Script` */
const getScriptParams = async (operatorInfo?: ArkInfo) => {
  const _operatorInfo = operatorInfo || (await getOperatorInfo());
  const serverPubKey = await getOperatorPubkey(_operatorInfo);
  const csvTimelock: RelativeTimelock = {
    value: _operatorInfo.unilateralExitDelay,
    type: "seconds",
  };
  return { csvTimelock, serverPubKey };
};

const getIndexer = () => new RestIndexerProvider(OPERATOR_URL);

export {
  getOperator,
  getOperatorInfo,
  getOperatorPubkey,
  getScriptParams,
  getIndexer,
};
