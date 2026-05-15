import {
  Account,
  http,
  PublicClient,
  Transport,
  WalletClient,
  createPublicClient,
  createWalletClient,
} from "viem";
import { SupportedChain, getChain } from "./chain.js";
import { mnemonicToAccount } from "viem/accounts";

/** Derive EVM account from `ADMIN_SEED` */
const getAccount = () => {
  if (!process.env.ADMIN_SEED) {
    throw new Error("ADMIN_SEED not configured");
  }
  return mnemonicToAccount(process.env.ADMIN_SEED);
};

/** Add `ALCHEMY_API_KEY` to headers for RPC calls */
const getTransport = (chain: SupportedChain) => {
  if (!process.env.ALCHEMY_API_KEY) {
    throw new Error(`ALCHEMY_API_KEY not configured`);
  }
  return http(chain.rpcUrls.default.http[0], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${process.env.ALCHEMY_API_KEY}`,
      },
    },
  });
};

/** Read-only client */
type ReadClient = PublicClient<Transport, SupportedChain>;
const getReadClient = (chainCode: string): ReadClient => {
  const chain = getChain(chainCode);
  const transport = getTransport(chain);
  return createPublicClient({
    chain,
    transport,
  });
};

/** Write client (used for sweeping deposits) */
type WriteClient = WalletClient<Transport, SupportedChain, Account>;
const getWriteClient = (chainCode: string): WriteClient => {
  const chain = getChain(chainCode);
  const transport = getTransport(chain);
  const account = getAccount();
  return createWalletClient({
    account,
    chain,
    transport,
  });
};

export { getAccount, getReadClient, ReadClient, getWriteClient, WriteClient };
