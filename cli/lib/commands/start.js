import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { loadConfig, configExists } from '../config.js';
import { checkDocker, writeDockerConfig, startContainers } from '../docker.js';
import { startServer, isServerRunning } from '../process-manager.js';
import { isClaudeInstalled, sleep } from '../utils.js';

/**
 * Start command - Launch all services
 * @returns {Promise<void>}
 */
export async function startCommand() {
  console.log(chalk.bold.cyan('\n🚀 Starting Claude Phone\n'));

  // Check if configured
  if (!configExists()) {
    console.log(chalk.red('✗ Configuration not found'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  // Load config
  const config = await loadConfig();

  // Verify paths
  if (!fs.existsSync(config.paths.voiceApp)) {
    console.log(chalk.red(`✗ Voice app not found at: ${config.paths.voiceApp}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  if (!fs.existsSync(config.paths.claudeApiServer)) {
    console.log(chalk.red(`✗ Claude API server not found at: ${config.paths.claudeApiServer}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  // Check Claude CLI
  if (!(await isClaudeInstalled())) {
    console.log(chalk.yellow('⚠️  Claude CLI not found'));
    console.log(chalk.gray('  Install from: https://claude.com/download\n'));
  }

  // Check Docker
  const spinner = ora('Checking Docker...').start();
  const dockerStatus = await checkDocker();

  if (!dockerStatus.installed || !dockerStatus.running) {
    spinner.fail(dockerStatus.error);
    process.exit(1);
  }
  spinner.succeed('Docker is ready');

  // Generate Docker config
  spinner.start('Generating Docker configuration...');
  try {
    await writeDockerConfig(config);

    // Also write devices.json to voice-app/config
    const devicesPath = path.join(config.paths.voiceApp, 'config', 'devices.json');
    const devicesConfig = {};
    for (const device of config.devices) {
      devicesConfig[device.extension] = device;
    }
    await fs.promises.writeFile(devicesPath, JSON.stringify(devicesConfig, null, 2), { mode: 0o644 });

    spinner.succeed('Docker configuration generated');
  } catch (error) {
    spinner.fail(`Failed to generate config: ${error.message}`);
    throw error;
  }

  // Start Docker containers
  spinner.start('Starting Docker containers...');
  try {
    await startContainers();
    spinner.succeed('Docker containers started');
  } catch (error) {
    spinner.fail(`Failed to start containers: ${error.message}`);
    throw error;
  }

  // Wait a bit for containers to initialize
  spinner.start('Waiting for containers to initialize...');
  await sleep(3000);
  spinner.succeed('Containers initialized');

  // Start claude-api-server
  spinner.start('Starting Claude API server...');
  try {
    if (await isServerRunning()) {
      spinner.warn('Claude API server already running');
    } else {
      await startServer(config.paths.claudeApiServer, config.server.claudeApiPort);
      spinner.succeed(`Claude API server started on port ${config.server.claudeApiPort}`);
    }
  } catch (error) {
    spinner.fail(`Failed to start server: ${error.message}`);
    throw error;
  }

  // Success
  console.log(chalk.bold.green('\n✓ All services running!\n'));
  console.log(chalk.gray('Services:'));
  console.log(chalk.gray(`  • Docker containers: drachtio, freeswitch, voice-app`));
  console.log(chalk.gray(`  • Claude API server: http://localhost:${config.server.claudeApiPort}`));
  console.log(chalk.gray(`  • Voice app API: http://localhost:${config.server.httpPort}\n`));
  console.log(chalk.gray('Ready to receive calls on:'));
  for (const device of config.devices) {
    console.log(chalk.gray(`  • ${device.name}: extension ${device.extension}`));
  }
  console.log();
}
