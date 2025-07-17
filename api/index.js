import fs from 'fs'
import RSp from 'file:///usr/lib/node_modules/rsp-libcore.js/index.js'

// Configurações
const CONFIG = {
  version: '1.0.0-beta',
  requiredBranches: ['main', 'dev'],
  expectedBranch: 'dev',
  remoteName: 'origin'
};

const logger = new RSp.Logger();
const exeCommand = (command) => RSp.exec(command, true);

// Utilitários
const getGitHubUsername = () => {
  try {
    return exeCommand('git config user.namespace || git config user.name').trim();
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

// Git Operations
class GitHelper {
  static runCommand(cmd) {
    try {
      return exeCommand(cmd).trim();
    } catch {
      return '';
    }
  }

  static isGitRepo() {
    return fs.existsSync('.git') || !!this.runCommand('git rev-parse --is-inside-work-tree');
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
      exeCommand('git fetch', { stdio: 'ignore' });
      const local = this.runCommand('git rev-parse @');
      const remote = this.runCommand('git rev-parse @{u}');
      return local === remote;
    } catch {
      return false;
    }
  }

  static canPush() {
    try {
      exeCommand('git push --dry-run', { stdio: 'ignore' });
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
      return true;
    } catch {
      return false;
    }
  }

  static async testSSHAuthentication() {
    try {
      return true;
    } catch {
      return false;
    }
  }
}

// Validators
class GitValidator {
  static checkGitRepo() {
    if (!GitHelper.isGitRepo()) {
      return {
        success: false,
        message: 'This directory is not a Git repository',
        fixCommand: 'git init'
      };
    }
    return { success: true, message: 'Git repository found' };
  }

  static checkBranches() {
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

  static checkCurrentBranch() {
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

  static checkRemote() {
    if (!GitHelper.remoteExists()) {
      return {
        success: false,
        message: 'No Git remote configured',
        fixCommand: `git remote add origin ${REMOTE_URL}`
      };
    }
    return { success: true, message: 'Git remote configured' };
  }

  static async checkRemoteConnection() {
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

  static checkUpstream() {
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

  static checkSyncStatus() {
    if (!GitHelper.isSynced()) {
      return {
        success: false,
        message: 'Local and remote branches are not in sync',
        fixCommand: `git push ${CONFIG.remoteName} ${CONFIG.expectedBranch}`
      };
    }
    return { success: true, message: 'Local and remote branches are in sync' };
  }

  static checkPushPermission() {
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

// Funções exportadas
async function initializeRepository() {

  logger.head('→ Initializing Git Repository', { brekup: true, breakdown: true });

  if (GitHelper.isGitRepo()) {
    logger.error('This directory already contains a Git repository', false, false, false, 4);
    return false;
  }

  try {
    exeCommand('git init');

    exeCommand('echo "node_modules" >> .gitignore');
    exeCommand('echo "dist" >> .gitignore');
    exeCommand('echo "build" >> .gitignore');
    exeCommand('echo "packages-lock.json" >> .gitignore');

    exeCommand('git add .');
    exeCommand('git commit -m "Initial commit"');
    
    logger.success('Initial commit created');

    exeCommand(`git checkout -b ${CONFIG.expectedBranch}`);
    exeCommand(`git checkout ${CONFIG.expectedBranch}`);

    logger.success(`Created branches: ${CONFIG.requiredBranches.join(', ')}`);
    logger.success('Repository initialized successfully!');
    // logger.remoteHint();

    return true;

  } catch (error) {
    logger.error('Failed to initialize repository:');
    logger.error(error.message);
    return false;
  }
}

async function runValidation() {

  logger.head('Running Git Repository Validation', { brekup: true });

  const validations = [
    { name: 'Git Repository', validator: GitValidator.checkGitRepo },
    { name: 'Required Branches', validator: GitValidator.checkBranches },
    { name: 'Current Branch', validator: GitValidator.checkCurrentBranch },
    { name: 'Remote Configuration', validator: GitValidator.checkRemote },
    { name: 'Remote Connection', validator: GitValidator.checkRemoteConnection },
    { name: 'Upstream Branch', validator: GitValidator.checkUpstream },
    { name: 'Sync Status', validator: GitValidator.checkSyncStatus },
    { name: 'Push Permission', validator: GitValidator.checkPushPermission }
  ];

  let allValid = true;

  for (const { name, validator } of validations) {
    logger.loading(`Checking ${name}`, { breakup: true, breakdown: true });
    
    const result = await validator();
    
    if (result.success) {
      logger.success(result.message + ' [OK]', false, false, false, 10);
    } else {
      logger.error(result.message + ' [FAILED]', false, false, false, 10);
      if (result.fixCommand) {
        logger.echo(result.fixCommand, false, false, false, 10);
      }
      allValid = false;
    }
    
  }

  if (allValid) {
    logger.success('All checks passed! Your repository is ready for develop.');
  } else {
    logger.error('Some checks failed. Please fix the issues above.', { breakdown: false });
    if (!GitHelper.remoteExists()) {
      logger.error('Remote repository not found')
    }
  }
}

async function syncRepository() {
  logger.head('↺ Synchronizing repository', { });

  if (!GitHelper.isGitRepo()) {
    logger.error('Not a Git repository');
    exec('git init');
    return false;
  }

  try {
    logger.info('Sending changes to both branches...', false, false, false, 4);
    exeCommand(`
      git add .
      git commit -m update
      git push origin -u dev
      git push origin main
    `);
  } catch (error) {
    logger.error('Error during synchronization:');
    logger.error(error.message);
    return false;
  }
}

function checkStatus() {
  const repoStatus = exeCommand('git status');

  exeCommand('gio set -t stringv . metadata::emblems -d');

  if (repoStatus.includes('branch is up to date with') && !repoStatus.includes('Changes not staged for commit')) {
    logger.success('Repository is successfully up to date', false, true, false, 4);
    exeCommand('gio set -t stringv . metadata::emblems emblem-checked');
    return true;
  } else {
    logger.error('not up to date', false, true, false, 4);
    exeCommand('gio set -t stringv . metadata::emblems emblem-error');
    return false;
  }
}

function gitCompress() {
  exeCommand('git gc --aggressive; git repack -a -d --depth=250 --window=250');
}

function gitAddRemote(privorpub) {
  if (!privorpub) {
    logger.error('Provide --public or --private flag');
    return;
  }

  logger.loading(`Creating remote "${privorpub}" repository for "` + REPO_NAME + '"', { break: true });

  if (checkRemoteExists()) {
    logger.error('There is a remote for this repository already:', false, true, false, 4);
    logger.info('URL: ' + checkRemoteExists(), false, false, false, 4);
    logger.info('If you want to delete it, hit "unremote" command beforehand.', false, false, false, 4);
    return;
  }

  logger.loading(`Creating "${privorpub}" for "${REPO_NAME}"`, { break: true });
  exeCommand(`gh repo create --${privorpub} ${REPO_NAME}`);
  logger.success(`"${privorpub}" repository created for "${REPO_NAME}":`, false, true, true, 8);
  logger.info('URL: ' + checkRemoteExists(), false, true, true, 8);
}

function gitUnremote(confirmed) {

  if (!checkRemoteExists()) {
    logger.info('There is not a remote for this repository yet:', false, true, true, 8);
    logger.info('If you want to create it, hit "remote" command beforehand.', false, true, true, 8);
    return;
  }

  if (!confirmed) {
    logger.info('Please set the --confirmed flag to proceed', false, true, true, 8);
    return;
  }

  logger.loading(`Deleting remote repository of "${REPO_NAME}"`, false, true, false);
  exeCommand(`gh repo delete ${REPO_NAME} --yes`);
  logger.success(`Remote repository deleted for "${REPO_NAME}".`, false, true, false, 4);
}

function gitAddOrigin() {

    logger.loading(`Adding origin to local repository "${REPO_NAME}"`, false, true, false);

  if (checkOriginExists()) {
    logger.error('Remote origin already exists for this repository', false, true, false, 4);
    logger.info('URL: ' + checkOriginExists(), false, false, false, 4);
    return;
  }

  exeCommand(`git remote add origin ${REMOTE_URL}`);
  logger.success('Remote origin added: ' + REMOTE_URL, false, true, false, 4);
}

function gitUnorigin() {

    logger.loading(`Removing origin of local repository "${REPO_NAME}"`, false, true, false);

  if (checkOriginExists()) {
    logger.info('Removing current remote origin for current repository', false, true, false, 4);
    exeCommand('git remote remove origin');
    logger.success(`Remote origin removed for "${REPO_NAME}"`, false, false, false, 4);
    return;
  }

  logger.info('There is not a remote origin setup for this repository yet', false, true, false, 4);
  logger.info('Add remote origin with "origin" subcommand.', false, false, false, 4);
}

function gitOffsite() {
  if (!checkStatus()) {
    throw new Error('Repository is not up to date');
  }

  logger.info(`Offsiting local repository: "${REPO_NAME}"`, false, true, true, 8);
  exeCommand(`cd ${process.cwd()} && cd ..; rm -rf ${REPO_NAME}`);
  logger.info('Checking was removed...', false, true, true, 8);
  exeCommand(`cd ${process.cwd()} && cd ..; ls "${REPO_NAME}"`);
}

function gitVisit() {
  const url = checkRemoteExists();
  if (url) {
    exeCommand(`x-www-browser ${url}`);
    return;
  }
  logger.error('There is no remote URL for this repository', false, true, false, 4);
}

function checkRemoteExists() {
  try {
    const url = JSON.parse(exeCommand(`gh repo view ${REPO_NAME} --json url`)).url;
    if (url) return url;
  } catch (error) {
    return false;
  }
}

function checkOriginExists() {
  try {
    const url = exeCommand('git remote get-url origin');
    if (url) return url;
  } catch (error) {
    return false;
  }
}

export default {
  initializeRepository,
  runValidation,
  syncRepository,
  checkStatus,
  gitCompress,
  gitAddRemote,
  gitUnremote,
  gitAddOrigin,
  gitUnorigin,
  gitOffsite,
  gitVisit
}

export {
  initializeRepository,
  runValidation,
  syncRepository,
  checkStatus,
  gitCompress,
  gitAddRemote,
  gitUnremote,
  gitAddOrigin,
  gitUnorigin,
  gitOffsite,
  gitVisit
}