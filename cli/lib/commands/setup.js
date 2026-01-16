import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  loadConfig,
  saveConfig,
  configExists
} from '../config.js';
import {
  validateElevenLabsKey,
  validateOpenAIKey,
  validateVoiceId,
  validateExtension,
  validateIP,
  validateHostname
} from '../validators.js';
import { getLocalIP, getProjectRoot } from '../utils.js';
import { isRaspberryPi } from '../platform.js';
import { detect3cxSbc } from '../port-check.js';
import { checkPiPrerequisites } from '../prerequisites.js';
import { checkClaudeApiServer } from '../network.js';
import { runPrereqChecks } from '../prereqs.js';

/**
 * Prompt for installation type
 * @param {string} currentType - Current installation type
 * @returns {Promise<string>} Selected installation type
 */
async function promptInstallationType(currentType = 'both') {
  const { type } = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: 'What are you installing?',
    default: currentType,
    choices: [
      {
        name: 'Voice Server (Pi/Linux) - Handles calls, needs Docker',
        value: 'voice-server'
      },
      {
        name: 'API Server - Claude Code wrapper, minimal setup',
        value: 'api-server'
      },
      {
        name: 'Both (all-in-one) - Full stack on one machine',
        value: 'both'
      }
    ]
  }]);

  console.log(chalk.cyan(`\nYou selected: ${type === 'voice-server' ? 'Voice Server' : type === 'api-server' ? 'API Server' : 'Both (all-in-one)'}\n`));

  return type;
}

/**
 * Setup command - Interactive wizard for configuration
 * @param {object} options - Command options
 * @returns {Promise<void>}
 */
export async function setupCommand(options = {}) {
  console.log(chalk.bold.cyan('\n🎯 Claude Phone Setup\n'));

  // Run minimal prerequisite check first (Node.js only)
  if (!options.skipPrereqs) {
    const minimalPrereq = await runPrereqChecks({ type: 'minimal' });

    if (!minimalPrereq.success) {
      console.log(chalk.red('\n❌ Prerequisites not met. Please fix the issues above and try again.\n'));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow('⚠️  Skipping prerequisite checks (--skip-prereqs flag)\n'));
  }

  // Check if config exists
  const hasConfig = configExists();
  let existingConfig = null;

  if (hasConfig) {
    console.log(chalk.yellow('⚠️  Configuration already exists.'));
    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Do you want to update your configuration?',
        default: false
      }
    ]);

    if (!shouldContinue) {
      console.log(chalk.gray('Setup cancelled.'));
      return;
    }

    existingConfig = await loadConfig();
  }

  // Prompt for installation type
  console.log(chalk.bold.cyan('\n📦 Installation Type\n'));
  const installationType = await promptInstallationType(
    existingConfig ? existingConfig.installationType : 'both'
  );

  // Detect platform (for Pi split-mode detection)
  const isPi = await isRaspberryPi();

  // If Pi detected and user selected "both", recommend voice-server
  if (isPi && installationType === 'both') {
    console.log(chalk.yellow('\n⚠️  Raspberry Pi detected!'));
    console.log(chalk.gray('For best performance, consider selecting "Voice Server" instead of "Both".'));
    console.log(chalk.gray('This allows the API server to run on a more powerful machine.\n'));

    const { changeToPi } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'changeToPi',
        message: 'Switch to Voice Server mode?',
        default: true
      }
    ]);

    if (changeToPi) {
      // Re-run with voice-server type
      return setupInstallationType('voice-server', existingConfig, isPi, options);
    }
  }

  // Run type-specific setup
  try {
    await setupInstallationType(installationType, existingConfig, isPi, options);
  } catch (error) {
    console.error(chalk.red('\n\n❌ Setup failed with error:'));
    console.error(chalk.red(error.message));
    console.error(chalk.gray('\nStack trace:'));
    console.error(chalk.gray(error.stack));
    process.exit(1);
  }
}

/**
 * Route to type-specific setup
 * @param {string} installationType - Installation type
 * @param {object} existingConfig - Existing config or null
 * @param {boolean} isPi - Is Raspberry Pi
 * @param {object} options - Command options
 * @returns {Promise<void>}
 */
