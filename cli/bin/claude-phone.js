#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from '../lib/commands/setup.js';
import { startCommand } from '../lib/commands/start.js';
import { stopCommand } from '../lib/commands/stop.js';
import { statusCommand } from '../lib/commands/status.js';

const program = new Command();

program
  .name('claude-phone')
  .description('Unified CLI for Claude Phone voice interface')
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

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
