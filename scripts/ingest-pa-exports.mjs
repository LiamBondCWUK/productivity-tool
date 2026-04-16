#!/usr/bin/env node
/**
 * ingest-pa-exports.mjs
 * Reads Power Automate-generated JSON exports from OneDrive and merges them
 * into workspace/coordinator/dashboard-data.json so the IBP generator,
 * real dashboard pipeline, and demo can consume them.
 *
 * OneDrive files (written by Power Automate scheduled flows):
 *   /teams-messages.json    — recent Teams chat activity
 *   /document-signals.json  — OneDrive file activity list
 *
 * Keys written into dashboard-data.json:
 *   paTeamsMessages   — array of Teams message objects from the PA flow
 *   paDocumentSignals — array of OneDrive file objects from the PA flow
 *
 * This script reads local OneDrive-synced files directly (no Graph auth required).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const LOCAL_ONEDRIVE_EXPORTS = {
  teams: [
    "C:/Users/liam.bond/OneDrive - Caseware Global (casewareonline.onmicrosoft.com, caseware.com)/teams-messages.json",
    "C:/Users/liam.bond/OneDrive/teams-messages.json",
  ],
  documents: [
    "C:/Users/liam.bond/OneDrive - Caseware Global (casewareonline.onmicrosoft.com, caseware.com)/document-signals.json",
    "C:/Users/liam.bond/OneDrive/document-signals.json",
  ],
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function resolveExistingPath(candidates) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function readLocalExport(candidates, label) {
  const resolvedPath = resolveExistingPath(candidates);
  if (!resolvedPath) {
    console.log(`[ingest-pa-exports] ${label} not found in synced OneDrive paths — skipping`);
    return { path: null, data: null };
  }

  try {
    const text = readFileSync(resolvedPath, "utf8");
    return { path: resolvedPath, data: JSON.parse(text) };
  } catch (err) {
    console.warn(`[ingest-pa-exports] Failed reading ${resolvedPath}: ${err.message}`);
    return { path: resolvedPath, data: null };
  }
}

function buildLocalDocumentSignals(baseDirectory) {
  try {
    return readdirSync(baseDirectory, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => {
        const fullPath = resolve(baseDirectory, entry.name);
        const details = statSync(fullPath);
        return {
          id: fullPath,
          name: entry.name,
          webUrl: fullPath,
          size: details.size,
          isFolder: entry.isDirectory(),
          createdDateTime: details.birthtime.toISOString(),
          lastModifiedDateTime: details.mtime.toISOString(),
          parentReference: {
            path: baseDirectory,
          },
        };
      });
  } catch (err) {
    console.warn(`[ingest-pa-exports] Failed building local document signals from ${baseDirectory}: ${err.message}`);
    return [];
  }
}

function writeRepairedDocumentSignals(filePath, items) {
  if (!filePath || !Array.isArray(items) || items.length === 0) return;
  try {
    // Keep Power Automate-compatible shape so future reads are deterministic.
    writeFileSync(filePath, JSON.stringify({ value: items }, null, 2));
    console.log(`[ingest-pa-exports] Repaired malformed document-signals.json at ${filePath}`);
  } catch (err) {
    console.warn(`[ingest-pa-exports] Failed repairing ${filePath}: ${err.message}`);
  }
}

/**
 * Normalise Teams messages from the PA flow output.
 * The PA flow captures the raw Graph response body — extract the value array.
 */
function normaliseTeamsMessages(raw) {
  if (!raw) return [];

  // PA stores the raw Graph API response: { value: [...] } or it may have been
  // stringified once then stored — handle both wrapped and bare array forms.
  if (Array.isArray(raw)) return raw;
  if (raw.value && Array.isArray(raw.value)) return raw.value;

  // Sometimes PA wraps in an extra layer from the flow body expression
  if (raw.body && Array.isArray(raw.body)) return raw.body;
  if (raw.body?.value && Array.isArray(raw.body.value)) return raw.body.value;

  return [];
}

/**
 * Normalise document signals from the PA flow output.
 * The PA flow stores the result of "List files in folder" — extract the file array.
 */
function normaliseDocumentSignals(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) return raw;
  if (raw.value && Array.isArray(raw.value)) return raw.value;

  return [];
}

async function ingestPAExports() {
  console.log("[ingest-pa-exports] Reading Power Automate exports from synced OneDrive...");
  const teamsResult = readLocalExport(LOCAL_ONEDRIVE_EXPORTS.teams, "teams-messages.json");
  const docsResult = readLocalExport(LOCAL_ONEDRIVE_EXPORTS.documents, "document-signals.json");

  const paTeamsMessages = normaliseTeamsMessages(teamsResult.data);
  let paDocumentSignals = normaliseDocumentSignals(docsResult.data);
  if (paDocumentSignals.length === 0) {
    const documentSignalsBaseDir = docsResult.path ? dirname(docsResult.path) : dirname(LOCAL_ONEDRIVE_EXPORTS.documents[0]);
    paDocumentSignals = buildLocalDocumentSignals(documentSignalsBaseDir).filter(
      (item) => basename(item.webUrl) !== "document-signals.json"
    );
    console.log(`[ingest-pa-exports] Falling back to local OneDrive listing for document signals from ${documentSignalsBaseDir}`);

    // If the flow wrote an invalid literal expression, self-heal the export file.
    if (!docsResult.data && docsResult.path) {
      writeRepairedDocumentSignals(docsResult.path, paDocumentSignals);
    }
  }

  console.log(`[ingest-pa-exports] teams messages: ${paTeamsMessages.length} items`);
  console.log(`[ingest-pa-exports] document signals: ${paDocumentSignals.length} items`);

  // Read current dashboard-data.json
  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});

  // Merge PA exports under dedicated keys
  const updated = {
    ...dashboardData,
    paTeamsMessages,
    paDocumentSignals,
    paExports: {
      teamsMessagesPath: teamsResult.path,
      documentSignalsPath: docsResult.path,
      ingestedAt: new Date().toISOString(),
    },
    meta: {
      ...(dashboardData.meta ?? {}),
      lastUpdated: new Date().toISOString(),
      paIngestionUpdated: new Date().toISOString(),
    },
  };

  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(updated, null, 2));
  console.log(`[ingest-pa-exports] dashboard-data.json updated — ${DASHBOARD_DATA_PATH}`);
}

ingestPAExports().catch((err) => {
  console.error("[ingest-pa-exports] Fatal:", err.message);
  process.exit(1);
});
