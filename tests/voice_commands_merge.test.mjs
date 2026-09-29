import assert from 'node:assert/strict';
import { getDefaultVoiceCommands } from '../src/voicecmd/defaults.ts';

globalThis.songloft = {
  log: { info: () => {}, warn: () => {}, error: () => {} },
};

// 模拟 ConfigManager.getVoiceCommands 里的合并逻辑
function mergeWithDefaults(commands) {
  if (commands.length === 0) return getDefaultVoiceCommands();
  const defaults = getDefaultVoiceCommands();
  const seen = new Set(commands.map(c => `${c.type}::${c.param ?? ''}`));
  const missing = defaults.filter(d => !seen.has(`${d.type}::${d.param ?? ''}`));
  return missing.length > 0 ? [...commands, ...missing] : commands;
}

// 场景 1：老配置里没有 play_index，应被补齐
{
  const old = [
    { type: 'play_playlist', keywords: ['播放歌单'], enabled: true },
    { type: 'play_song', keywords: ['播放歌曲'], enabled: true },
    { type: 'stop', keywords: ['停止'], enabled: true },
  ];
  const merged = mergeWithDefaults(old);
  const playIndex = merged.find(c => c.type === 'play_index');
  assert.ok(playIndex, 'play_index should be appended');
  assert.ok(playIndex.keywords.includes('播放第'));
  // 老配置在前，新条目在末尾追加，不影响原顺序
  assert.equal(merged[0].type, 'play_playlist');
  assert.equal(merged[1].type, 'play_song');
  assert.equal(merged[2].type, 'stop');
}

// 场景 2：老配置已经含 play_index（例如用户改过关键词），不应重复添加
{
  const old = getDefaultVoiceCommands().map(c => ({ ...c }));
  const customIdx = old.findIndex(c => c.type === 'play_index');
  old[customIdx] = { ...old[customIdx], keywords: ['我的自定义'], enabled: false };
  const merged = mergeWithDefaults(old);
  const playIndexEntries = merged.filter(c => c.type === 'play_index');
  assert.equal(playIndexEntries.length, 1, 'no duplicate play_index');
  assert.deepEqual(playIndexEntries[0].keywords, ['我的自定义']);
  assert.equal(playIndexEntries[0].enabled, false);
}

// 场景 3：set_play_mode 多 param 条目必须按 param 区分，用户禁用了一条不能把其他条丢掉
{
  const old = [
    { type: 'set_play_mode', keywords: ['随机'], param: 'random', enabled: false },
  ];
  const merged = mergeWithDefaults(old);
  const modes = merged.filter(c => c.type === 'set_play_mode');
  const params = modes.map(m => m.param).sort();
  // 默认包含 random/single/singlePlay/loop/order 五个，用户已有 random，另外四个应被补齐
  assert.deepEqual(params.sort(), ['loop', 'order', 'random', 'single', 'singlePlay']);
  // 用户的 random 保留原样（enabled=false）
  const userRandom = modes.find(m => m.param === 'random');
  assert.equal(userRandom.enabled, false);
  assert.deepEqual(userRandom.keywords, ['随机']);
}

// 场景 4：空配置回退到完整默认列表
{
  const merged = mergeWithDefaults([]);
  const defaults = getDefaultVoiceCommands();
  assert.equal(merged.length, defaults.length);
}

console.log('All voice_commands merge tests passed!');
