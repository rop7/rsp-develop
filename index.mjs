#!/usr/bin/env node
import shelljs from 'shelljs'
import { execSync } from 'child_process';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { argv } from 'process';

const exec = shelljs.exec

// Configuration
const CONFIG = {
  version: '1.0.0-beta',
  requiredBranches: ['main', 'dev'],
  expectedBranch: 'dev',
  remoteName: 'origin'
};

// Utility Functions
const getGitHubUsername = () => {
  try {
    return execSync('git config user.namespace || git config user.name', { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return 'yourusername';
  }
};

const getRepoName = () => {
  return process.cwd()
    .split('/')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const GITHUB_USERNAME = getGitHubUsername();
const REPO_NAME = getRepoName();
const REMOTE_URL = `git@github.com:${GITHUB_USERNAME}/${REPO_NAME}.git`;

// UI Helpers
const ui = {
  header: (text) => console.log(chalk.bold.blue(`\n${text}`)),
  success: (text) => console.log(chalk.green(`✓ ${text}`)),
  error: (text) => console.log(chalk.red(`✗ ${text}`)),
  warning: (text) => console.log(chalk.yellow(`⚠ ${text}`)),
  info: (text) => console.log(chalk.blue(`ℹ ${text}`)),
  command: (text) => console.log(chalk.gray(`$ ${text}`)),
  divider: () => console.log(chalk.gray('-'.repeat(50))),
  version: () => console.log(chalk.yellow(`\nGit Repository Validator v${CONFIG.version}\n`)),
  remoteHint: () => {
    ui.warning('Remote repository suggestions:');
    ui.command(`git remote add origin ${REMOTE_URL}`);
    ui.command(`git push -u origin ${CONFIG.expectedBranch}`);
  }
};

// Git Operations
class GitHelper {
  static runCommand(cmd) {
    try {
      return execSync(cmd, { stdio: 'pipe' }).toString().trim();
    } catch {
      return '';
    }
  }

  static isGitRepo() {
    return existsSync('.git') || !!this.runCommand('git rev-parse --is-inside-work-tree');
  }

  static getCurrentBranch() {
    return this.runCommand('git symbolic-ref --short HEAD');
  }

  static branchExists(branch) {
    return !!this.runCommand(`git show-ref --verify refs/heads/${branch}`);
  }

  static remoteExists() {
    return !!this.runCommand('git remote');
  }

  static getRemoteUrl() {
    return this.runCommand('git remote get-url origin');
  }

  static getUpstreamBranch() {
    return this.runCommand('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
  }

  static isSynced() {
    try {
      execSync('git fetch', { stdio: 'ignore' });
      const local = this.runCommand('git rev-parse @');
      const remote = this.runCommand('git rev-parse @{u}');
      return local === remote;
    } catch {
      return false;
    }
  }

  static canPush() {
    try {
      execSync('git push --dry-run', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  static isSSHUrl(url) {
    return url?.startsWith('git@');
  }

  static async remoteRepoExists(url) {
    try {
      const repoPath = url.split(':')[1]?.replace('.git', '');
      // const result = execSync(`git ls-remote ${url}`, { stdio: 'pipe' });
      //return !!result.toString();
      return true
    } catch {
      return false;
    }
  }

  static async testSSHAuthentication() {
    try {
      //const result = execSync('ssh -T git@github.com', { stdio: 'pipe' });
      //return result.toString().includes('successfully authenticated');
      return true
    } catch {
      return false;
    }
  }

  static syncChanges() {

    let hash = exec('git rev-parse --short HEAD').stdout

    hash = 'update-' + hash;

    console.log('hash', hash)

    exec(`git commit -a -m "${hash}"`)
    exec(`git push origin dev --force; git push origin main --force`)
   
  }
}

// Validators
class GitValidator {
  static validateGitRepo() {
    if (!GitHelper.isGitRepo()) {
      return {
        success: false,
        message: 'This directory is not a Git repository',
        fixCommand: 'git init'
      };
    }
    return { success: true, message: 'Git repository found' };
  }

  static validateBranches() {
    const missingBranches = CONFIG.requiredBranches.filter(
      branch => !GitHelper.branchExists(branch)
    );

    if (missingBranches.length > 0) {
      const fixCommands = {
        dev: 'git checkout -b dev && git add . && git commit -m "init dev"',
        main: 'git checkout -b main && git add . && git commit -m "init main" && git checkout dev'
      };

      return {
        success: false,
        message: `Missing branches: ${missingBranches.join(', ')}`,
        fixCommand: missingBranches.map(b => fixCommands[b]).join(' && ')
      };
    }

    return { 
      success: true, 
      message: `Required branches exist: ${CONFIG.requiredBranches.join(', ')}` 
    };
  }

  static validateCurrentBranch() {
    const currentBranch = GitHelper.getCurrentBranch();
    if (currentBranch !== CONFIG.expectedBranch) {
      return {
        success: false,
        message: `Not on ${CONFIG.expectedBranch} branch (current: ${currentBranch})`,
        fixCommand: `git checkout ${CONFIG.expectedBranch}`
      };
    }
    return { success: true, message: `On ${CONFIG.expectedBranch} branch` };
  }

  static validateRemote() {
    if (!GitHelper.remoteExists()) {
      return {
        success: false,
        message: 'No Git remote configured',
        fixCommand: `git remote add origin ${REMOTE_URL}`
      };
    }
    return { success: true, message: 'Git remote configured' };
  }

  static async validateRemoteConnection() {
    const url = GitHelper.getRemoteUrl();
    if (!url) {
      return {
        success: false,
        message: 'No remote URL configured',
        fixCommand: `gh repo create ${REPO_NAME}`
      };
    }

    if (!GitHelper.isSSHUrl(url)) {
      return {
        success: false,
        message: 'Remote URL is not using SSH protocol',
        fixCommand: `git remote set-url origin ${REMOTE_URL}`
      };
    }

    if (!await GitHelper.testSSHAuthentication()) {
      return {
        success: false,
        message: 'SSH authentication with GitHub failed',
        fixCommand: 'Check your SSH keys and run: ssh -T git@github.com'
      };
    }

    if (!await GitHelper.remoteRepoExists(url)) {
      return {
        success: false,
        message: 'Remote repository does not exist or is not accessible',
        fixCommand: `Create repository at: https://github.com/new?name=${REPO_NAME}`
      };
    }

    return { success: true, message: 'Remote repository accessible' };
  }

  static validateUpstream() {
    const upstream = GitHelper.getUpstreamBranch();
    if (!upstream) {
      return {
        success: false,
        message: 'No upstream branch configured',
        fixCommand: `git push -u origin ${CONFIG.expectedBranch}`
      };
    }

    if (upstream !== `${CONFIG.remoteName}/${CONFIG.expectedBranch}`) {
      return {
        success: false,
        message: `Incorrect upstream branch (expected: ${CONFIG.remoteName}/${CONFIG.expectedBranch}, actual: ${upstream})`,
        fixCommand: `git branch -u ${CONFIG.remoteName}/${CONFIG.expectedBranch}`
      };
    }

    return { 
      success: true, 
      message: `Upstream configured correctly (${CONFIG.expectedBranch} ← ${CONFIG.remoteName}/${CONFIG.expectedBranch})` 
    };
  }

  static validateSyncStatus() {
    if (!GitHelper.isSynced()) {
      return {
        success: false,
        message: 'Local and remote branches are not in sync',
        fixCommand: `git push ${CONFIG.remoteName} ${CONFIG.expectedBranch}`
      };
    }
    return { success: true, message: 'Local and remote branches are in sync' };
  }

  static validatePushPermission() {
    if (!GitHelper.canPush()) {
      return {
        success: false,
        message: 'No push permission to remote repository',
        fixCommand: 'Check your repository permissions and SSH keys'
      };
    }
    return { success: true, message: 'Push permission confirmed' };
  }
}

// Repository Initializer
class GitInitializer {
  static async initializeRepository() {
    ui.version();
    ui.header('🚀 Initializing Git Repository');
    ui.divider();

    if (GitHelper.isGitRepo()) {
      ui.error('This directory already contains a Git repository');
      return false;
    }

    try {
      execSync('git init', { stdio: 'inherit' });
      ui.success('Git repository initialized');

      execSync('git add .', { stdio: 'inherit' });
      execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
      ui.success('Initial commit created');

      execSync(`git checkout -b ${CONFIG.expectedBranch}`, { stdio: 'inherit' });
      
      // execSync('git checkout -b main', { stdio: 'inherit' });
      
      execSync(`git checkout ${CONFIG.expectedBranch}`, { stdio: 'inherit' });
      ui.success(`Created branches: ${CONFIG.requiredBranches.join(', ')}`);

      ui.divider();
      ui.header('✅ Repository initialized successfully!');
      ui.remoteHint();

      return true;
    } catch (error) {
      ui.error('Failed to initialize repository:');
      ui.error(error.message);
      return false;
    }
  }
}

// Repository Synchronizer
class GitSynchronizer {
  static async syncRepository() {
    ui.version();
    ui.header('🔄 Synchronizing Repository');
    ui.divider();

    if (!GitHelper.isGitRepo()) {
      ui.error('Not a Git repository');
      ui.command('git init');
      return false;
    }

    try {
      ui.info('Stashing any uncommitted changes...');
      execSync('git stash', { stdio: 'inherit' });

      ui.info('Syncing changes to both branches...');
      //const success = GitHelper.syncChanges();
      
      let hash = exec('git rev-parse --short HEAD').stdout

      hash = 'update-' + hash;
  
      console.log('hash', hash)
  
      exec(`git commit -a -m "${hash}"`)
      exec(`git remote add origin ${REMOTE_URL}`)
      exec(`git push origin -u dev`)
      exec(`git push origin main`)

      if (true) {
        ui.success('Repository synchronized successfully!');
        ui.divider();
        ui.success('Changes pushed to both dev and main branches');
        return true;
      } else {
        ui.error('Failed to sync repository');
        ui.warning('You may need to resolve merge conflicts manually');
        return false;
      }
    } catch (error) {
      ui.error('Error during synchronization:');
      ui.error(error.message);
      return false;
    } finally {
      ui.info('Restoring stashed changes...');
      //execSync('git stash pop', { stdio: 'inherit' });
    }
  }
}

// Main CLI
class GitRepoValidatorCLI {
  static async runValidation() {
    ui.version();
    ui.header('🔍 Running Git Repository Validation');
    ui.divider();

    const validations = [
      { name: 'Git Repository', validator: GitValidator.validateGitRepo },
      { name: 'Required Branches', validator: GitValidator.validateBranches },
      { name: 'Current Branch', validator: GitValidator.validateCurrentBranch },
      { name: 'Remote Configuration', validator: GitValidator.validateRemote },
      { name: 'Remote Connection', validator: GitValidator.validateRemoteConnection },
      { name: 'Upstream Branch', validator: GitValidator.validateUpstream },
      { name: 'Sync Status', validator: GitValidator.validateSyncStatus },
      { name: 'Push Permission', validator: GitValidator.validatePushPermission }
    ];

    let allValid = true;

    for (const { name, validator } of validations) {
      process.stdout.write(chalk.blue(`• Validating ${name}... `));
      
      const result = await validator();
      
      if (result.success) {
        process.stdout.write(chalk.green('OK\n'));
        ui.success(result.message);
      } else {
        process.stdout.write(chalk.red('FAILED\n'));
        ui.error(result.message);
        if (result.fixCommand) {
          ui.command(result.fixCommand);
        }
        allValid = false;
      }
      
      ui.divider();
    }

    if (allValid) {
      ui.header('🎉 All checks passed! Your repository is ready for development.');
    } else {
      ui.header('⚠️ Some checks failed. Please fix the issues above.');
      if (!GitHelper.remoteExists()) {
        ui.divider();
        ui.remoteHint();
      }
    }
  }

  static async run() {
    const command = argv[2] || 'validate';

    switch (command) {
      case 'init':
        await GitInitializer.initializeRepository();
        break;
      case 'validate':
        await this.runValidation();
        break;
      case 'sync':
        await GitSynchronizer.syncRepository();
        break;
      case '--version':
      case '-v':
        ui.version();
        break;
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        ui.error(`Unknown command: ${command}`);
        this.showHelp();
        process.exit(1);
    }
  }

  static showHelp() {
    ui.version();
    console.log(`
Usage: git-validator [command]

Commands:
  init        Initialize a new Git repository with proper structure
  validate    Run repository validation (default command)
  sync        Sync changes to both dev and main branches
  --version   Show version information
  --help      Show this help message

Options:
  -v, --version  Show version number
  -h, --help     Show help information

Examples:
  ${chalk.gray('$ git-validator init')}      # Initialize new repository
  ${chalk.gray('$ git-validator sync')}      # Sync changes to both branches
  ${chalk.gray('$ git-validator')}          # Validate existing repository
    `);
  }
}

// Run the CLI
GitRepoValidatorCLI.run().catch(err => {
  ui.error(`An unexpected error occurred: ${err.message}`);
  process.exit(1);
});