#!/usr/bin/env node
/**
 * push-data-to-replit.mjs
 *
 * Pushes dashboard-data.json from local coordinator to the Replit deployment.
 * Run on a schedule or manually: node scripts/push-data-to-replit.mjs
 *
 * Env vars:
 *   REPLIT_DEPLOY_URL  — e.g. https://productivity-tool.replit.app
 *   SYNC_SECRET        — shared secret matching the Replit SYNC_SECRET env var
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPLIT_URL = process.env.REPLIT_DEPLOY_URL || "https://productivity-tool.replit.app";
const SYNC_SECRET = process.env.SYNC_SECRET;

if (!SYNC_SECRET) {
  console.error("ERROR: SYNC_SECRET env var is required");
  process.exit(1);
}

const dataPath = path.resolve(
  __dirname,
  "..",
  "workspace",
  "coordinator",
  "dashboard-data.json",
);

if (!fs.existsSync(dataPath)) {
  console.error(`ERROR: Data file not found at ${dataPath}`);
  process.exit(1);
}

const data = fs.readFileSync(dataPath, "utf-8");

console.log(`Pushing ${(Buffer.byteLength(data) / 1024).toFixed(1)} KB to ${REPLIT_URL}/api/data/sync`);

try {
  const response = await fetch(`${REPLIT_URL}/api/data/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SYNC_SECRET}`,
    },
    body: data,
  });

  const result = await response.json();

  if (!response.ok) {
    console.error(`FAILED (${response.status}):`, result);
    process.exit(1);
  }

  console.log("OK:", result);
} catch (err) {
  console.error("Network error:", err.message);
  process.exit(1);
}
