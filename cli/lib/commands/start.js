import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { loadConfig, configExists, getInstallationType } from '../config.js';
import { checkDocker, writeDockerConfig, startContainers } from '../docker.js';
import { startServer, isServerRunning } from '../process-manager.js';
import { isAssistantCliInstalled, sleep } from '../utils.js';
import { checkClaudeApiServer } from '../network.js';
import { runPrereqChecks } from '../prereqs.js';

function normalizeBackend(backend) {
  const b = String(backend || '').trim().toLowerCase();
  return b === 'chatgpt' ? 'openai' : (b || 'claude');
}

function getOpenAIApiKey(config) {
  return process.env.OPENAI_API_KEY || config.api?.openai?.apiKey || '';
}

function getApiServerEnv(config, backend) {
  if (backend === 'openai' && !process.env.OPENAI_API_KEY && config.api?.openai?.apiKey) {
    return { AI_BACKEND: backend, OPENAI_API_KEY: config.api.openai.apiKey };
  }
  return { AI_BACKEND: backend };
}

async function warnBackendDependency(config, backend) {
  if (backend === 'openai') {
    if (!getOpenAIApiKey(config)) {
      console.log(chalk.yellow('⚠️  OPENAI_API_KEY not found for OpenAI backend'));
      console.log(chalk.gray('  Set OPENAI_API_KEY in your shell, or add openai.apiKey in config\n'));
    }
    return;
  }

  if (!(await isAssistantCliInstalled(backend))) {
    console.log(chalk.yellow(`⚠️  ${backend === 'codex' ? 'Codex' : 'Claude'} CLI not found`));
    if (backend === 'codex') {
      console.log(chalk.gray('  Install: npm install -g @openai/codex'));
      console.log(chalk.gray('  Or: brew install --cask codex\n'));
    } else {
      console.log(chalk.gray('  Install from: https://claude.com/download\n'));
    }
  }
}

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

  // Load config and get installation type
  const config = await loadConfig();
  const installationType = getInstallationType(config);
  const isPiMode = config.deployment?.mode === 'pi-split';

  console.log(chalk.gray(`Installation type: ${installationType}\n`));

  // Run prerequisite checks for this installation type
  const prereqResult = await runPrereqChecks({ type: installationType });
  if (!prereqResult.success) {
    console.log(chalk.red('\n❌ Prerequisites not met. Please run "claude-phone setup" to fix.\n'));
    process.exit(1);
  }

  if (isPiMode) {
    console.log(chalk.cyan('🥧 Pi Split-Mode detected\n'));
  }

  // Route to type-specific start function
  switch (installationType) {
    case 'api-server':
      await startApiServer(config);
      break;
    case 'voice-server':
      await startVoiceServer(config, isPiMode);
      break;
    case 'both':
    default:
      await startBoth(config, isPiMode);
      break;
  }
}

/**
 * Start API server only
 * @param {object} config - Configuration
 * @returns {Promise<void>}
 */
