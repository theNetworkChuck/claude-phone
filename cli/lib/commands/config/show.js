import chalk from 'chalk';
import { loadConfig, configExists } from '../../config.js';

/**
 * Redact sensitive values for display
 * @param {string} value - Value to redact
 * @returns {string} Redacted value
 */
function redactValue(value) {
  if (!value || typeof value !== 'string') {
    return '[not set]';
  }

  // For API keys (typically long strings)
  if (value.length > 20) {
    const prefix = value.slice(0, 4);
    const suffix = value.slice(-4);
    return `${prefix}...${suffix}`;
  }

  // For passwords and shorter secrets
  return '••••••••';
}

/**
 * Config show command - Display configuration with redacted secrets
 * @returns {Promise<void>}
 */
export async function configShowCommand() {
  console.log(chalk.bold.cyan('\n⚙️  Claude Phone Configuration\n'));

  // Check if configured
  if (!configExists()) {
    console.log(chalk.red('✗ Configuration not found'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    return;
  }

  const config = await loadConfig();
  const normalizedBackend = config.server?.assistantCli === 'chatgpt'
    ? 'openai'
    : (config.server?.assistantCli || 'claude');

  // Support both current config.api.* and legacy config.apiKeys.* structures.
  const openAIKey = config.api?.openai?.apiKey || config.apiKeys?.openai || '';
  const elevenLabsKey = config.api?.elevenlabs?.apiKey || config.apiKeys?.elevenlabs || '';

  // API Keys
  console.log(chalk.bold('API Keys:'));
  console.log(chalk.gray(`  OpenAI API Key: ${redactValue(openAIKey)}`));
  console.log(chalk.gray(`  ElevenLabs API Key: ${redactValue(elevenLabsKey)}`));

  // 3CX Configuration
  console.log(chalk.bold('\n3CX Configuration:'));
  console.log(chalk.gray(`  SIP Domain: ${config.sip.domain}`));
  console.log(chalk.gray(`  SIP Registrar: ${config.sip.registrar}`));

  // Server Configuration
  console.log(chalk.bold('\nServer:'));
  console.log(chalk.gray(`  Backend: ${normalizedBackend}`));
  console.log(chalk.gray(`  External IP: ${config.server?.externalIp ?? '[not set]'}`));
  console.log(chalk.gray(`  Voice App Port: ${config.server?.voiceAppPort ?? '[not set]'}`));
  console.log(chalk.gray(`  API Server Port: ${config.server?.claudeApiPort ?? '[not set]'}`));
  console.log(chalk.gray(`  API Server URL: ${config.server?.claudeApiUrl ?? '[not set]'}`));

  // Devices
  console.log(chalk.bold('\nDevices:'));
  if (!config.devices || config.devices.length === 0) {
    console.log(chalk.gray('  (none configured)'));
  } else {
    for (const device of config.devices) {
      console.log(chalk.gray(`  • ${device.name} (extension ${device.extension})`));
      console.log(chalk.gray(`    Auth ID: ${device.authId}`));
      console.log(chalk.gray(`    Password: ${redactValue(device.password)}`));
      console.log(chalk.gray(`    Voice ID: ${device.voiceId}`));
      if (device.prompt) {
        const shortPrompt = device.prompt.length > 50
          ? device.prompt.slice(0, 50) + '...'
          : device.prompt;
        console.log(chalk.gray(`    Prompt: ${shortPrompt}`));
      }
    }
  }

  console.log(chalk.gray(`\n💡 To view the raw config file, run: claude-phone config path\n`));
}
