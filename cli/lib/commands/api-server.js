import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import path from 'path';
import { loadConfig, configExists } from '../config.js';
import { getProjectRoot } from '../utils.js';
import { savePid, removePid } from '../process-manager.js';

/**
 * API Server command - Start claude-api-server for remote connections
 * @param {object} options - Command options
 * @param {number} options.port - Port to listen on (default: 3333)
 * @returns {Promise<void>}
 */
export async function apiServerCommand(options = {}) {
  console.log(chalk.bold.cyan('\n🤖 Claude API Server\n'));

  // Load config to get port if not provided
  let port = options.port;
  if (!port && configExists()) {
    const config = await loadConfig();
    port = config.server?.claudeApiPort || 3333;
  }
  if (!port) {
    port = 3333; // Final fallback
  }

  console.log(chalk.gray(`Starting API server on port ${port}...`));
  console.log(chalk.gray('This wraps Claude Code CLI for Pi connections.\n'));

  const projectRoot = getProjectRoot();
  const serverPath = path.join(projectRoot, 'claude-api-server', 'server.js');

  const spinner = ora('Starting server...').start();

  try {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: port.toString()
      },
      stdio: 'inherit'
    });

    // Save PID
    savePid('claude-api-server', child.pid);

    spinner.succeed(chalk.green('Server started'));
    console.log(chalk.bold.cyan(`\n📡 Listening on port ${port}\n`));
    console.log(chalk.gray('Waiting for Pi connections...'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    // Handle cleanup on exit
    const cleanup = () => {
      removePid('claude-api-server');
      child.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Wait for child to exit
    child.on('exit', (code) => {
      removePid('claude-api-server');
      if (code !== 0) {
        console.log(chalk.red(`\n✗ Server exited with code ${code}\n`));
        process.exit(code);
      }
    });

  } catch (error) {
    spinner.fail(chalk.red('Failed to start server'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    throw error;
  }
}
