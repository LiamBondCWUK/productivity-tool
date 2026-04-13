import { readFileSync, writeFileSync } from "fs";

const p = "data/dashboard-data.json";
let raw = readFileSync(p, "utf8");

// Strip BOM if present
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

// Build replacements from the actual mojibake patterns
// â€" (U+00E2 U+20AC U+201D) → — (em dash U+2014)
// â€" (U+00E2 U+20AC U+201C) → – (en dash U+2013)  
// â†' (U+00E2 U+2020 U+2019) → → (arrow U+2192)
// â€™ (U+00E2 U+20AC U+2122) → ' (right single quote U+2019)
const replacements = [
  ["\u00e2\u20ac\u201d", "\u2014"],  // em dash
  ["\u00e2\u20ac\u201c", "\u2013"],  // en dash  
  ["\u00e2\u2020\u2019", "\u2192"],  // right arrow
  ["\u00e2\u20ac\u2122", "\u2019"],  // right single quote
  ["\u00e2\u20ac\u0153", "\u201c"],  // left double quote
  ["\u00e2\u20ac\u2dc", "\u2018"],   // left single quote
  ["\u00e2\u20ac\u00a6", "\u2026"],  // ellipsis
];

for (const [from, to] of replacements) {
  raw = raw.split(from).join(to);
}

// Check for any remaining â characters
const remaining = (raw.match(/\u00e2/g) || []).length;
console.log("Remaining \u00e2 chars:", remaining);

if (remaining > 0) {
  // Find and log remaining patterns for debugging
  const idx = raw.indexOf("\u00e2");
  if (idx >= 0) {
    const ctx = raw.substring(idx, idx + 5);
    console.log("Remaining pattern codes:", [...ctx].map(c => c.charCodeAt(0).toString(16)));
  }
}

writeFileSync(p, raw);
console.log("Encoding fixed and saved.");