async function setupInstallationType(installationType, existingConfig, isPi, options) {
  // Load existing config or create default
  const baseConfig = existingConfig || createDefaultConfig();

  // Run type-specific prereq checks (unless skipped)
  if (!options.skipPrereqs && installationType !== 'api-server') {
    console.log(chalk.bold.cyan(`\n🔍 Checking ${installationType === 'voice-server' ? 'Voice Server' : 'All'} prerequisites...\n`));
    const prereqResult = await runPrereqChecks({ type: installationType });

    if (!prereqResult.success) {
      console.log(chalk.red('\n❌ Prerequisites not met. Please fix the issues above and try again.\n'));
      process.exit(1);
    }
  }

  let config;

  switch (installationType) {
    case 'api-server':
      config = await setupApiServer(baseConfig);
      break;

    case 'voice-server':
      // Check if Pi - use Pi setup flow
      if (isPi) {
        config = await setupPi(baseConfig);
      } else {
        config = await setupVoiceServer(baseConfig);
      }
      break;

    case 'both':
    default:
      // Check if Pi - use Pi setup but with "both" type
      if (isPi) {
        config = await setupPi(baseConfig);
      } else {
        config = await setupBoth(baseConfig);
      }
      break;
  }

  // Set installation type in config
  config.installationType = installationType;

  // Save configuration
  const spinner = ora('Saving configuration...').start();
  try {
    await saveConfig(config);
    spinner.succeed('Configuration saved');
  } catch (error) {
    spinner.fail(`Failed to save configuration: ${error.message}`);
    throw error;
  }

  // Install dependencies for API server types
  if (installationType === 'api-server' || installationType === 'both') {
    const apiServerPath = config.paths?.claudeApiServer;
    if (apiServerPath && fs.existsSync(apiServerPath)) {
      const nodeModulesPath = path.join(apiServerPath, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        const installSpinner = ora('Installing API server dependencies...').start();
        try {
          execSync('npm install', {
            cwd: apiServerPath,
            stdio: 'pipe'
          });
          installSpinner.succeed('API server dependencies installed');
        } catch (error) {
          installSpinner.fail(`Failed to install dependencies: ${error.message}`);
          console.log(chalk.yellow('\nYou can install manually with:'));
          console.log(chalk.cyan(`  cd ${apiServerPath} && npm install\n`));
        }
      }
    }
  }

  // Type-specific success messages
  console.log(chalk.bold.green('\n✓ Setup complete!\n'));

  if (installationType === 'api-server') {
    console.log(chalk.gray('To start the API server:'));
    console.log(chalk.gray('  claude-phone start\n'));
    console.log(chalk.gray(`The API server will listen on port ${config.server.claudeApiPort}.`));
    console.log(chalk.gray('Voice servers can connect to: http://YOUR_IP:' + config.server.claudeApiPort + '\n'));
  } else if (installationType === 'voice-server') {
    if (isPi) {
      console.log(chalk.bold.cyan('📋 API server instructions:\n'));
      console.log(chalk.gray('  On your API server, run:'));
      console.log(chalk.white(`    claude-phone api-server --port ${config.server.claudeApiPort}\n`));
      console.log(chalk.gray('  This starts the Claude API wrapper that the Pi will connect to.\n'));
      console.log(chalk.bold.cyan('📋 Pi-side next steps:\n'));
      console.log(chalk.gray('  1. Run "claude-phone start" to launch voice-app'));
      console.log(chalk.gray('  2. Call extension ' + config.devices[0].extension + ' from your phone'));
      console.log(chalk.gray('  3. Start talking to Claude!\n'));
    } else {
      console.log(chalk.gray('Make sure your API server is running with:'));
      console.log(chalk.gray('  claude-phone api-server (on the API server machine)\n'));
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.gray('  1. Run "claude-phone start" to launch voice services'));
      console.log(chalk.gray('  2. Call extension ' + config.devices[0].extension + ' from your phone'));
      console.log(chalk.gray('  3. Start talking to Claude!\n'));
    }
  } else {
    // Both
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. Run "claude-phone start" to launch all services'));
    console.log(chalk.gray('  2. Call extension ' + config.devices[0].extension + ' from your phone'));
    console.log(chalk.gray('  3. Start talking to Claude!\n'));
  }
}

