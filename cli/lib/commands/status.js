import chalk from 'chalk';
import { loadConfig, configExists } from '../config.js';
import { getContainerStatus } from '../docker.js';
import { isServerRunning, getServerPid } from '../process-manager.js';
import { checkClaudeApiServer } from '../network.js';

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

  // Check deployment mode
  const isPiSplit = config.deployment && config.deployment.mode === 'pi-split';

  // Claude API Server
  console.log(chalk.bold('Claude API Server:'));
  if (isPiSplit) {
    // Pi-split mode: Check remote Mac server
    const apiUrl = `http://${config.deployment.pi.macIp}:${config.server.claudeApiPort}`;
    const apiHealth = await checkClaudeApiServer(apiUrl);

    if (apiHealth.healthy) {
      console.log(chalk.green(`  ✓ Connected to Mac (${config.deployment.pi.macIp}:${config.server.claudeApiPort})`));
      console.log(chalk.gray('    Remote API server is healthy'));
    } else {
      console.log(chalk.red(`  ✗ Cannot reach Mac API server`));
      console.log(chalk.gray(`    Tried: ${apiUrl}`));
      console.log(chalk.gray('    Run "claude-phone api-server" on your Mac'));
    }
  } else {
    // Standard mode: Check local server
    const serverRunning = await isServerRunning();
    if (serverRunning) {
      const pid = getServerPid();
      console.log(chalk.green(`  ✓ Running (PID: ${pid})`));
      console.log(chalk.gray(`    Port: ${config.server.claudeApiPort}`));
    } else {
      console.log(chalk.red('  ✗ Not running'));
    }
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
  if (isPiSplit) {
    console.log(chalk.gray(`  Deployment Mode: Pi Split`));
    console.log(chalk.gray(`  Pi IP: ${config.server.externalIp}`));
    console.log(chalk.gray(`  Mac IP: ${config.deployment.pi.macIp}`));
    console.log(chalk.gray(`  Drachtio Port: ${config.deployment.pi.drachtioPort}`));
    if (config.deployment.pi.has3cxSbc) {
      console.log(chalk.yellow('  3CX SBC detected (using port 5080)'));
    }
  } else {
    console.log(chalk.gray(`  Deployment Mode: Standard`));
    console.log(chalk.gray(`  External IP: ${config.server.externalIp}`));
  }
  console.log(chalk.gray(`  SIP Domain: ${config.sip.domain}`));
  console.log(chalk.gray(`  SIP Registrar: ${config.sip.registrar}`));

  console.log();
}