async function startApiServer(config) {
  const backend = normalizeBackend(config.server?.assistantCli);

  await warnBackendDependency(config, backend);

  // Verify path exists
  if (!fs.existsSync(config.paths.claudeApiServer)) {
    console.log(chalk.red(`✗ Claude API server not found at: ${config.paths.claudeApiServer}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  // Check if dependencies are installed
  const nodeModulesPath = path.join(config.paths.claudeApiServer, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log(chalk.red('✗ Dependencies not installed in claude-api-server'));
    console.log(chalk.yellow('\nRun the following to install dependencies:'));
    console.log(chalk.cyan(`  cd ${config.paths.claudeApiServer} && npm install\n`));
    process.exit(1);
  }

  // Start claude-api-server
  const spinner = ora('Starting API server...').start();
  try {
    if (await isServerRunning()) {
      spinner.warn('API server already running');
    } else {
      await startServer(
        config.paths.claudeApiServer,
        config.server.claudeApiPort,
        null,
        getApiServerEnv(config, backend)
      );
      spinner.succeed(`API server started on port ${config.server.claudeApiPort} (backend: ${backend})`);
    }
  } catch (error) {
    spinner.fail(`Failed to start server: ${error.message}`);
    throw error;
  }

  // Success
  console.log(chalk.bold.green('\n✓ API server running!\n'));
  console.log(chalk.gray('Service:'));
  console.log(chalk.gray(`  • API server (${backend}): http://localhost:${config.server.claudeApiPort}\n`));
  console.log(chalk.gray('Voice servers can connect to this API server.\n'));
}

/**
 * Start voice server only
 * @param {object} config - Configuration
 * @param {boolean} isPiMode - Is Pi split-mode
 * @returns {Promise<void>}
 */
async function startVoiceServer(config, isPiMode) {
  // Verify voice-app path exists
  if (!fs.existsSync(config.paths.voiceApp)) {
    console.log(chalk.red(`✗ Voice app not found at: ${config.paths.voiceApp}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  // In Pi mode or voice-server mode, check API server reachability
  const apiServerIp = isPiMode ? config.deployment.pi.macIp : config.deployment.apiServerIp;
  if (apiServerIp) {
    const apiServerUrl = `http://${apiServerIp}:${config.server.claudeApiPort}`;
    const apiSpinner = ora(`Checking API server at ${apiServerUrl}...`).start();
    const apiHealth = await checkClaudeApiServer(apiServerUrl);
    if (apiHealth.healthy) {
      apiSpinner.succeed(`API server is healthy at ${apiServerUrl}`);
    } else {
      apiSpinner.warn(`API server not responding at ${apiServerUrl}`);
      console.log(chalk.yellow('  ⚠️  Make sure "claude-phone api-server" is running on your API server\n'));
    }
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

    if (error.message.includes('port') || error.message.includes('address already in use')) {
      console.log(chalk.yellow('\n⚠️  Port conflict detected\n'));
      console.log(chalk.gray('Possible causes:'));
      console.log(chalk.gray('  • 3CX SBC is running on the configured port'));
      console.log(chalk.gray('  • Another service is using the port'));
      console.log(chalk.gray('\nSuggested fixes:'));
      console.log(chalk.gray('  1. If 3CX SBC is on port 5060, run "claude-phone setup" again'));
      console.log(chalk.gray('  2. Check running containers: docker ps'));
      console.log(chalk.gray('  3. Stop conflicting services: docker compose down\n'));
    }

    throw error;
  }

  // Wait a bit for containers to initialize
  spinner.start('Waiting for containers to initialize...');
  await sleep(3000);
  spinner.succeed('Containers initialized');

  // Success
  console.log(chalk.bold.green('\n✓ Voice server running!\n'));
  console.log(chalk.gray('Services:'));
  console.log(chalk.gray(`  • Docker containers: drachtio, freeswitch, voice-app`));
  if (apiServerIp) {
    console.log(chalk.gray(`  • API server: http://${apiServerIp}:${config.server.claudeApiPort}`));
  }
  console.log(chalk.gray(`  • Voice app API: http://localhost:${config.server.httpPort}\n`));
  console.log(chalk.gray('Ready to receive calls on:'));
  for (const device of config.devices) {
    console.log(chalk.gray(`  • ${device.name}: extension ${device.extension}`));
  }
  console.log();
}

/**
 * Start both API server and voice server
 * @param {object} config - Configuration
 * @param {boolean} isPiMode - Is Pi split-mode
 * @returns {Promise<void>}
 */
async function startBoth(config, isPiMode) {
  // Verify voice-app path exists
  if (!fs.existsSync(config.paths.voiceApp)) {
    console.log(chalk.red(`✗ Voice app not found at: ${config.paths.voiceApp}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  // Only check claude-api-server path in standard mode (not Pi mode)
  if (!isPiMode && !fs.existsSync(config.paths.claudeApiServer)) {
    console.log(chalk.red(`✗ Claude API server not found at: ${config.paths.claudeApiServer}`));
    console.log(chalk.gray('  Update paths in configuration\n'));
    process.exit(1);
  }

  // Check if dependencies are installed (not in Pi mode)
  if (!isPiMode) {
    const nodeModulesPath = path.join(config.paths.claudeApiServer, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log(chalk.red('✗ Dependencies not installed in claude-api-server'));
      console.log(chalk.yellow('\nRun the following to install dependencies:'));
      console.log(chalk.cyan(`  cd ${config.paths.claudeApiServer} && npm install\n`));
      process.exit(1);
    }
  }

  // Check assistant CLI only in standard mode (Pi mode connects to API server instead)
  if (!isPiMode) {
    const backend = normalizeBackend(config.server?.assistantCli);
    await warnBackendDependency(config, backend);
  }

  // In Pi mode, verify API server is reachable
  if (isPiMode) {
    const apiServerUrl = `http://${config.deployment.pi.macIp}:${config.server.claudeApiPort}`;
    const apiSpinner = ora(`Checking API server at ${apiServerUrl}...`).start();
    const apiHealth = await checkClaudeApiServer(apiServerUrl);
    if (apiHealth.healthy) {
      apiSpinner.succeed(`API server is healthy at ${apiServerUrl}`);
    } else {
      apiSpinner.warn(`API server not responding at ${apiServerUrl}`);
      console.log(chalk.yellow('  ⚠️  Make sure "claude-phone api-server" is running on your API server\n'));
    }
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

    // AC25: Detect drachtio port conflict
    if (error.message.includes('port') || error.message.includes('address already in use')) {
      console.log(chalk.yellow('\n⚠️  Port conflict detected\n'));
      console.log(chalk.gray('Possible causes:'));
      console.log(chalk.gray('  • 3CX SBC is running on the configured port'));
      console.log(chalk.gray('  • Another service is using the port'));
      console.log(chalk.gray('\nSuggested fixes:'));
      console.log(chalk.gray('  1. If 3CX SBC is on port 5060, run "claude-phone setup" again'));
      console.log(chalk.gray('  2. Check running containers: docker ps'));
      console.log(chalk.gray('  3. Stop conflicting services: docker compose down\n'));
    }

    throw error;
  }

  // Wait a bit for containers to initialize
  spinner.start('Waiting for containers to initialize...');
  await sleep(3000);
  spinner.succeed('Containers initialized');

  // Start claude-api-server (only in standard mode - Pi mode uses remote API server)
  if (!isPiMode) {
    const backend = normalizeBackend(config.server?.assistantCli);
    spinner.start(`Starting API server (${backend})...`);
    try {
      if (await isServerRunning()) {
        spinner.warn('API server already running');
      } else {
        await startServer(
          config.paths.claudeApiServer,
          config.server.claudeApiPort,
          null,
          getApiServerEnv(config, backend)
        );
        spinner.succeed(`API server started on port ${config.server.claudeApiPort} (backend: ${backend})`);
      }
    } catch (error) {
      spinner.fail(`Failed to start server: ${error.message}`);
      throw error;
    }
  }

  // Success
  console.log(chalk.bold.green('\n✓ All services running!\n'));
  console.log(chalk.gray('Services:'));
  console.log(chalk.gray(`  • Docker containers: drachtio, freeswitch, voice-app`));
  if (isPiMode) {
    console.log(chalk.gray(`  • API server: http://${config.deployment.pi.macIp}:${config.server.claudeApiPort}`));
  } else {
    const backend = normalizeBackend(config.server?.assistantCli);
    console.log(chalk.gray(`  • API server (${backend}): http://localhost:${config.server.claudeApiPort}`));
  }
  console.log(chalk.gray(`  • Voice app API: http://localhost:${config.server.httpPort}\n`));
  console.log(chalk.gray('Ready to receive calls on:'));
  for (const device of config.devices) {
    console.log(chalk.gray(`  • ${device.name}: extension ${device.extension}`));
  }
  console.log();
}
