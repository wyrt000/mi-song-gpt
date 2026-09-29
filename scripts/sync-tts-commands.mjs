#!/usr/bin/env node
// 从 miot-spec 同步智能音箱的 TTS command,合并进 src/data/tts-commands.json。
//
// TTS command 本质:设备 spec 里 `intelligent-speaker` 服务下 `play-text`
// (文字转语音) action 的 "<服务iid>-<action iid>"。本脚本:
//   1. 从搜索页 https://home.miot-spec.com/s/xiaomi.wifispeaker 拉全部音箱型号;
//   2. 逐个取 /spec/<model> 页内嵌的 spec,推导出 play-text 的 siid-aiid;
//   3. 与现有 tts-commands.json **合并**——策展数据优先,只增不覆盖:
//        · 新型号        → 追加
//        · 已存在且一致  → 保留
//        · 已存在但不同  → 保留旧值,打印 ⚠ 冲突让人工裁决
//        · 仅本地有(如别名 ASX4B / 已下架型号) → 保留
//   4. 写回排序后的 JSON,并打印同步报告 + issue #28 用的 markdown 表格。
//
// 与 fetch-holidays.mjs 不同:TTS 是经人工/社区确认的策展数据,**不挂在 prebuild**,
// 仅按需 `npm run sync:tts` 手动执行,产物需人工 review 后入库。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = join(ROOT, 'src', 'data', 'tts-commands.json');

const HOST = 'https://home.miot-spec.com';
const SEARCH_PREFIX = 'xiaomi.wifispeaker'; // 智能音箱品类前缀
const CONCURRENCY = 6;
const TIMEOUT_MS = 20000;
const RETRIES = 3;
const UA = 'songloft-plugin-miot/sync-tts (+https://github.com/songloft-org/songloft-plugin-miot)';

/** 带超时 + 重试的文本抓取 */
async function fetchText(url) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': UA } });
      clearTimeout(timer);
      if (res.status === 404) return { notFound: true, text: '' };
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return { notFound: false, text: await res.text() };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
}

/** 解析 Inertia 页面内嵌的 <script type="application/json"> → props */
function parseInertiaProps(htmlText) {
  const m = htmlText.match(/type="application\/json">(\{[\s\S]*?\})<\/script>/);
  if (!m) throw new Error('未找到内嵌 Inertia JSON');
  let json = m[1];
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    // 极少数字段可能被 HTML 实体转义,兜底解码后重试
    json = json
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    obj = JSON.parse(json);
  }
  if (!obj || !obj.props) throw new Error('Inertia JSON 缺少 props');
  return obj.props;
}

/** 发现全部音箱型号(跟随分页),返回 [{ model, name }] */
async function discoverSpeakers() {
  const out = [];
  let url = `${HOST}/s/${SEARCH_PREFIX}?page=1`;
  const seenPages = new Set();
  while (url && !seenPages.has(url)) {
    seenPages.add(url);
    const { text } = await fetchText(url);
    const props = parseInertiaProps(text);
    const results = props.results || {};
    for (const d of results.data || []) {
      if (typeof d.model === 'string' && d.model.startsWith(SEARCH_PREFIX + '.')) {
        out.push({ model: d.model, name: d.name || '' });
      }
    }
    url = results.next_page_url || null;
  }
  return out;
}

/** model → hardware(型号后缀大写),如 xiaomi.wifispeaker.oh11 → OH11 */
function hardwareOf(model) {
  return model.split('.').pop().toUpperCase();
}

/**
 * 取 spec 节点的规范名:完整 URN(urn:miot-spec-v2:service:intelligent-speaker:...)取第 4 段,
 * home.miot-spec.com 的 tree 直接用短名(intelligent-speaker / play-text)则原样返回。
 */
function specName(type) {
  const t = String(type || '');
  return t.includes(':') ? t.split(':')[3] || '' : t;
}

/** 从 spec 的 services 里找 intelligent-speaker/play-text 的 "siid-aiid",找不到返回 null */
function extractCommand(services) {
  for (const s of services || []) {
    if (specName(s.type) !== 'intelligent-speaker') continue;
    for (const a of s.actions || []) {
      if (specName(a.type) === 'play-text') return `${s.iid}-${a.iid}`;
    }
  }
  return null;
}

