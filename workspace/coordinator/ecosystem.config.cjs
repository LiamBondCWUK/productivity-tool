/**
 * ecosystem.config.js — pm2 process definitions for Productivity Tool
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
