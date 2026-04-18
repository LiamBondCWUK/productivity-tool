/**
 * Caseware Productivity Dashboard — Feedback Widget
 *
 * Embed in any Replit project by adding to your HTML <body>:
 *
 *   <script>
 *     window.FEEDBACK_WIDGET_URL = 'https://your-dashboard.replit.app';
 *     window.FEEDBACK_WIDGET_PROJECT = 'CW Release Notes Tool';
 *   </script>
 *   <script src="https://your-dashboard.replit.app/feedback-widget.js"></script>
 */
(function () {
  "use strict";

  var cfg = window.FEEDBACK_WIDGET_CONFIG || {};
  var apiUrl = cfg.apiUrl || window.FEEDBACK_WIDGET_URL || "";
  var project = cfg.project || window.FEEDBACK_WIDGET_PROJECT || document.title || "Unknown";

  if (!apiUrl) {
    console.warn("[FeedbackWidget] No apiUrl configured — widget disabled.");
    return;
  }

  /* ── Styles ─────────────────────────────────────────────── */
  var style = document.createElement("style");
  style.textContent = [
    "#fw-btn{position:fixed;bottom:20px;right:20px;z-index:9999;",
    "background:#2563eb;color:#fff;border:none;border-radius:24px;",
    "padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;",
    "box-shadow:0 4px 14px rgba(0,0,0,.35);transition:background .15s;}",
    "#fw-btn:hover{background:#1d4ed8;}",

    "#fw-overlay{display:none;position:fixed;inset:0;z-index:9998;",
    "background:rgba(0,0,0,.55);backdrop-filter:blur(2px);}",
    "#fw-overlay.fw-open{display:flex;align-items:center;justify-content:center;}",

    "#fw-modal{background:#1e293b;border:1px solid #334155;border-radius:12px;",
    "padding:24px;width:min(400px,90vw);box-shadow:0 20px 60px rgba(0,0,0,.5);}",

    "#fw-modal h3{margin:0 0 4px;font-size:15px;font-weight:700;color:#f1f5f9;}",
    "#fw-modal p.fw-sub{margin:0 0 14px;font-size:12px;color:#94a3b8;}",

    "#fw-textarea{width:100%;box-sizing:border-box;height:110px;resize:vertical;",
    "background:#0f172a;border:1px solid #334155;border-radius:8px;",
    "color:#e2e8f0;font-size:13px;padding:10px 12px;outline:none;}",
    "#fw-textarea:focus{border-color:#3b82f6;}",

    ".fw-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}",

    ".fw-btn-cancel{background:transparent;border:1px solid #475569;color:#94a3b8;",
    "border-radius:6px;padding:7px 16px;font-size:13px;cursor:pointer;}",
    ".fw-btn-cancel:hover{border-color:#64748b;color:#e2e8f0;}",

    ".fw-btn-submit{background:#2563eb;color:#fff;border:none;",
    "border-radius:6px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;}",
    ".fw-btn-submit:hover{background:#1d4ed8;}",
    ".fw-btn-submit:disabled{background:#334155;color:#64748b;cursor:not-allowed;}",

    ".fw-msg{font-size:12px;margin-top:8px;text-align:center;}",
    ".fw-msg.ok{color:#4ade80;}",
    ".fw-msg.err{color:#f87171;}",
  ].join("");
  document.head.appendChild(style);

  /* ── DOM ─────────────────────────────────────────────────── */
  var btn = document.createElement("button");
  btn.id = "fw-btn";
  btn.textContent = "💬 Feedback";

  var overlay = document.createElement("div");
  overlay.id = "fw-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Submit feedback");

  overlay.innerHTML = [
    '<div id="fw-modal">',
    '  <h3>Send Feedback</h3>',
    '  <p class="fw-sub">Sharing with: <strong style="color:#93c5fd">' + escHtml(project) + "</strong></p>",
    '  <textarea id="fw-textarea" placeholder="What could be better? Spotted a bug?" autocomplete="off"></textarea>',
    '  <div class="fw-actions">',
    '    <button class="fw-btn-cancel" id="fw-cancel">Cancel</button>',
    '    <button class="fw-btn-submit" id="fw-submit">Send</button>',
    "  </div>",
    '  <div class="fw-msg" id="fw-msg"></div>',
    "</div>",
  ].join("");

  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  /* ── Helpers ─────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function open() {
    overlay.classList.add("fw-open");
    var ta = document.getElementById("fw-textarea");
    if (ta) { ta.value = ""; ta.focus(); }
    var msg = document.getElementById("fw-msg");
    if (msg) msg.textContent = "";
  }

  function close() {
    overlay.classList.remove("fw-open");
  }

  /* ── Events ──────────────────────────────────────────────── */
  btn.addEventListener("click", open);

  document.getElementById("fw-cancel").addEventListener("click", close);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("fw-open")) close();
  });

  document.getElementById("fw-submit").addEventListener("click", function () {
    var ta = document.getElementById("fw-textarea");
    var submitBtn = document.getElementById("fw-submit");
    var msgEl = document.getElementById("fw-msg");
    var text = ta ? ta.value.trim() : "";

    if (!text) {
      msgEl.className = "fw-msg err";
      msgEl.textContent = "Please enter some feedback first.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    msgEl.textContent = "";

    var payload = JSON.stringify({ text: text, source: project });

    fetch(apiUrl.replace(/\/$/, "") + "/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        msgEl.className = "fw-msg ok";
        msgEl.textContent = "✓ Feedback sent — thank you!";
        submitBtn.textContent = "Sent ✓";
        setTimeout(close, 1400);
      })
      .catch(function (err) {
        msgEl.className = "fw-msg err";
        msgEl.textContent = "Failed to send (" + err.message + "). Please try again.";
        submitBtn.disabled = false;
        submitBtn.textContent = "Send";
      });
  });
})();