/**
 * API Server only setup (minimal configuration)
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupApiServer(config) {
  console.log(chalk.bold.cyan('\n🖥️  API Server Configuration\n'));

  const answers = await inquirer.prompt([{
    type: 'input',
    name: 'port',
    message: 'API server port:',
    default: config.server?.claudeApiPort || 3333,
    validate: (input) => {
      const port = parseInt(input, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return 'Port must be between 1024 and 65535';
      }
      return true;
    }
  }]);

  return {
    ...config,
    server: {
      ...config.server,
      claudeApiPort: parseInt(answers.port, 10)
    }
  };
}

/**
 * Voice Server only setup (non-Pi)
 * Asks for SIP, API keys, devices, and API server connection
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupVoiceServer(config) {
  // Ensure secrets exist
  if (!config.secrets) {
    config.secrets = {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    };
  }

  // Set deployment mode
  if (!config.deployment) {
    config.deployment = { mode: 'voice-server' };
  } else {
    config.deployment.mode = 'voice-server';
  }

  // Step 1: 3CX/SIP Configuration
  console.log(chalk.bold('\n☎️  SIP Configuration'));
  config = await setupSIP(config);

  // Step 2: API Server Connection
  console.log(chalk.bold('\n🖥️  API Server Connection'));
  const apiServerAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiServerIp',
      message: 'API Server IP address:',
      default: config.deployment.apiServerIp || '',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'API Server IP is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'apiServerPort',
      message: 'API Server port:',
      default: config.server?.claudeApiPort || 3333,
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    }
  ]);

  config.deployment.apiServerIp = apiServerAnswers.apiServerIp;
  config.server = config.server || {};
  config.server.claudeApiPort = parseInt(apiServerAnswers.apiServerPort, 10);

  // Step 3: API Keys (for TTS/STT)
  console.log(chalk.bold('\n📡 API Configuration'));
  config = await setupAPIKeys(config);

  // Step 4: Device Configuration
  console.log(chalk.bold('\n🤖 Device Configuration'));
  config = await setupDevice(config);

  // Step 5: Server Configuration (IP only, no API port)
  console.log(chalk.bold('\n⚙️  Server Configuration'));
  const localIp = getLocalIP();
  const serverAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'externalIp',
      message: 'Server LAN IP (for RTP audio):',
      default: config.server.externalIp === 'auto' ? localIp : config.server.externalIp,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'IP address is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'httpPort',
      message: 'Voice app HTTP port:',
      default: config.server.httpPort || 3000,
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    }
  ]);

  config.server.externalIp = serverAnswers.externalIp;
  config.server.httpPort = parseInt(serverAnswers.httpPort, 10);

  return config;
}

/**
 * Both (all-in-one) setup flow
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupBoth(config) {
  // Ensure secrets exist for existing configs (backwards compatibility)
  if (!config.secrets) {
    config.secrets = {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    };
  }

  // Ensure deployment mode exists
  if (!config.deployment) {
    config.deployment = { mode: 'both' };
  } else {
    config.deployment.mode = 'both';
  }

  // Step 1: API Keys
  console.log(chalk.bold('\n📡 API Configuration'));
  config = await setupAPIKeys(config);

  // Step 2: 3CX/SIP Configuration
  console.log(chalk.bold('\n☎️  SIP Configuration'));
  config = await setupSIP(config);

  // Step 3: Device Configuration
  console.log(chalk.bold('\n🤖 Device Configuration'));
  config = await setupDevice(config);

  // Step 4: Server Configuration
  console.log(chalk.bold('\n⚙️  Server Configuration'));
  config = await setupServer(config);

  return config;
}

/**
 * Raspberry Pi split-mode setup flow
 * @param {object} config - Current config
 * @returns {Promise<void>}
 */
