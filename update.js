#!/usr/bin/env node
/**
 * OpenClaw Guide — 数据更新脚本
 * =========================================================
 * 职责：搜索 OpenClaw 最新动态，更新 data.json
 * 调用方：WorkBuddy 自动化任务（每周一 09:00）
 * 运行方式：node update.js
 *
 * 更新流程：
 *   1. 读取当前 data.json（作为基准）
 *   2. 通过 fetch 拉取 OpenClaw GitHub Releases API
 *   3. 解析最新版本信息，与现有 timeline/news 对比
 *   4. 合并新条目（去重），写回 data.json
 *   5. 更新 _meta.lastUpdated 时间戳
 * =========================================================
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_PATH  = join(__dirname, 'data.json');

// ─── 工具函数 ────────────────────────────────────────────

function log(msg)  { console.log(`[update] ${msg}`); }
function warn(msg) { console.warn(`[update] ⚠ ${msg}`); }

/** 带超时的 fetch */
async function fetchWithTimeout(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'openclaw-guide-updater/1.0' }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 读取 / 写入 data.json ───────────────────────────────

function readData() {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    warn(`读取 data.json 失败: ${e.message}`);
    throw e;
  }
}

function writeData(data) {
  data._meta.lastUpdated = new Date().toISOString();
  data._meta.updateSource = 'auto';
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  log(`data.json 写入成功，版本：${data._meta.version}，时间：${data._meta.lastUpdated}`);
}

// ─── 1. 拉取 GitHub Releases ─────────────────────────────

/**
 * 从 GitHub API 获取最新 Release 列表（最多 10 条）
 * 对应 openclaw/openclaw 仓库（如仓库名有变化请修改下方 REPO 常量）
 */
const REPO = 'openclaw/openclaw';

async function fetchLatestReleases() {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
  log(`拉取 Releases: ${url}`);
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      warn(`GitHub API 返回 ${res.status}，跳过 Release 更新`);
      return [];
    }
    return await res.json();
  } catch (e) {
    warn(`拉取 Releases 失败（${e.message}），跳过`);
    return [];
  }
}

// ─── 2. 构建 timeline 条目 ───────────────────────────────

function releaseToTimelineItem(release) {
  return {
    version: release.tag_name,
    date: release.published_at ? release.published_at.slice(0, 10) : '未知',
    desc: release.name || release.tag_name,
    active: false
  };
}

/**
 * 合并新 timeline 条目（按日期倒序，最新的置顶并标 active）
 * 保留最多 8 条，防止列表过长
 */
function mergeTimeline(existing, releases) {
  if (!releases.length) return existing;

  const existingVersions = new Set(existing.map(t => t.version));
  const newItems = releases
    .filter(r => !existingVersions.has(r.tag_name))
    .map(releaseToTimelineItem);

  if (!newItems.length) {
    log('时间线无新版本');
    return existing;
  }

  log(`发现 ${newItems.length} 个新版本：${newItems.map(i => i.version).join(', ')}`);

  const merged = [...newItems, ...existing]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 8);

  // 最新一条标 active
  merged.forEach((item, i) => { item.active = i === 0; });
  return merged;
}

// ─── 3. 构建 news 条目 ───────────────────────────────────

function releaseToNewsItem(release) {
  // 从 Release body 里提取关键要点（取前 5 个 markdown 列表项）
  const body = release.body || '';
  const lines = body.split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*+]\s/.test(l))
    .map(l => l.replace(/^[-*+]\s+/, ''))
    .slice(0, 5);

  return {
    id: `release-${release.tag_name}`,
    type: 'hot',
    typeLabel: '🔥 版本更新',
    date: release.published_at ? release.published_at.slice(0, 10) : '未知',
    title: `${release.tag_name} 发布：${release.name || '版本更新'}`,
    content: (release.body || '').slice(0, 300).replace(/\r?\n/g, ' ').trim() + (release.body?.length > 300 ? '…' : ''),
    highlights: lines,
    featured: true
  };
}

/**
 * 合并 news：将新 Release 的最新一条置为 featured，
 * 其余已有条目向后移，总数不超过 6 条
 */
function mergeNews(existing, releases) {
  if (!releases.length) return existing;

  const existingIds = new Set(existing.map(n => n.id));
  const newItems = releases
    .filter(r => !existingIds.has(`release-${r.tag_name}`))
    .map(releaseToNewsItem);

  if (!newItems.length) {
    log('动态无新条目');
    return existing;
  }

  // 新条目最新的一条 featured=true，其余 featured=false
  newItems.forEach((item, i) => { item.featured = i === 0; });

  // 已有条目全部取消 featured
  const updatedExisting = existing.map(n => ({ ...n, featured: false }));

  return [...newItems, ...updatedExisting].slice(0, 6);
}

// ─── 4. 更新统计数字 ─────────────────────────────────────

async function fetchGitHubStars() {
  const url = `https://api.github.com/repos/${REPO}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.stargazers_count ?? null;
  } catch {
    return null;
  }
}

// ─── 5. 主流程 ───────────────────────────────────────────

async function main() {
  log('=== OpenClaw Guide 数据更新开始 ===');

  const data = readData();
  let changed = false;

  // — 拉取 GitHub Releases
  const releases = await fetchLatestReleases();

  // — 更新 timeline
  const newTimeline = mergeTimeline(data.timeline, releases);
  if (JSON.stringify(newTimeline) !== JSON.stringify(data.timeline)) {
    data.timeline = newTimeline;
    if (newTimeline.length > 0) {
      data._meta.version = newTimeline[0].version;
    }
    changed = true;
    log('时间线已更新');
  }

  // — 更新 news
  const newNews = mergeNews(data.news, releases);
  if (JSON.stringify(newNews) !== JSON.stringify(data.news)) {
    data.news = newNews;
    changed = true;
    log('动态新闻已更新');
  }

  // — 更新 GitHub Stars
  const stars = await fetchGitHubStars();
  if (stars !== null && stars !== data.stats.githubStars) {
    log(`Stars 更新：${data.stats.githubStars} → ${stars}`);
    data.stats.githubStars = stars;
    changed = true;
  }

  // — 写入
  if (changed) {
    writeData(data);
  } else {
    // 即使内容无变化，也更新时间戳，表示本次检查已执行
    data._meta.lastUpdated = new Date().toISOString();
    writeData(data);
    log('内容无变化，仅更新检查时间戳');
  }

  log('=== 数据更新完成 ===');
}

main().catch(err => {
  console.error('[update] 脚本执行失败:', err);
  process.exit(1);
});
