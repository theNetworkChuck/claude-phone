import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig, configExists } from '../../config.js';
import { validateExtension, validateVoiceId } from '../../validators.js';
import { writeDockerConfig } from '../../docker.js';

/**
 * Device add command - Add a new SIP device
 * @returns {Promise<void>}
 */
export async function deviceAddCommand() {
  console.log(chalk.bold.cyan('\n➕ Add New Device\n'));

  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();

  // Gather device information
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Device name:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Device name cannot be empty';
        }
        // Check for duplicate names
        const duplicate = config.devices.find(d => d.name.toLowerCase() === input.trim().toLowerCase());
        if (duplicate) {
          return `Device name "${input}" already exists`;
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'extension',
      message: 'SIP extension (4-6 digits):',
      validate: (input) => {
        if (!validateExtension(input)) {
          return 'Extension must be 4-6 digits';
        }
        // Check for duplicate extensions
        const duplicate = config.devices.find(d => d.extension === input);
        if (duplicate) {
          return `Extension ${input} is already used by device "${duplicate.name}"`;
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'authId',
      message: 'SIP auth ID (press Enter to use extension):',
      default: (answers) => answers.extension
    },
    {
      type: 'password',
      name: 'password',
      message: 'SIP password:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Password cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'voiceId',
      message: 'ElevenLabs voice ID:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Voice ID cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'prompt',
      message: 'System prompt:',
      default: (answers) => `You are ${answers.name}, a helpful AI assistant accessible via phone.`
    }
  ]);

  // Validate voice ID with ElevenLabs API
  const spinner = ora('Validating voice ID with ElevenLabs...').start();
  const voiceResult = await validateVoiceId(config.api.elevenlabs.apiKey, answers.voiceId);

  if (!voiceResult.valid) {
    spinner.fail(chalk.red(`Voice ID validation failed: ${voiceResult.error}`));
    console.log(chalk.gray('\nPlease check your voice ID and try again.\n'));
    process.exit(1);
  }

  spinner.succeed(chalk.green(`Voice validated: ${voiceResult.name}`));

  // Add device to config
  const newDevice = {
    name: answers.name.trim(),
    extension: answers.extension,
    authId: answers.authId || answers.extension,
    password: answers.password,
    voiceId: answers.voiceId,
    prompt: answers.prompt || `You are ${answers.name}, a helpful AI assistant accessible via phone.`
  };

  config.devices.push(newDevice);

  // Save config
  const saveSpinner = ora('Saving configuration...').start();
  await saveConfig(config);

  // Regenerate Docker config with new device
  await writeDockerConfig(config);

  saveSpinner.succeed(chalk.green('Configuration saved'));

  console.log(chalk.bold.green('\n✓ Device added successfully!'));
  console.log(chalk.gray('\nDevice details:'));
  console.log(chalk.gray(`  Name: ${newDevice.name}`));
  console.log(chalk.gray(`  Extension: ${newDevice.extension}`));
  console.log(chalk.gray(`  Voice: ${voiceResult.name} (${newDevice.voiceId})`));
  console.log(chalk.yellow('\n⚠ Restart services to apply changes:'));
  console.log(chalk.gray('  claude-phone stop'));
  console.log(chalk.gray('  claude-phone start\n'));
}
