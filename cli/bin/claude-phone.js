#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from '../lib/commands/setup.js';
import { startCommand } from '../lib/commands/start.js';
import { stopCommand } from '../lib/commands/stop.js';
import { statusCommand } from '../lib/commands/status.js';
import { doctorCommand } from '../lib/commands/doctor.js';
import { deviceAddCommand } from '../lib/commands/device/add.js';
import { deviceListCommand } from '../lib/commands/device/list.js';
import { deviceRemoveCommand } from '../lib/commands/device/remove.js';
import { logsCommand } from '../lib/commands/logs.js';
import { configShowCommand } from '../lib/commands/config/show.js';
import { configPathCommand } from '../lib/commands/config/path.js';
import { configResetCommand } from '../lib/commands/config/reset.js';
import { updateCommand } from '../lib/commands/update.js';

const program = new Command();

program
  .name('claude-phone')
  .description('Voice interface for Claude Code via SIP - Call your AI, and your AI can call you')
  .version('1.0.0');

program
  .command('setup')
  .description('Interactive setup wizard for API keys, 3CX config, and devices')
  .action(async () => {
    try {
      await setupCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Setup failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start all services (Docker containers + claude-api-server)')
  .action(async () => {
    try {
      await startCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Start failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop all services')
  .action(async () => {
    try {
      await stopCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Stop failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show status of all services')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Status check failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Run health checks on all dependencies and services')
  .action(async () => {
    try {
      await doctorCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Health check failed: ${error.message}\n`));
      process.exit(1);
    }
  });

// Device management subcommands
const device = program
  .command('device')
  .description('Manage SIP devices');

device
  .command('add')
  .description('Add a new device')
  .action(async () => {
    try {
      await deviceAddCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Device add failed: ${error.message}\n`));
      process.exit(1);
    }
  });

device
  .command('list')
  .description('List all configured devices')
  .action(async () => {
    try {
      await deviceListCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Device list failed: ${error.message}\n`));
      process.exit(1);
    }
  });

device
  .command('remove <name>')
  .description('Remove a device by name')
  .action(async (name) => {
    try {
      await deviceRemoveCommand(name);
    } catch (error) {
      console.error(chalk.red(`\n✗ Device remove failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('logs [service]')
  .description('Tail service logs (voice-app, api-server, or all)')
  .action(async (service) => {
    try {
      await logsCommand(service);
    } catch (error) {
      console.error(chalk.red(`\n✗ Logs command failed: ${error.message}\n`));
      process.exit(1);
    }
  });

// Config management subcommands
const config = program
  .command('config')
  .description('Manage configuration');

config
  .command('show')
  .description('Display configuration with redacted secrets')
  .action(async () => {
    try {
      await configShowCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Config show failed: ${error.message}\n`));
      process.exit(1);
    }
  });

config
  .command('path')
  .description('Show configuration file location')
  .action(async () => {
    try {
      await configPathCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Config path failed: ${error.message}\n`));
      process.exit(1);
    }
  });

config
  .command('reset')
  .description('Reset configuration (creates backup)')
  .action(async () => {
    try {
      await configResetCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Config reset failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update Claude Phone to latest version')
  .action(async () => {
    try {
      await updateCommand();
    } catch (error) {
      console.error(chalk.red(`\n✗ Update failed: ${error.message}\n`));
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
