import chalk from 'chalk';
import { spawn } from 'child_process';
import axios from 'axios';
import { loadConfig, configExists, getDockerComposePath, getPidPath } from '../config.js';
import fs from 'fs';

/**
 * Logs command - Tail service logs
 * @param {string} [service] - Optional service name (voice-app or api-server)
 * @returns {Promise<void>}
 */
export async function logsCommand(service = null) {
  if (!configExists()) {
    console.log(chalk.red('\n✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();
  const dockerComposePath = getDockerComposePath();

  // Validate service argument
  const validServices = ['voice-app', 'api-server'];
  if (service && !validServices.includes(service)) {
    console.log(chalk.red(`\n✗ Invalid service: ${service}`));
    console.log(chalk.gray('  Valid services: voice-app, api-server'));
    console.log(chalk.gray('  Or omit service to tail all logs\n'));
    process.exit(1);
  }

  // Header
  if (service) {
    console.log(chalk.bold.cyan(`\n📋 Tailing logs for ${service}...\n`));
  } else {
    console.log(chalk.bold.cyan('\n📋 Tailing all service logs...\n'));
  }

  // Handle different service options
  if (!service || service === 'voice-app') {
    // Docker container logs
    if (!fs.existsSync(dockerComposePath)) {
      console.log(chalk.yellow('⚠ Docker containers not configured'));
      console.log(chalk.gray('  Run "claude-phone start" first\n'));
      if (service === 'voice-app') {
        process.exit(1);
      }
    } else if (!service) {
      // Both services - interleave logs
      tailBothServices(dockerComposePath, config);
      return;
    } else {
      // Just voice-app
      tailDockerLogs(dockerComposePath);
      return;
    }
  }

  if (!service || service === 'api-server') {
    // API server logs
    const pidPath = getPidPath();
    if (!fs.existsSync(pidPath)) {
      console.log(chalk.yellow('⚠ Claude API server not running'));
      console.log(chalk.gray('  Run "claude-phone start" first\n'));
      if (service === 'api-server') {
        process.exit(1);
      }
    } else if (service === 'api-server') {
      tailAPIServerLogs(config);
      return;
    }
  }
}

/**
 * Tail Docker container logs
 * @param {string} dockerComposePath - Path to docker-compose.yml
 */
function tailDockerLogs(dockerComposePath) {
  const child = spawn('docker', [
    'compose',
    '-f',
    dockerComposePath,
    'logs',
    '-f',
    '--tail=50'
  ], {
    stdio: 'inherit'
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    console.log(chalk.gray('\n\nStopped tailing logs.\n'));
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n✗ Docker logs failed with exit code ${code}\n`));
      process.exit(code);
    }
  });
}

/**
 * Tail API server logs
 * @param {object} config - Configuration object
 */
function tailAPIServerLogs(config) {
  console.log(chalk.gray('Watching Claude API server output...\n'));

  // Since the server runs detached, we can't easily tail its logs
  // Instead, we'll monitor its health endpoint
  console.log(chalk.yellow('Note: API server logs are not available (runs detached)'));
  console.log(chalk.gray('Monitoring health endpoint instead...\n'));

  let consecutiveFailures = 0;

  const checkHealth = async () => {
    try {
      const response = await axios.get(`http://localhost:${config.server.claudeApiPort}/health`, {
        timeout: 3000
      });

      if (response.status === 200) {
        console.log(chalk.green(`[${new Date().toISOString()}] ✓ API server healthy`));
        consecutiveFailures = 0;
      } else {
        console.log(chalk.yellow(`[${new Date().toISOString()}] ⚠ Unexpected status: ${response.status}`));
      }
    } catch (error) {
      consecutiveFailures++;
      console.log(chalk.red(`[${new Date().toISOString()}] ✗ Health check failed: ${error.message}`));

      if (consecutiveFailures >= 3) {
        console.log(chalk.red('\n✗ API server appears to be down. Stopping health checks.\n'));
        process.exit(1);
      }
    }
  };

  // Check immediately, then every 5 seconds
  checkHealth();
  const interval = setInterval(checkHealth, 5000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(chalk.gray('\n\nStopped monitoring API server.\n'));
    process.exit(0);
  });
}

/**
 * Tail both services with interleaved output
 * @param {string} dockerComposePath - Path to docker-compose.yml
 * @param {object} _config - Configuration object (unused)
 */
function tailBothServices(dockerComposePath, _config) {
  console.log(chalk.gray('Showing Docker container logs (API server logs not available)\n'));

  const child = spawn('docker', [
    'compose',
    '-f',
    dockerComposePath,
    'logs',
    '-f',
    '--tail=50'
  ], {
    stdio: 'inherit'
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    console.log(chalk.gray('\n\nStopped tailing logs.\n'));
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n✗ Docker logs failed with exit code ${code}\n`));
      process.exit(code);
    }
  });
}
