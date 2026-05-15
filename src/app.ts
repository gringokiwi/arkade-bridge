import cors from "cors";
import express from "express";
import {
  getAdminSummary,
  burnAdminAssets,
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
import { usdc, usdt } from "./evm/token.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const escapeHtml = (value: unknown) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPage = (content: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Arkade Asset Cloner</title>
    <script src="https://unpkg.com/htmx.org@2.0.4"></script>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #09090b; color: #f4f4f5; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(34, 197, 94, 0.18), transparent 34rem), #09090b; }
      main { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
      h1 { margin: 0 0 10px; font-size: clamp(36px, 7vw, 72px); letter-spacing: -0.06em; line-height: 0.95; }
      p { color: #a1a1aa; line-height: 1.6; }
      .hero { display: grid; gap: 20px; margin-bottom: 28px; }
      .panel { border: 1px solid #27272a; border-radius: 24px; padding: 22px; background: rgba(24, 24, 27, 0.76); box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35); }
      form { display: grid; gap: 14px; }
      label { color: #d4d4d8; font-weight: 650; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #3f3f46; border-radius: 16px; padding: 14px 16px; background: #09090b; color: #fafafa; font: inherit; }
      button, .button { width: fit-content; border: 0; border-radius: 999px; padding: 12px 18px; background: #84cc16; color: #111827; font-weight: 800; cursor: pointer; text-decoration: none; font: inherit; }
      button.secondary { background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; }
      button.danger { background: #f97316; color: #111827; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 0; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .card { border: 1px solid #27272a; border-radius: 18px; padding: 16px; background: rgba(9, 9, 11, 0.58); overflow-wrap: anywhere; }
      .muted { color: #a1a1aa; font-size: 14px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .error { border-color: #7f1d1d; background: rgba(127, 29, 29, 0.28); color: #fecaca; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { padding: 10px; border-bottom: 1px solid #27272a; text-align: left; vertical-align: top; }
      th { color: #d4d4d8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
      pre { overflow: auto; border-radius: 16px; padding: 14px; background: #030712; border: 1px solid #27272a; }
      .htmx-indicator { display: none; color: #a1a1aa; }
      .htmx-request .htmx-indicator, .htmx-request.htmx-indicator { display: inline; }
      @media (max-width: 640px) { main { padding: 28px 0; } .panel { padding: 16px; border-radius: 18px; } table { display: block; overflow-x: auto; } }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;

const renderError = (error: unknown) => `<div class="panel error">
  <strong>Error</strong>
  <p>${escapeHtml(error instanceof Error ? error.message : "Unexpected server error")}</p>
</div>`;

const decodeOutputKey = (address: string) =>
  getOutputKeyFromAddress(ArkAddress.decode(address));

const renderJson = (label: string, value: unknown) => `<section class="panel">
  <h2>${escapeHtml(label)}</h2>
  <pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>
</section>`;

const renderTokens = (
  label: string,
  tokens: Array<Record<string, unknown>>,
) => {
  if (!tokens.length) {
    return `<section class="panel"><h2>${escapeHtml(label)}</h2><p>No tokens found.</p></section>`;
  }
  return `<section class="panel">
    <h2>${escapeHtml(label)}</h2>
    <table>
      <thead><tr><th>Token</th><th>Network</th><th>Token amount</th><th>Token address</th></tr></thead>
      <tbody>${tokens
        .map(
          (token) => `<tr>
            <td>${escapeHtml(token.symbol ?? token.token ?? "-")}</td>
            <td>${escapeHtml(token.chainCode ?? token.network ?? "-")}</td>
            <td class="mono">${escapeHtml(token.formattedAmount ?? token.tokenAmount ?? "-")}</td>
            <td class="mono">${escapeHtml(token.tokenAddress ?? token.address ?? "-")}</td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>
  </section>`;
};

const renderSweptTokens = (
  address: string,
  tokens: Array<Record<string, unknown>>,
) => {
  if (!tokens.length) {
    return `<section class="panel"><h2>Swept deposits</h2><p>No tokens found.</p></section>`;
  }
  return `<section class="panel">
    <h2>Swept deposits</h2>
    <table>
      <thead><tr><th>Index</th><th>Token</th><th>Network</th><th>Amount</th><th>Address</th><th>Action</th></tr></thead>
      <tbody>${tokens
        .map(
          (token, index) => `<tr>
            <td class="mono">${escapeHtml(index)}</td>
            <td>${escapeHtml(token.symbol ?? token.token ?? "-")}</td>
            <td>${escapeHtml(token.chainCode ?? token.network ?? "-")}</td>
            <td class="mono">${escapeHtml(token.formattedAmount ?? token.tokenAmount ?? "-")}</td>
            <td class="mono">${escapeHtml(token.tokenAddress ?? token.address ?? "-")}</td>
            <td><button class="danger" type="button" hx-post="/ui/issue?address=${encodeURIComponent(address)}&index=${encodeURIComponent(index)}" hx-target="#token-results" hx-indicator="#token-loading" hx-confirm="Issue assets from swept deposit index ${escapeHtml(index)}?">Issue</button></td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>
  </section>`;
};

const renderAdminSummary = (summary: {
  address: string;
  balance: number;
  assets: Array<Record<string, unknown>>;
}) => `<section class="panel">
  <h2>Admin summary</h2>
  <div class="grid">
    <div class="card"><div class="muted">Arkade address</div><div class="mono">${escapeHtml(summary.address)}</div></div>
    <div class="card"><div class="muted">Spendable sats</div><div class="mono">${escapeHtml(summary.balance)}</div></div>
    <div class="card"><div class="muted">Cloned asset types</div><div class="mono">${escapeHtml(summary.assets.length)}</div></div>
  </div>
  <div class="actions">
    <button class="danger" type="button" hx-post="/ui/admin/burn" hx-target="#admin" hx-indicator="#loading" hx-confirm="Burn all admin assets? This cannot be undone.">Burn admin assets</button>
  </div>
  ${renderTokens("Admin cloned assets", summary.assets)}
</section>`;

app.get("/", (_req, res) => {
  res.type("html").send(
    renderPage(`<section class="hero">
      <div>
        <h1>Arkade Asset Cloner</h1>
        <p>Derive an EVM deposit address from an Arkade address, inspect pending deposits, sweep deposits, and issue cloned assets.</p>
      </div>
      <form class="panel" hx-get="/ui/derive" hx-target="#result" hx-indicator="#loading">
        <label for="address">Arkade address</label>
        <input id="address" name="address" placeholder="ark1..." value="ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5wyfd973r4nqtrnqp3cp742qzzgxl8kmqmj2ets85qvt66n775wh6vncjy" autocomplete="off" required>
        <div class="actions">
          <button type="submit">Derive deposit address</button>
          <button class="secondary" type="button" hx-get="/ui/admin" hx-target="#admin" hx-indicator="#loading">Admin summary</button>
          <span id="loading" class="htmx-indicator">Loading...</span>
        </div>
      </form>
      <div id="admin"></div>
      <div id="result"></div>
    </section>`),
  );
});

app.get("/ui/admin", async (_req, res) => {
  try {
    res.type("html").send(renderAdminSummary(await getAdminSummary()));
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.post("/ui/admin/burn", async (_req, res) => {
  try {
    const burns = await burnAdminAssets();
    const summary = await getAdminSummary();
    res
      .type("html")
      .send(
        `${renderJson("Burn results", burns)}${renderAdminSummary(summary)}`,
      );
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.get("/ui/derive", async (req, res) => {
  try {
    const address = String(req.query.address ?? "").trim();
    const outputKey = decodeOutputKey(address);
    const derivedAddress = await getBridgeAddress(outputKey);
    const depositTokens = [
      ...Object.values(usdt).map(({ address: tokenAddress, chainCode }) => ({
        token: "USDT",
        address: tokenAddress,
        network: chainCode,
      })),
      ...Object.values(usdc).map(({ address: tokenAddress, chainCode }) => ({
        token: "USDC",
        address: tokenAddress,
        network: chainCode,
      })),
    ];
    res.type("html").send(`<section class="panel">
      <h2>Deposit address</h2>
      <div class="grid">
        <div class="card"><div class="muted">EVM address</div><div class="mono">${escapeHtml(derivedAddress)}</div></div>
        <div class="card"><div class="muted">Output key</div><div class="mono">${escapeHtml(outputKey)}</div></div>
      </div>
      <div class="actions">
        <button class="secondary" type="button" hx-get="/ui/pending?address=${encodeURIComponent(address)}" hx-target="#token-results" hx-indicator="#token-loading">Check pending</button>
        <button class="secondary" type="button" hx-get="/ui/swept?address=${encodeURIComponent(address)}" hx-target="#token-results" hx-indicator="#token-loading">Check swept</button>
        <button class="danger" type="button" hx-post="/ui/sweep?address=${encodeURIComponent(address)}" hx-target="#token-results" hx-indicator="#token-loading" hx-confirm="Sweep all pending token deposits for this address?">Sweep</button>
        <span id="token-loading" class="htmx-indicator">Loading...</span>
      </div>
    </section>
    ${renderTokens("Supported deposit tokens", depositTokens)}
    <div id="token-results"></div>`);
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.get("/ui/pending", async (req, res) => {
  try {
    const outputKey = decodeOutputKey(String(req.query.address ?? "").trim());
    res
      .type("html")
      .send(
        renderTokens("Pending deposits", await getPendingTokens(outputKey)),
      );
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.get("/ui/swept", async (req, res) => {
  try {
    const address = String(req.query.address ?? "").trim();
    const outputKey = decodeOutputKey(address);
    res
      .type("html")
      .send(renderSweptTokens(address, await getSweptTokens(outputKey)));
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.post("/ui/sweep", async (req, res) => {
  try {
    const address = String(req.body.address ?? req.query.address ?? "").trim();
    const outputKey = decodeOutputKey(address);
    res
      .type("html")
      .send(renderJson("Sweep results", await sweepTokens(outputKey)));
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

app.post("/ui/issue", async (req, res) => {
  try {
    const address = String(req.body.address ?? req.query.address ?? "").trim();
    const index = Number(req.body.index ?? req.query.index ?? 0);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(
        `Invalid sweep index: ${req.body.index ?? req.query.index}`,
      );
    }
    const outputKey = decodeOutputKey(address);
    const sweptTokens = await getSweptTokens(outputKey);
    const sweep = sweptTokens?.[index];
    if (!sweep) {
      throw new Error(`No sweep found with index ${index}`);
    }
    const issueResult = await issueBridgedAsset(sweep);
    res
      .type("html")
      .send(renderJson("Issue result", { index, sweep, issueResult }));
  } catch (error) {
    res.status(500).type("html").send(renderError(error));
  }
});

/** Burn admin assets */
app.get("/admin/summary", async (_req, res) => {
  const summary = await getAdminSummary();
  res.json(summary);
});

/** Burn admin assets */
app.get("/admin/burn", async (_req, res) => {
  const burns = await burnAdminAssets();
  res.json(burns);
});

/** Derive EVM address corresponding to an Arkade address */
app.get("/derive/:address", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const derivedAddress = await getBridgeAddress(outputKey);
  const depositTokens = [
    ...Object.values(usdt).map(({ address, chainCode }) => ({
      token: "USDT",
      address: address,
      network: chainCode,
    })),
    ...Object.values(usdc).map(({ address, chainCode }) => ({
      token: "USDC",
      address: address,
      network: chainCode,
    })),
  ];
  res.json({
    address: req.params.address,
    outputKey,
    derivedAddress,
    depositTokens,
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

/** Process sweep */
app.get("/issue/:address{/:index}", async (req, res) => {
  const outputKey = getOutputKeyFromAddress(
    ArkAddress.decode(req.params.address),
  );
  const sweptTokens = await getSweptTokens(outputKey);
  const index = Number(req.params.index ?? 0);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid sweep index: ${req.params.index}`);
  }
  const sweep = sweptTokens?.[index];
  if (!sweep) {
    throw new Error(`No sweep found with index ${index}`);
  }
  const issue = await issueBridgedAsset(sweep);
  res.json({
    address: req.params.address,
    outputKey,
    index,
    sweep,
    issue,
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
