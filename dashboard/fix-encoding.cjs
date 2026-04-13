const fs = require("fs");

const p = "data/dashboard-data.json";
let raw = fs.readFileSync(p, "utf8");

// Strip BOM
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

// Build mojibake replacement pairs using fromCharCode to avoid escape issues
const replacements = [
  // â€" → — (em dash)
  [String.fromCharCode(0x00e2, 0x20ac, 0x201d), String.fromCharCode(0x2014)],
  // â€" variant → – (en dash)
  [String.fromCharCode(0x00e2, 0x20ac, 0x201c), String.fromCharCode(0x2013)],
  // â†' → → (right arrow)
  [String.fromCharCode(0x00e2, 0x2020, 0x2019), String.fromCharCode(0x2192)],
  // â€™ → ' (right single quote)
  [String.fromCharCode(0x00e2, 0x20ac, 0x2122), String.fromCharCode(0x2019)],
  // â€œ → " (left double quote)
  [String.fromCharCode(0x00e2, 0x20ac, 0x0153), String.fromCharCode(0x201c)],
  // â€˜ → ' (left single quote)
  [String.fromCharCode(0x00e2, 0x20ac, 0x02dc), String.fromCharCode(0x2018)],
  // â€¦ → … (ellipsis)
  [String.fromCharCode(0x00e2, 0x20ac, 0x00a6), String.fromCharCode(0x2026)],
];

let totalFixed = 0;
for (const [from, to] of replacements) {
  const count = raw.split(from).length - 1;
  if (count > 0) {
    console.log(`Replacing ${count} occurrences: [${[...from].map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ')}] -> ${to}`);
    totalFixed += count;
  }
  raw = raw.split(from).join(to);
}

// Check remaining
const remaining = (raw.match(new RegExp(String.fromCharCode(0x00e2), 'g')) || []).length;
console.log(`Total fixed: ${totalFixed}, remaining ${String.fromCharCode(0x00e2)} chars: ${remaining}`);

if (remaining > 0) {
  const idx = raw.indexOf(String.fromCharCode(0x00e2));
  const ctx = raw.substring(idx, idx + 5);
  console.log("Remaining pattern:", [...ctx].map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')));
  console.log("Context:", JSON.stringify(raw.substring(Math.max(0, idx - 20), idx + 20)));
}

fs.writeFileSync(p, raw);
console.log("Done - file saved.");
