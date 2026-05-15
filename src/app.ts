import cors from "cors";
import express from "express";
import {
  getAdminBalance,
  getOutputKeyFromAddress,
  issueBridgedAsset,
} from "./arkade/index.js";
import { ArkAddress } from "@arkade-os/sdk";
import {
  getBridgeAddress,
  getPendingTokens,
  getSweptTokens,
  sweepTokens,
} from "./evm/index.js";
import { chains, getChainCode } from "./evm/chain.js";
import { tokens } from "./evm/token.js";

const app = express();

app.use(cors());
app.use(express.json());

/** Get admin address + balances */
app.get("/admin", async (_req, res) => {
  const balance = await getAdminBalance();
  res.json(balance);
});

/** Derive EVM address corresponding to an Arkade address */
app.get("/derive/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const derivedAddress = await getBridgeAddress(outputKey);
  const availableNetworks = Object.keys(chains);
  const availableTokens = Object.values(tokens).map(
    ({ address, chainCode, chainId }) => ({
      tokenAddress: address,
      chainCode,
      chainId,
    }),
  );
  res.json({
    address: req.params.address,
    outputKey,
    derivedAddress,
    availableNetworks,
    availableTokens,
  });
});

/** Get pending (non-swept) token deposits */
app.get("/pending/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const pendingTokens = await getPendingTokens(outputKey);
  res.json({
    address: req.params.address,
    outputKey,
    pendingTokens,
  });
});

/** Sweep token deposits */
app.get("/sweep/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const sweepResults = await sweepTokens(outputKey);
  res.json({
    address: req.params.address,
    outputKey,
    sweepResults,
  });
});

/** Get swept token deposits */
app.get("/swept/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const sweptTokens = await getSweptTokens(outputKey);
  res.json({
    address: req.params.address,
    outputKey,
    sweptTokens,
  });
});

/** Process latest sweep */
app.get("/issue/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const sweptTokens = await getSweptTokens(outputKey);
  const latestSweep = sweptTokens?.[0];
  if (!latestSweep) {
    throw new Error("No sweep events found");
  }
  const issueResult = await issueBridgedAsset(latestSweep);
  res.json({
    address: req.params.address,
    outputKey,
    latestSweep,
    issueResult,
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  },
);

export default app;
