module.exports = {
  apps: [
    {
      name: "command-center",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3002,
        DASHBOARD_DATA_PATH:
          "C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/dashboard-data.json",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
