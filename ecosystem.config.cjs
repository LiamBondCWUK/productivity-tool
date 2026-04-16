/**
 * ecosystem.config.js — PM2 process configuration for Productivity Tool
 *
 * Manages two processes:
 *   1. dashboard  — Next.js command center UI (port 3000)
 *   2. vibe-kanban — BloopAI Kanban board for agent-driven task management
 *
 * Start all:  pm2 start ecosystem.config.js
 * Stop all:   pm2 stop ecosystem.config.js
 * Logs:       pm2 logs
 * Status:     pm2 list
 */

const path = require("path");
const projectRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "dashboard",
      script: "npm",
      args: "start",
      cwd: path.join(projectRoot, "dashboard"),
      env: {
        PORT: 3002,
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      log_file: path.join(projectRoot, "logs/dashboard.log"),
      out_file: path.join(projectRoot, "logs/dashboard-out.log"),
      error_file: path.join(projectRoot, "logs/dashboard-err.log"),
    },
    {
      name: "vibe-kanban",
      script: "npx",
      args: "vibe-kanban",
      cwd: projectRoot,
      env: {
        // vibe-kanban auto-assigns a port and writes it to a file.
        // Read workspace/config/vibe-kanban.json portFile to discover it.
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      log_file: path.join(projectRoot, "logs/vibe-kanban.log"),
      out_file: path.join(projectRoot, "logs/vibe-kanban-out.log"),
      error_file: path.join(projectRoot, "logs/vibe-kanban-err.log"),
    },
  ],
};