async function setupPi(config) {
  console.log(chalk.bold.yellow('\n🥧 Raspberry Pi Split-Mode Setup\n'));
  console.log(chalk.gray('In this mode, the Pi runs voice-app (Docker) and your API server runs claude-api-server.\n'));

  // AC23: Handle existing standard config migration
  if (config.deployment && config.deployment.mode === 'standard') {
    console.log(chalk.yellow('\n⚠️  Detected existing standard configuration'));
    console.log(chalk.gray('Your config will be migrated to Pi split-mode while preserving:'));
    console.log(chalk.gray('  • API keys (ElevenLabs, OpenAI)'));
    console.log(chalk.gray('  • Device configurations'));
    console.log(chalk.gray('  • SIP settings\n'));

    const { confirmMigration } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmMigration',
        message: 'Continue with migration to Pi split-mode?',
        default: true
      }
    ]);

    if (!confirmMigration) {
      console.log(chalk.gray('\nSetup cancelled.\n'));
      process.exit(0);
    }

    console.log(chalk.green('✓ Preserving existing configuration\n'));
  }

  // Check prerequisites
  console.log(chalk.bold('\n✅ Prerequisites Check'));
  const prereqs = await checkPiPrerequisites();
  let allPrereqsPassed = true;

  for (const prereq of prereqs) {
    if (prereq.installed) {
      console.log(chalk.green(`  ✓ ${prereq.name}`));
    } else {
      console.log(chalk.red(`  ✗ ${prereq.name}: ${prereq.error}`));
      if (prereq.installUrl) {
        console.log(chalk.gray(`    → ${prereq.installUrl}`));
      }
      allPrereqsPassed = false;
    }
  }

  if (!allPrereqsPassed) {
    console.log(chalk.red('\n✗ Prerequisites missing. Install them before continuing.\n'));
    process.exit(1);
  }

  // Ensure secrets exist
  if (!config.secrets) {
    config.secrets = {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    };
  }

  // Initialize deployment config
  if (!config.deployment) {
    config.deployment = { mode: 'pi-split', pi: {} };
  } else {
    config.deployment.mode = 'pi-split';
    if (!config.deployment.pi) {
      config.deployment.pi = {};
    }
  }

  // Detect 3CX SBC (AC24: Handle port detection failure)
  console.log(chalk.bold('\n🔍 Network Detection'));
  const sbc3cxSpinner = ora('Checking for 3CX SBC (process + UDP/TCP port 5060)...').start();

  let has3cxSbc;
  let portCheckError = false;

  try {
    has3cxSbc = await detect3cxSbc();
    if (has3cxSbc) {
      sbc3cxSpinner.succeed('3CX SBC detected - will use port 5070 for drachtio');
    } else {
      sbc3cxSpinner.succeed('No 3CX SBC detected - will use standard port 5060');
    }
  } catch (err) {
    portCheckError = true;
    sbc3cxSpinner.warn('Port detection failed: ' + err.message);
  }

  // AC24: Manual override when port detection fails
  if (portCheckError) {
    console.log(chalk.yellow('\n⚠️  Could not automatically detect 3CX SBC'));
    const { manualSbc } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'manualSbc',
        message: 'Is 3CX SBC running on port 5060?',
        default: false
      }
    ]);
    has3cxSbc = manualSbc;

    if (has3cxSbc) {
      console.log(chalk.green('✓ Will use port 5070 for drachtio (avoid conflict with SBC)\n'));
    } else {
      console.log(chalk.green('✓ Will use port 5060 for drachtio\n'));
    }
  }

  config.deployment.pi.has3cxSbc = has3cxSbc;
  config.deployment.pi.drachtioPort = has3cxSbc ? 5070 : 5060;

  // Ask for API server IP and port first, then check connectivity
  const apiServerAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'macIp',
      message: 'API server IP address (where claude-api-server runs):',
      default: config.deployment.pi.macIp || '',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'API server IP is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'claudeApiPort',
      message: 'Claude API server port:',
      default: String(config.server?.claudeApiPort || 3333),
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    }
  ]);

  const { macIp, claudeApiPort } = apiServerAnswers;

  config.deployment.pi.macIp = macIp;
  config.server = config.server || {};
  config.server.claudeApiPort = parseInt(claudeApiPort, 10);

  // Now check connectivity on the specified port
  const reachSpinner = ora(`Checking API server at ${macIp}:${claudeApiPort}...`).start();
  const apiUrl = `http://${macIp}:${claudeApiPort}`;
  const apiHealth = await checkClaudeApiServer(apiUrl);

  if (apiHealth.healthy) {
    reachSpinner.succeed(`API server is healthy at ${apiUrl}`);
  } else if (apiHealth.reachable) {
    reachSpinner.warn(`API server reachable but not responding at ${apiUrl}`);
    console.log(chalk.yellow('  ⚠️  Make sure claude-api-server is running\n'));
  } else {
    reachSpinner.warn(`Cannot reach API server at ${apiUrl}`);
    console.log(chalk.yellow('  ⚠️  Make sure API server is running and port is open (firewall)\n'));
  }

  // Step 1: API Keys (only for voice services - TTS/STT)
  console.log(chalk.bold('\n📡 API Configuration'));
  config = await setupAPIKeys(config);

  // Step 2: 3CX SBC Configuration (Pi mode uses SBC)
  console.log(chalk.bold('\n📡 3CX SBC Connection'));
  config = await setupSBC(config);

  // Step 3: Device Configuration
  console.log(chalk.bold('\n🤖 Device Configuration'));
  config = await setupDevice(config);

  // Step 4: Server Configuration (Pi-specific)
  console.log(chalk.bold('\n⚙️  Server Configuration'));
  config = await setupPiServer(config);

  // Save configuration
  const spinner = ora('Saving configuration...').start();
  try {
    await saveConfig(config);
    spinner.succeed('Configuration saved');
  } catch (error) {
    spinner.fail(`Failed to save configuration: ${error.message}`);
    throw error;
  }

  // Summary
  console.log(chalk.bold.green('\n✓ Pi Setup complete!\n'));
  console.log(chalk.bold.cyan('📋 API server instructions:\n'));
  console.log(chalk.gray('  On your API server, run:'));
  console.log(chalk.white(`    claude-phone api-server --port ${config.server.claudeApiPort}\n`));
  console.log(chalk.gray('  This starts the Claude API wrapper that the Pi will connect to.\n'));
  console.log(chalk.bold.cyan('📋 Pi-side next steps:\n'));
  console.log(chalk.gray('  1. Run "claude-phone start" to launch voice-app'));
  console.log(chalk.gray('  2. Call extension ' + config.devices[0].extension + ' from your phone'));
  console.log(chalk.gray('  3. Start talking to Claude!\n'));

  return config;
}

