import chalk from 'chalk';
import { getConfigPath, getConfigDir, configExists } from '../../config.js';

/**
 * Config path command - Show configuration file location
 * @returns {Promise<void>}
 */
export async function configPathCommand() {
  console.log(chalk.bold.cyan('\n📂 Configuration Location\n'));

  const configPath = getConfigPath();
  const configDir = getConfigDir();

  if (!configExists()) {
    console.log(chalk.red('✗ Configuration not found'));
    console.log(chalk.gray(`  Expected location: ${configPath}\n`));
    console.log(chalk.gray('  Run "claude-phone setup" to create configuration\n'));
    return;
  }

  console.log(chalk.gray('Config directory:'));
  console.log(chalk.bold(`  ${configDir}`));
  console.log();
  console.log(chalk.gray('Config file:'));
  console.log(chalk.bold(`  ${configPath}`));
  console.log();

  console.log(chalk.yellow('⚠️  Warning: This file contains API keys and passwords'));
  console.log(chalk.gray('  Do not share or commit this file to version control\n'));
}
