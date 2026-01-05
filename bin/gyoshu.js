#!/usr/bin/env bun
/**
 * Gyoshu CLI - Installation and management for the research automation system
 * 
 * Usage:
 *   gyoshu install [--link]   Install Gyoshu to OpenCode config
 *   gyoshu uninstall          Remove Gyoshu from OpenCode config
 *   gyoshu check              Verify installation status
 *   gyoshu help               Show this help message
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync, symlinkSync, lstatSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = dirname(__dirname);

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Paths
const OPENCODE_CONFIG = join(homedir(), '.config', 'opencode');
const SOURCE_DIR = join(packageRoot, 'src');

// Directories to install
const INSTALL_DIRS = ['agent', 'command', 'tool', 'skill', 'bridge', 'lib', 'plugin'];

function printHeader() {
  console.log('');
  console.log(c('blue', '┌─────────────────────────────────────────────────────┐'));
  console.log(c('blue', '│') + `  🎓 ${c('green', 'Gyoshu')} — Research Automation CLI               ` + c('blue', '│'));
  console.log(c('blue', '│') + `     ${c('yellow', '교수 (Professor) + 조교 (Teaching Assistant)')}     ` + c('blue', '│'));
  console.log(c('blue', '└─────────────────────────────────────────────────────┘'));
  console.log('');
}

function printHelp() {
  console.log('Usage: gyoshu <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  install [--link]   Install Gyoshu to ~/.config/opencode/');
  console.log('                     --link: Create symlinks (dev mode, auto-updates)');
  console.log('  uninstall          Remove Gyoshu from OpenCode');
  console.log('  check              Verify installation status');
  console.log('  help               Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  gyoshu install              # Standard installation (copy)');
  console.log('  gyoshu install --link       # Developer mode (symlink)');
  console.log('  gyoshu uninstall            # Remove Gyoshu');
  console.log('');
}

function checkRequirements() {
  console.log(c('cyan', '🔍 Checking requirements...'));
  
  // Check Python
  try {
    const pyVersion = execSync('python3 -c "import sys; print(f\'{sys.version_info.major}.{sys.version_info.minor}\')"', { encoding: 'utf8' }).trim();
    const [major, minor] = pyVersion.split('.').map(Number);
    if (major > 3 || (major === 3 && minor >= 10)) {
      console.log(`   ${c('green', '✓')} Python ${pyVersion}`);
    } else {
      console.log(`   ${c('red', '✗')} Python ${pyVersion} (need 3.10+)`);
      process.exit(1);
    }
  } catch {
    console.log(`   ${c('red', '✗')} Python 3 not found`);
    process.exit(1);
  }
  
  // Check OpenCode
  try {
    execSync('which opencode', { encoding: 'utf8' });
    console.log(`   ${c('green', '✓')} OpenCode installed`);
  } catch {
    console.log(`   ${c('yellow', '⚠')} OpenCode not in PATH (install from github.com/opencode-ai/opencode)`);
  }
  
  // Check platform
  const plat = platform();
  if (plat === 'win32') {
    console.log(`   ${c('red', '✗')} Windows not supported (use WSL2)`);
    process.exit(1);
  }
  console.log(`   ${c('green', '✓')} Platform: ${plat}`);
}

function installCopy() {
  console.log(c('cyan', '📋 Installing (copy mode)...'));
  
  // Create config directory
  mkdirSync(OPENCODE_CONFIG, { recursive: true });
  
  for (const dir of INSTALL_DIRS) {
    const srcPath = join(SOURCE_DIR, dir);
    const destPath = join(OPENCODE_CONFIG, dir);
    
    if (existsSync(srcPath)) {
      // Remove existing
      if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true });
      }
      
      // Copy (excluding test files)
      cpSync(srcPath, destPath, {
        recursive: true,
        filter: (src) => {
          // Exclude test files and __pycache__
          if (src.includes('.test.ts') || src.includes('.test.js') || src.includes('__pycache__')) {
            return false;
          }
          return true;
        }
      });
      
      console.log(`   ${c('green', '✓')} Copied ${dir}/`);
    }
  }
}

function installLink() {
  console.log(c('cyan', '🔗 Installing with symlinks (dev mode)...'));
  
  // Create config directory
  mkdirSync(OPENCODE_CONFIG, { recursive: true });
  
  for (const dir of INSTALL_DIRS) {
    const srcPath = join(SOURCE_DIR, dir);
    const destPath = join(OPENCODE_CONFIG, dir);
    
    if (existsSync(srcPath)) {
      // Remove existing (file, link, or dir)
      if (existsSync(destPath) || lstatSync(destPath).isSymbolicLink()) {
        rmSync(destPath, { recursive: true, force: true });
      }
      
      // Create symlink
      symlinkSync(srcPath, destPath);
      console.log(`   ${c('green', '✓')} Linked ${dir}/`);
    }
  }
  
  console.log('');
  console.log(`   ${c('cyan', 'ℹ')}  Dev mode: Changes sync automatically`);
}

function uninstall() {
  console.log(c('cyan', '🗑️  Uninstalling Gyoshu...'));
  
  // Gyoshu-specific files to remove
  const gyoshuItems = [
    'agent/gyoshu.md', 'agent/jogyo.md', 'agent/baksa.md', 
    'agent/jogyo-paper-writer.md', 'agent/jogyo-feedback.md', 'agent/jogyo-insight.md',
    'command/gyoshu.md', 'command/gyoshu-auto.md',
    'tool/gyoshu-completion.ts', 'tool/gyoshu-snapshot.ts', 'tool/python-repl.ts',
    'tool/notebook-writer.ts', 'tool/notebook-search.ts', 'tool/research-manager.ts',
    'tool/session-manager.ts', 'tool/migration-tool.ts',
    'tool/retrospective-store.ts', 'tool/checkpoint-manager.ts',
    'bridge',
    'skill/ml-rigor', 'skill/scientific-method', 'skill/experiment-design', 'skill/data-analysis',
    'lib/quality-gates.ts', 'lib/marker-parser.ts',
    'lib/notebook-frontmatter.ts', 'lib/report-markdown.ts', 'lib/pdf-export.ts',
    'lib/paths.ts', 'lib/atomic-write.ts', 'lib/cell-identity.ts',
    'lib/checkpoint-schema.ts', 'lib/environment-capture.ts', 'lib/session-lock.ts',
    'lib/readme-index.ts', 'lib/filesystem-check.ts', 'lib/artifact-security.ts',
    'plugin/gyoshu-hooks.ts'
  ];
  
  for (const item of gyoshuItems) {
    const itemPath = join(OPENCODE_CONFIG, item);
    if (existsSync(itemPath)) {
      rmSync(itemPath, { recursive: true, force: true });
      console.log(`   ${c('green', '✓')} Removed ${item}`);
    }
  }
  
  console.log('');
  console.log(c('green', '✓ Gyoshu uninstalled'));
  console.log('  Other extensions in ~/.config/opencode/ are preserved.');
}

function check() {
  console.log(c('cyan', '🩺 Checking Gyoshu installation...'));
  console.log('');
  
  let passed = 0;
  let failed = 0;
  
  const coreFiles = [
    'command/gyoshu.md',
    'command/gyoshu-auto.md', 
    'agent/gyoshu.md',
    'agent/jogyo.md',
    'bridge/gyoshu_bridge.py'
  ];
  
  for (const file of coreFiles) {
    const filePath = join(OPENCODE_CONFIG, file);
    if (existsSync(filePath)) {
      try {
        const stat = lstatSync(filePath);
        if (stat.isSymbolicLink()) {
          console.log(`   ${c('green', '✓')} ${file} (symlink)`);
        } else {
          console.log(`   ${c('green', '✓')} ${file}`);
        }
        passed++;
      } catch {
        console.log(`   ${c('green', '✓')} ${file}`);
        passed++;
      }
    } else {
      console.log(`   ${c('red', '✗')} ${file} (missing)`);
      failed++;
    }
  }
  
  console.log('');
  if (failed === 0) {
    console.log(c('green', 'All checks passed!') + ' Gyoshu is ready.');
    console.log('');
    console.log(`Start with: ${c('blue', 'opencode')} then ${c('blue', '/gyoshu')}`);
    return 0;
  } else {
    console.log(c('red', `${failed} check(s) failed.`) + ' Run `gyoshu install` to fix.');
    return 1;
  }
}

function printSuccess() {
  console.log('');
  console.log(c('green', '┌─────────────────────────────────────────────────────┐'));
  console.log(c('green', '│') + `  ✅ ${c('green', 'Installation Complete!')}                          ` + c('green', '│'));
  console.log(c('green', '└─────────────────────────────────────────────────────┘'));
  console.log('');
  console.log(`🚀 ${c('green', 'Quick Start:')}`);
  console.log('');
  console.log(`   1. ${c('blue', 'cd your-project && opencode')}`);
  console.log(`   2. ${c('blue', '/gyoshu analyze customer churn patterns')}`);
  console.log('');
  console.log(`📖 Docs: ${c('cyan', 'https://github.com/Yeachan-Heo/My-Jogyo')}`);
  console.log('');
}

// Main
printHeader();

const args = process.argv.slice(2);
const command = args[0] || 'help';

switch (command) {
  case 'install':
    checkRequirements();
    if (args.includes('--link')) {
      installLink();
    } else {
      installCopy();
    }
    printSuccess();
    break;
    
  case 'uninstall':
    uninstall();
    break;
    
  case 'check':
    process.exit(check());
    break;
    
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
    
  default:
    console.log(c('red', `Unknown command: ${command}`));
    console.log('');
    printHelp();
    process.exit(1);
}