/**
 * Generate a random secret for Docker services
 * @returns {string} Random 32-character hex string
 */
function generateSecret() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create default configuration
 * @returns {object} Default config
 */
function createDefaultConfig() {
  return {
    version: '1.0.0',
    api: {
      elevenlabs: { apiKey: '', validated: false },
      openai: { apiKey: '', validated: false }
    },
    sip: {
      domain: '',
      registrar: '',
      transport: 'udp'
    },
    server: {
      claudeApiPort: 3333,
      httpPort: 3000,
      externalIp: 'auto'
    },
    secrets: {
      drachtio: generateSecret(),
      freeswitch: generateSecret()
    },
    devices: [],
    paths: {
      voiceApp: path.join(getProjectRoot(), 'voice-app'),
      claudeApiServer: path.join(getProjectRoot(), 'claude-api-server')
    }
  };
}

/**
 * Setup API keys with validation
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupAPIKeys(config) {
  // ElevenLabs API Key
  const elevenLabsAnswers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'ElevenLabs API key:',
      default: config.api.elevenlabs.apiKey,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'API key is required';
        }
        return true;
      }
    }
  ]);

  const elevenLabsKey = elevenLabsAnswers.apiKey;
  const spinner = ora('Validating ElevenLabs API key...').start();

  const elevenLabsResult = await validateElevenLabsKey(elevenLabsKey);
  if (!elevenLabsResult.valid) {
    spinner.fail(`Invalid ElevenLabs API key: ${elevenLabsResult.error}`);
    console.log(chalk.yellow('\n⚠️  You can continue setup, but the key may not work.'));
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        default: false
      }
    ]);

    if (!continueAnyway) {
      throw new Error('Setup cancelled due to invalid API key');
    }

    config.api.elevenlabs = { apiKey: elevenLabsKey, validated: false };
  } else {
    spinner.succeed('ElevenLabs API key validated');
    config.api.elevenlabs = { apiKey: elevenLabsKey, validated: true };
  }

  // OpenAI API Key
  const openAIAnswers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'OpenAI API key (for Whisper STT):',
      default: config.api.openai.apiKey,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'API key is required';
        }
        return true;
      }
    }
  ]);

  const openAIKey = openAIAnswers.apiKey;
  const openAISpinner = ora('Validating OpenAI API key...').start();

  const openAIResult = await validateOpenAIKey(openAIKey);
  if (!openAIResult.valid) {
    openAISpinner.fail(`Invalid OpenAI API key: ${openAIResult.error}`);
    console.log(chalk.yellow('\n⚠️  You can continue setup, but the key may not work.'));
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        default: false
      }
    ]);

    if (!continueAnyway) {
      throw new Error('Setup cancelled due to invalid API key');
    }

    config.api.openai = { apiKey: openAIKey, validated: false };
  } else {
    openAISpinner.succeed('OpenAI API key validated');
    config.api.openai = { apiKey: openAIKey, validated: true };
  }

  return config;
}

/**
 * Setup SIP configuration (standard mode)
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupSIP(config) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: '3CX domain (e.g., your-3cx.3cx.us):',
      default: config.sip.domain,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'SIP domain is required';
        }
        if (!validateHostname(input)) {
          return 'Invalid hostname format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'registrar',
      message: '3CX registrar IP (e.g., 192.168.1.100):',
      default: config.sip.registrar,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'SIP registrar IP is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    }
  ]);

  config.sip.domain = answers.domain;
  config.sip.registrar = answers.registrar;

  return config;
}

/**
 * Setup SBC configuration (Pi mode only)
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupSBC(config) {
  // Display pre-requisite information
  console.log(chalk.cyan('\nℹ️  Pre-requisite: You must create an SBC in 3CX Admin first'));
  console.log(chalk.gray('   (Admin → Settings → SBC → Add SBC → Raspberry Pi)\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'fqdn',
      message: '3CX FQDN (e.g., mycompany.3cx.us):',
      default: config.sip.domain,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return '3CX FQDN is required';
        }
        if (!validateHostname(input)) {
          return 'Invalid hostname format';
        }
        return true;
      }
    }
  ]);

  // Set domain and registrar to same value (SBC handles the connection)
  config.sip.domain = answers.fqdn;
  config.sip.registrar = answers.fqdn;

  return config;
}

/**
 * Setup device configuration
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupDevice(config) {
  // Get first device or create new
  const existingDevice = config.devices.length > 0 ? config.devices[0] : null;

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Device name (e.g., Morpheus):',
      default: existingDevice?.name || 'Morpheus',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Device name is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'extension',
      message: 'SIP extension number (e.g., 9000):',
      default: existingDevice?.extension || '9000',
      validate: (input) => {
        if (!validateExtension(input)) {
          return 'Extension must be 4-5 digits';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'authId',
      message: 'SIP auth ID:',
      default: existingDevice?.authId || '',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Auth ID is required';
        }
        return true;
      }
    },
    {
      type: 'password',
      name: 'password',
      message: 'SIP password:',
      default: existingDevice?.password || '',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Password is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'voiceId',
      message: 'ElevenLabs voice ID:',
      default: existingDevice?.voiceId || '',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Voice ID is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'prompt',
      message: 'System prompt:',
      default: existingDevice?.prompt || 'You are a helpful AI assistant. Keep voice responses under 40 words.',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'System prompt is required';
        }
        return true;
      }
    }
  ]);

  // Validate voice ID with ElevenLabs API
  const voiceSpinner = ora('Validating ElevenLabs voice ID...').start();
  const voiceValidation = await validateVoiceId(config.api.elevenlabs.apiKey, answers.voiceId);

  if (!voiceValidation.valid) {
    voiceSpinner.fail(`Voice ID validation failed: ${voiceValidation.error}`);
    console.log(chalk.yellow('\n⚠️  You can continue setup, but the voice ID may not work.'));
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        default: false
      }
    ]);

    if (!continueAnyway) {
      // Let user re-enter voice ID
      console.log(chalk.gray('\nReturning to device setup...'));
      return setupDevice(config);
    }
  } else {
    voiceSpinner.succeed(`Voice ID validated: ${voiceValidation.name}`);
  }

  const device = {
    name: answers.name,
    extension: answers.extension,
    authId: answers.authId,
    password: answers.password,
    voiceId: answers.voiceId,
    prompt: answers.prompt
  };

  // Replace first device or add new
  if (config.devices.length > 0) {
    config.devices[0] = device;
  } else {
    config.devices.push(device);
  }

  return config;
}

/**
 * Setup server configuration (standard mode)
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupServer(config) {
  const localIp = getLocalIP();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'externalIp',
      message: 'Server LAN IP (for RTP audio):',
      default: config.server.externalIp === 'auto' ? localIp : config.server.externalIp,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'IP address is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'claudeApiPort',
      message: 'Claude API server port:',
      default: config.server.claudeApiPort,
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'httpPort',
      message: 'Voice app HTTP port:',
      default: config.server.httpPort,
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    }
  ]);

  config.server.externalIp = answers.externalIp;
  config.server.claudeApiPort = parseInt(answers.claudeApiPort, 10);
  config.server.httpPort = parseInt(answers.httpPort, 10);

  return config;
}

/**
 * Setup Pi-specific server configuration
 * @param {object} config - Current config
 * @returns {Promise<object>} Updated config
 */
async function setupPiServer(config) {
  const localIp = getLocalIP();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'externalIp',
      message: 'Pi LAN IP (for RTP audio):',
      default: config.server.externalIp === 'auto' ? localIp : config.server.externalIp,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'IP address is required';
        }
        if (!validateIP(input)) {
          return 'Invalid IP address format';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'httpPort',
      message: 'Voice app HTTP port:',
      default: config.server.httpPort || 3000,
      validate: (input) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1024 || port > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      }
    }
  ]);

  config.server.externalIp = answers.externalIp;
  config.server.httpPort = parseInt(answers.httpPort, 10);

  return config;
}
