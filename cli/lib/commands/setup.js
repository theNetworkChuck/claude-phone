import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import {
  loadConfig,
  saveConfig,
  configExists
} from '../config.js';
import {
  validateElevenLabsKey,
  validateOpenAIKey,
  validateExtension,
  validateIP,
  validateHostname
} from '../validators.js';
import { getLocalIP } from '../utils.js';

/**
 * Setup command - Interactive wizard for configuration
 * @returns {Promise<void>}
 */
export async function setupCommand() {
  console.log(chalk.bold.cyan('\n🎯 Claude Phone Setup\n'));

  // Check if config exists
  const hasConfig = configExists();
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
  }

  // Load existing config or create new
  let config = hasConfig ? await loadConfig() : createDefaultConfig();

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
  console.log(chalk.bold.green('\n✓ Setup complete!\n'));
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray('  1. Run "claude-phone start" to launch services'));
  console.log(chalk.gray('  2. Call extension ' + config.devices[0].extension + ' from your phone'));
  console.log(chalk.gray('  3. Start talking to Claude!\n'));
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
    devices: [],
    paths: {
      voiceApp: path.resolve(process.cwd(), 'voice-app'),
      claudeApiServer: path.resolve(process.cwd(), 'claude-api-server')
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
 * Setup SIP configuration
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
 * Setup server configuration
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
