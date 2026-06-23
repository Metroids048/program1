#!/usr/bin/env node
/**
 * 一键将当前项目同步到 GitHub（尊重 .gitignore，不提交 .env / node_modules 等）
 *
 * 用法：
 *   npm run sync:github
 *   npm run sync:github -- "修复登录页样式"
 *   node scripts/sync-to-github.mjs
 *   node scripts/sync-to-github.mjs "自定义提交说明"
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REMOTE = 'https://github.com/Metroids048/program1.git';
const DEFAULT_BRANCH = 'main';

const customMessage = process.argv.slice(2).join(' ').trim();

function run(cmd, options = {}) {
  const { silent = false, allowFail = false } = options;
  if (!silent) console.log(`> ${cmd}`);
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return typeof out === 'string' ? out.trim() : '';
  } catch (error) {
    if (allowFail) return '';
    throw error;
  }
}

function runCapture(cmd, allowFail = false) {
  return run(cmd, { silent: true, allowFail });
}

function gitCommit(message) {
  console.log(`> git commit -m "${message}"`);
  const result = spawnSync('git', ['commit', '-m', message], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) {
    throw new Error('git commit 失败');
  }
}

function ensureGitRepo() {
  const gitDir = path.join(ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    console.log('[1/5] 初始化 Git 仓库…');
    run('git init');
    run(`git branch -M ${DEFAULT_BRANCH}`);
    return;
  }
  const entries = fs.readdirSync(gitDir);
  if (entries.length === 0) {
    fs.rmSync(gitDir, { recursive: true, force: true });
    console.log('[1/5] 检测到损坏的 .git，重新初始化…');
    run('git init');
    run(`git branch -M ${DEFAULT_BRANCH}`);
  }
}

function ensureRemote() {
  const remote = runCapture('git remote get-url origin', true);
  if (!remote) {
    console.log(`[2/5] 添加远程仓库: ${DEFAULT_REMOTE}`);
    run(`git remote add origin ${DEFAULT_REMOTE}`);
    return;
  }
  console.log(`[2/5] 远程仓库: ${remote}`);
}

function ensureBranch() {
  const branch = runCapture('git branch --show-current') || DEFAULT_BRANCH;
  if (branch !== DEFAULT_BRANCH) {
    console.log(`[提示] 当前分支为 ${branch}，将推送到 origin/${branch}`);
  }
  return branch;
}

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pullRebase(branch) {
  const upstream = runCapture(`git rev-parse --abbrev-ref ${branch}@{upstream}`, true);
  if (!upstream) {
    console.log('[3/5] 首次推送，跳过拉取远程');
    return;
  }
  console.log('[3/5] 拉取远程更新（rebase）…');
  const result = spawnSync('git', ['pull', '--rebase', 'origin', branch], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    console.error('\n[错误] 拉取失败，可能存在冲突。请先手动解决后重试。');
    if (err) console.error(err);
    process.exit(1);
  }
}

function main() {
  console.log('========================================');
  console.log('  同步到 GitHub');
  console.log(`  目录: ${ROOT}`);
  console.log('========================================\n');

  ensureGitRepo();
  ensureRemote();
  const branch = ensureBranch();

  console.log('[4/5] 暂存变更（git add -A）…');
  run('git add -A');

  const status = runCapture('git status --porcelain');
  if (!status) {
    console.log('\n[完成] 没有需要同步的变更，远程已是最新。');
    process.exit(0);
  }

  const changedCount = status.split('\n').filter(Boolean).length;
  console.log(`       共 ${changedCount} 个文件有变更`);

  const message = customMessage || `sync: 自动同步 ${formatTimestamp()}`;
  console.log(`[5/5] 提交并推送: ${message}`);
  gitCommit(message);

  pullRebase(branch);

  run(`git push -u origin ${branch}`);

  const commit = runCapture('git log -1 --oneline');
  console.log('\n========================================');
  console.log('  同步成功');
  console.log(`  提交: ${commit}`);
  console.log(`  仓库: ${runCapture('git remote get-url origin')}`);
  console.log(`  分支: ${branch}`);
  console.log('========================================');
}

main();