/** 取单个型号的 TTS command(通过 /spec/<model> 页),失败/无该能力返回 null */
async function deriveCommand(model) {
  const { notFound, text } = await fetchText(`${HOST}/spec/${model}`);
  if (notFound) return null;
  const props = parseInertiaProps(text);
  const services = (props.tree && props.tree.services) || (props.spec && props.spec.services) || [];
  return extractCommand(services);
}

/** 简单并发池 */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadExisting() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    console.error(`[sync-tts] 读取现有配置失败: ${e.message}`);
    return {};
  }
}

function writeSorted(map) {
  const sorted = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  writeFileSync(CONFIG_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

async function main() {
  console.log(`[sync-tts] 发现音箱型号: ${HOST}/s/${SEARCH_PREFIX}`);
  const speakers = await discoverSpeakers();
  console.log(`[sync-tts] 共 ${speakers.length} 个型号,逐个解析 spec…`);

  const derived = await mapPool(speakers, CONCURRENCY, async (sp) => {
    try {
      const command = await deriveCommand(sp.model);
      return { ...sp, hardware: hardwareOf(sp.model), command };
    } catch (e) {
      return { ...sp, hardware: hardwareOf(sp.model), command: null, error: e.message };
    }
  });

  const existing = loadExisting();
  const merged = { ...existing };

  const added = [], same = [], conflicts = [], noTTS = [], errored = [];
  for (const d of derived) {
    if (d.error) { errored.push(d); continue; }
    if (!d.command) { noTTS.push(d); continue; }
    const cur = existing[d.hardware];
    if (cur === undefined) { merged[d.hardware] = d.command; added.push(d); }
    else if (cur === d.command) { same.push(d); }
    else { conflicts.push({ ...d, existing: cur }); } // 保留旧值,不覆盖
  }
  // 仅本地有、网站无对应(如别名 ASX4B、已下架型号)
  const derivedHw = new Set(derived.map((d) => d.hardware));
  const localOnly = Object.keys(existing).filter((hw) => !derivedHw.has(hw));

  writeSorted(merged);

  // ---------- 报告 ----------
  const nameByHw = new Map(derived.map((d) => [d.hardware, d.name]));
  console.log('\n================ 同步报告 ================');
  console.log(`新增 ${added.length} · 一致 ${same.length} · 冲突 ${conflicts.length} · 无TTS ${noTTS.length} · 仅本地 ${localOnly.length} · 抓取失败 ${errored.length}`);
  if (added.length) {
    console.log('\n🆕 新增:');
    for (const d of added.sort((a, b) => a.hardware.localeCompare(b.hardware)))
      console.log(`   ${d.hardware.padEnd(8)} ${d.command.padEnd(6)} ${d.name}`);
  }
  if (conflicts.length) {
    console.log('\n⚠️  冲突(保留了本地旧值,请人工确认):');
    for (const d of conflicts)
      console.log(`   ${d.hardware.padEnd(8)} 本地=${d.existing}  网站=${d.command}  ${d.name}`);
  }
  if (localOnly.length) console.log(`\nℹ️  仅本地保留(网站列表无对应): ${localOnly.join(', ')}`);
  if (errored.length) {
    console.log('\n❌ 抓取失败(未纳入本次合并):');
    for (const d of errored) console.log(`   ${d.model} → ${d.error}`);
  }

  // ---------- issue #28 markdown 表格 ----------
  // 覆盖当前 config 里的全部型号(含新增),按 hardware 排序
  const finalMap = loadExisting();
  const rows = Object.keys(finalMap).sort().map((hw) => {
    const isNew = added.some((a) => a.hardware === hw);
    return `| ${hw} | ${finalMap[hw]} | ${nameByHw.get(hw) || ''} |${isNew ? ' 🆕' : ''}`;
  });
  console.log('\n================ issue #28 表格(复制用) ================');
  console.log('| hardware | ttsCommand | 设备名称 |');
  console.log('| --- | --- | --- |');
  console.log(rows.join('\n'));
  console.log('\n[sync-tts] 完成。请 review `git diff src/data/tts-commands.json` 后提交。');
}

main().catch((e) => {
  console.error('[sync-tts] 失败:', e);
  process.exitCode = 1;
});
