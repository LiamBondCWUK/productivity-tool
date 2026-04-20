#!/usr/bin/env node
/**
 * ics-calendar-fetch.mjs
 *
 * Fetches calendar events from an ICS/webcal feed and writes them
 * to dashboard-data.json in the same shape as outlook-calendar-fetch.ps1.
 *
 * Runs on Replit (Linux) — no Windows/Outlook dependencies.
 *
 * Env vars:
 *   ICS_CALENDAR_URL — Outlook "Publish Calendar" ICS URL
 *                      (Settings > Calendar > Shared Calendars > Publish)
 *
 * Usage: node scripts/ics-calendar-fetch.mjs [--dashboard-path <path>]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICS_URL = process.env.ICS_CALENDAR_URL;
const MAX_TODAY = 20;
const MAX_WEEK_AHEAD = 30;
const DAYS_AHEAD = 7;

// --- ICS Parser (minimal, no dependencies) ---

function parseIcsDate(value) {
  if (!value) return null;
  // Handle TZID format: DTSTART;TZID=GMT Standard Time:20260420T090000
  const colonIndex = value.indexOf(":");
  const dateStr = colonIndex >= 0 ? value.slice(colonIndex + 1) : value;

  // Format: 20260420T090000Z or 20260420T090000
  const match = dateStr.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc === "Z") {
    return new Date(
      Date.UTC(+year, +month - 1, +day, +hour, +minute, +second),
    );
  }
  // Local time — treat as local
  return new Date(+year, +month - 1, +day, +hour, +minute, +second);
}

function unfoldIcs(text) {
  // ICS line folding: CRLF + space = continuation
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcsEvents(icsText) {
  const unfolded = unfoldIcs(icsText);
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT" && current) {
      events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    // Parse property — handle both PROP:VALUE and PROP;PARAMS:VALUE
    if (line.startsWith("SUMMARY")) {
      const idx = line.indexOf(":");
      if (idx >= 0) current.summary = line.slice(idx + 1);
    } else if (line.startsWith("DTSTART")) {
      current.dtstart = parseIcsDate(line);
    } else if (line.startsWith("DTEND")) {
      current.dtend = parseIcsDate(line);
    } else if (line.startsWith("UID")) {
      const idx = line.indexOf(":");
      if (idx >= 0) current.uid = line.slice(idx + 1);
    } else if (line.startsWith("STATUS")) {
      const idx = line.indexOf(":");
      if (idx >= 0) current.status = line.slice(idx + 1).trim().toUpperCase();
    } else if (line.startsWith("CATEGORIES")) {
      const idx = line.indexOf(":");
      if (idx >= 0) current.categories = line.slice(idx + 1);
    }
  }

  return events;
}

// --- Focus block detection ---

const FOCUS_PATTERNS = [
  /focus/i,
  /deep work/i,
  /heads? down/i,
  /no meetings/i,
  /blocked time/i,
  /coding time/i,
  /maker time/i,
];

function isFocusBlock(title) {
  return FOCUS_PATTERNS.some((pattern) => pattern.test(title));
}

// --- Date helpers ---

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinDaysAhead(date, now, days) {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return date > now && date <= end;
}

// --- Main ---

async function main() {
  if (!ICS_URL) {
    console.error("ERROR: ICS_CALENDAR_URL env var is required");
    console.error(
      "Set it to your Outlook 'Publish Calendar' ICS URL from:",
    );
    console.error(
      "  Settings > Calendar > Shared Calendars > Publish Calendar > ICS link",
    );
    process.exit(1);
  }

  // Resolve dashboard data path
  let dashboardPath;
  const dashPathIndex = process.argv.indexOf("--dashboard-path");
  if (dashPathIndex >= 0 && process.argv[dashPathIndex + 1]) {
    dashboardPath = path.resolve(process.argv[dashPathIndex + 1]);
  } else {
    // Auto-detect: Replit vs local
    const replitPath = "/home/runner/workspace/dashboard/data/dashboard-data.json";
    const localPath = path.resolve(
      __dirname,
      "..",
      "workspace",
      "coordinator",
      "dashboard-data.json",
    );
    dashboardPath = fs.existsSync(replitPath) ? replitPath : localPath;
  }

  // Fetch ICS feed
  const fetchUrl = ICS_URL.replace(/^webcal:\/\//, "https://");
  console.log(`Fetching ICS from: ${fetchUrl.slice(0, 80)}...`);

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    console.error(`ICS fetch failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const icsText = await response.text();
  const rawEvents = parseIcsEvents(icsText);
  console.log(`Parsed ${rawEvents.length} events from ICS feed`);

  const now = new Date();

  // Convert to dashboard format
  const toCalendarEvent = (event) => ({
    id: event.uid || `${event.summary || "event"}-${event.dtstart?.toISOString() || "unknown"}`,
    title: event.summary || "Untitled event",
    startTime: event.dtstart?.toISOString() || new Date(0).toISOString(),
    endTime: event.dtend?.toISOString() || event.dtstart?.toISOString() || new Date(0).toISOString(),
    isFocusBlock: isFocusBlock(event.summary || ""),
    isCompleted:
      event.status === "COMPLETED" ||
      (event.dtend ? event.dtend < now : false),
  });

  // Filter and sort
  const todayEvents = rawEvents
    .filter((e) => e.dtstart && isSameDay(e.dtstart, now))
    .sort((a, b) => (a.dtstart || 0) - (b.dtstart || 0))
    .slice(0, MAX_TODAY)
    .map(toCalendarEvent);

  const weekAheadEvents = rawEvents
    .filter(
      (e) =>
        e.dtstart &&
        !isSameDay(e.dtstart, now) &&
        isWithinDaysAhead(e.dtstart, now, DAYS_AHEAD),
    )
    .sort((a, b) => (a.dtstart || 0) - (b.dtstart || 0))
    .slice(0, MAX_WEEK_AHEAD)
    .map(toCalendarEvent);

  const calendarData = {
    lastRefreshed: now.toISOString(),
    hasToken: true,
    source: "ics",
    today: todayEvents,
    weekAhead: weekAheadEvents,
  };

  // Merge into dashboard-data.json
  let existing = {};
  try {
    const raw = fs.readFileSync(dashboardPath, "utf-8");
    existing = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    // Start fresh
  }

  existing.calendar = calendarData;
  existing.meta = {
    ...(existing.meta || {}),
    lastUpdated: now.toISOString(),
  };

  fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
  fs.writeFileSync(dashboardPath, JSON.stringify(existing, null, 2), "utf-8");

  console.log(
    `Calendar updated: ${todayEvents.length} today, ${weekAheadEvents.length} week ahead`,
  );
  console.log(`Written to: ${dashboardPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
