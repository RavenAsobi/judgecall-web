module.exports = {
  apps: [
    {
      name: "download-counter",
      script: "index.js",
      cwd: "/var/www/download/current/server",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "150M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3001",
        DOWNLOAD_DATA_DIR: "/var/www/download/shared/data",
      },
    },
  ],
};