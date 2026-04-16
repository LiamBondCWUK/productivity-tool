import fs from "fs";
import path from "path";
import type { DashboardData } from "../types/dashboard";

function resolveDashboardDataFile(): string {
  const envPath = process.env.DASHBOARD_DATA_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }

  const candidates = [
    path.resolve(process.cwd(), "..", "workspace", "coordinator", "dashboard-data.json"),
    path.resolve(process.cwd(), "workspace", "coordinator", "dashboard-data.json"),
    path.resolve(process.cwd(), "Productivity Tool", "workspace", "coordinator", "dashboard-data.json"),
    path.resolve(process.cwd(), "data", "dashboard-data.json"),
    path.resolve(process.cwd(), "dashboard", "data", "dashboard-data.json"),
    path.resolve(process.cwd(), "Productivity Tool", "dashboard", "data", "dashboard-data.json"),
  ];

  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  return existingPath ?? candidates[candidates.length - 1];
}

const DATA_FILE = resolveDashboardDataFile();

function resolveFallbackDataFile(): string {
  const candidates = [
    path.resolve(path.dirname(DATA_FILE), "..", "..", "dashboard", "data", "dashboard-data.json"),
    path.resolve(process.cwd(), "dashboard", "data", "dashboard-data.json"),
    path.resolve(process.cwd(), "Productivity Tool", "dashboard", "data", "dashboard-data.json"),
    path.resolve(process.cwd(), "data", "dashboard-data.json"),
  ];

  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  return existingPath ?? candidates[candidates.length - 1];
}

const FALLBACK_DATA_FILE = resolveFallbackDataFile();

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const normalized = removeUtf8Bom(raw);
    return JSON.parse(normalized) as T;
  } catch {
    return fallback;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeRecords<T>(base: T, override: T): T {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override;
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeRecords(existing, value)
        : value;
  }

  return merged as T;
}

function removeUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function readDashboardData(): DashboardData {
  const liveData = readJsonFile<DashboardData>(DATA_FILE, {} as DashboardData);

  if (DATA_FILE === FALLBACK_DATA_FILE || !fs.existsSync(FALLBACK_DATA_FILE)) {
    return liveData;
  }

  const fallbackData = readJsonFile<DashboardData>(
    FALLBACK_DATA_FILE,
    {} as DashboardData,
  );

  return mergeRecords(fallbackData, liveData);
}

export function writeDashboardData(data: DashboardData): void {
  const updated: DashboardData = {
    ...data,
    meta: {
      ...data.meta,
      lastUpdated: new Date().toISOString(),
    },
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

export function watchDashboardData(callback: () => void): fs.FSWatcher {
  return fs.watch(DATA_FILE, () => {
    callback();
  });
}

export { DATA_FILE };
