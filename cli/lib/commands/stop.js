import chalk from 'chalk';
import ora from 'ora';
import { stopContainers } from '../docker.js';
import { stopServer, isServerRunning } from '../process-manager.js';

/**
 * Stop command - Shut down all services
 * @returns {Promise<void>}
 */
export async function stopCommand() {
  console.log(chalk.bold.cyan('\n⏹️  Stopping Claude Phone\n'));

  // Stop claude-api-server
  const spinner = ora('Stopping Claude API server...').start();
  try {
    if (await isServerRunning()) {
      await stopServer();
      spinner.succeed('Claude API server stopped');
    } else {
      spinner.info('Claude API server not running');
    }
  } catch (error) {
    spinner.fail(`Failed to stop server: ${error.message}`);
  }

  // Stop Docker containers
  spinner.start('Stopping Docker containers...');
  try {
    await stopContainers();
    spinner.succeed('Docker containers stopped');
  } catch (error) {
    spinner.fail(`Failed to stop containers: ${error.message}`);
  }

  console.log(chalk.bold.green('\n✓ All services stopped\n'));
}
