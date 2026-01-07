import chalk from 'chalk';
import { loadConfig, configExists } from '../config.js';
import { getContainerStatus } from '../docker.js';
import { isServerRunning, getServerPid } from '../process-manager.js';

/**
 * Status command - Show service status
 * @returns {Promise<void>}
 */
export async function statusCommand() {
  console.log(chalk.bold.cyan('\n📊 Claude Phone Status\n'));

  // Check if configured
  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    return;
  }

  const config = await loadConfig();

  // Claude API Server
  console.log(chalk.bold('Claude API Server:'));
  const serverRunning = await isServerRunning();
  if (serverRunning) {
    const pid = getServerPid();
    console.log(chalk.green(`  ✓ Running (PID: ${pid})`));
    console.log(chalk.gray(`    Port: ${config.server.claudeApiPort}`));
  } else {
    console.log(chalk.red('  ✗ Not running'));
  }

  // Docker Containers
  console.log(chalk.bold('\nDocker Containers:'));
  const containers = await getContainerStatus();

  if (containers.length === 0) {
    console.log(chalk.red('  ✗ No containers running'));
  } else {
    for (const container of containers) {
      const isRunning = container.status.toLowerCase().includes('up') ||
                        container.status.toLowerCase().includes('running');
      const icon = isRunning ? '✓' : '✗';
      const color = isRunning ? chalk.green : chalk.red;
      console.log(color(`  ${icon} ${container.name}: ${container.status}`));
    }
  }

  // Devices
  console.log(chalk.bold('\nConfigured Devices:'));
  for (const device of config.devices) {
    console.log(chalk.gray(`  • ${device.name} (extension ${device.extension})`));
  }

  // Network
  console.log(chalk.bold('\nNetwork:'));
  console.log(chalk.gray(`  External IP: ${config.server.externalIp}`));
  console.log(chalk.gray(`  SIP Domain: ${config.sip.domain}`));
  console.log(chalk.gray(`  SIP Registrar: ${config.sip.registrar}`));

  console.log();
}
