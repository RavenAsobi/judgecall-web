module.exports = {
  apps: [{
    name: 'lynx',
    cwd: '/var/www/lynx/current/server',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '512M',
    cron_restart: '0 4 * * 1',
    kill_timeout: 10000,
    listen_timeout: 10000,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3000',
      LYNX_ENV_FILE: '/var/www/lynx/shared/.env',
    },
  }],
}

