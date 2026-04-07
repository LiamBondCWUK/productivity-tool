/**
 * ecosystem.config.js — pm2 process definitions for Productivity Tool (DEV MODE)
 *
 * ⚠️  DEV MODE CONFIG — runs `npm run dev` (hot-reload, no build required)
 *     For production, use dashboard/ecosystem.config.js which runs `next start`
 *     on port 3002 with NODE_ENV=production.
 *
 * Usage:
 *   pm2 start workspace/coordinator/ecosystem.config.js
 *   pm2 status
 *   pm2 logs
 */

module.exports = {
  apps: [
    {
      name: "dashboard",
      cwd: "C:/Users/liam.bond/Documents/Productivity Tool/dashboard",
      script: "npm",
      args: "run dev",
      env: {
        NODE_ENV: "development",
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: "10s",
    },
    {
      name: "activity-tracker",
      cwd: "C:/Users/liam.bond/Documents/Productivity Tool",
      script: "scripts/activity-tracker.mjs",
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
