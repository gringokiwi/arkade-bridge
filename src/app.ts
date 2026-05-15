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
  const pendingTokens = await getPendingTokens(outputKey);
  const sweptTokens = await getSweptTokens(outputKey);
  res.json({
    address: req.params.address,
    outputKey,
    derivedAddress,
    pendingTokens,
    sweptTokens,
  });
});

/** Sweep funds from an EVM bridge address corresponding to an Arkade address */
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

/** Validate an EVM token sweep event and mint a bridged Arkade asset */
app.get("/validate/:address", async (req, res) => {
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
