import fs from "fs";
import path from "path";
import type { DashboardData } from "../types/dashboard";

const DATA_FILE = path.resolve(
  process.env.DASHBOARD_DATA_PATH ||
    path.join(process.cwd(), "data", "dashboard-data.json"),
);

export function readDashboardData(): DashboardData {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as DashboardData;
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
