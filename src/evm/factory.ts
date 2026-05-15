import { getAddress, isAddress, isHash } from "viem/utils";
import { getAccount, WriteClient, ReadClient } from "./client.js";
import { Address, getContract, GetContractReturnType, Hash } from "viem";

/** The smart contract that enables deploying a deterministic bridge address for a given output key */
const factoryAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "FailedDeployment",
    type: "error",
    inputs: [],
  },
  {
    name: "InsufficientBalance",
    type: "error",
    inputs: [
      {
        name: "balance",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "needed",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "OwnableInvalidOwner",
    type: "error",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "OwnableUnauthorizedAccount",
    type: "error",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ReentrancyGuardReentrantCall",
    type: "error",
    inputs: [],
  },
  {
    name: "ZeroAddress",
    type: "error",
    inputs: [],
  },
  {
    name: "OwnershipTransferred",
    type: "event",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "SweeperDeployed",
    type: "event",
    inputs: [
      {
        name: "outputKey",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "sweeper",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "SweptEther",
    type: "event",
    inputs: [
      {
        name: "outputKey",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "etherAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "SweptToken",
    type: "event",
    inputs: [
      {
        name: "outputKey",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "computeSweeper",
    type: "function",
    inputs: [
      {
        name: "outputKey",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "sweeper",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "implementation",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "renounceOwnership",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "sweep",
    type: "function",
    inputs: [
      {
        name: "outputKey",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "sweeper",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "etherAmount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "transferOwnership",
    type: "function",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** Get the `EVM_FACTORY_ADDRESS` address from config */
const getFactoryAddress = () => {
  if (!isAddress(process.env.EVM_FACTORY_ADDRESS!)) {
    throw new Error(
      `Invalid EVM_FACTORY_ADDRESS: ${process.env.EVM_FACTORY_ADDRESS}`,
    );
  }
  return getAddress(process.env.EVM_FACTORY_ADDRESS);
};

/** Verify the factory owner matches the derived address from `ADMIN_SEED` */
const assertFactoryOwner = async (
  factory: GetContractReturnType<typeof factoryAbi, ReadClient | WriteClient>,
) => {
  const expectedOwner = getAccount().address;
  const result = await factory.read.owner();
  const actualOwner = getAddress(result);
  if (actualOwner !== expectedOwner) {
    throw new Error(
      `Expected factory owner ${expectedOwner}, got ${actualOwner}`,
    );
  }
};

/** Create a read-only client for the factory contract */
const getReadFactory = async (verifyOwner: boolean, client: ReadClient) => {
  const address = getFactoryAddress();
  const factory = getContract({
    address,
    abi: factoryAbi,
    client,
  });
  if (verifyOwner) {
    await assertFactoryOwner(factory);
  }
  return factory;
};

/** Create a write client for the factory contract (used for sweeping) */
const getWriteFactory = async (verifyOwner: boolean, client: WriteClient) => {
  const address = getFactoryAddress();
  const factory = getContract({
    address,
    abi: factoryAbi,
    client,
  });
  if (verifyOwner) {
    await assertFactoryOwner(factory);
  }
  return factory;
};

/** Get deterministic bridge address for a given output key */
const computeBridgeAddress = async (
  outputKey: Hash,
  verifyOwner: boolean,
  client: ReadClient,
) => {
  const factory = await getReadFactory(verifyOwner, client);
  const bridgeAddress = await factory.read.computeSweeper([outputKey]);
  return getAddress(bridgeAddress);
};

type SweptTokenEvent = {
  /** Token contract address */
  tokenAddress: Address;
  /** Raw token amount e.g. 1_000_000n */
  tokenAmount: bigint;
  /** Output key corresponding to this sweep */
  outputKey: Hash;
  /** EVM transaction hash where the token was swept */
  sweepTxHash: Hash;
  /** EVM log index where the token was swept */
  sweepLogIndex: number;
};

/** Get `SweptToken` event logs for a given output key */
const getSweptTokenEvents = async (
  outputKey: Hash,
  client: ReadClient,
  range: bigint = 50_000n,
  txHash?: string,
) => {
  let fromBlock = 0n;
  let toBlock = range;
  if (txHash) {
    if (!isHash(txHash)) {
      throw new Error(`Invalid transaction hash: ${txHash}`);
    }
    const tx = await client.getTransaction({
      hash: txHash,
    });
    if (tx.blockNumber === null) {
      throw new Error(`Transaction still pending: ${txHash}`);
    }
    fromBlock = tx.blockNumber;
  }
  const latestBlock = await client.getBlockNumber();
  if (fromBlock === 0n) {
    fromBlock = latestBlock > range ? latestBlock - range : 0n;
  }
  toBlock = latestBlock > fromBlock + range ? fromBlock + range : latestBlock;
  const factory = await getReadFactory(false, client);
  const events = await factory.getEvents.SweptToken(
    {
      outputKey,
    },
    {
      fromBlock,
      toBlock,
    },
  );
  return events.map(
    ({ transactionHash: sweepTxHash, logIndex: sweepLogIndex, args }) =>
      ({
        tokenAddress: getAddress(args.token!),
        tokenAmount: BigInt(args.tokenAmount!),
        outputKey: args.outputKey! as Hash,
        sweepTxHash,
        sweepLogIndex,
      }) as SweptTokenEvent,
  );
};

export { getWriteFactory, computeBridgeAddress, getSweptTokenEvents };
