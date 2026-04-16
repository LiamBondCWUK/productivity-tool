module.exports = {
  apps: [
    {
      name: 'command-center',
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      cwd: 'C:\\Users\\liam.bond\\Documents\\Productivity Tool\\dashboard',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
