import assert from 'node:assert/strict';
import { isXiaoAIAnswerFailure, QAFallback } from '../src/voicecmd/qa_fallback.ts';

// Global songloft stub for logging in tests
globalThis.songloft = {
  log: { info: () => {}, warn: () => {}, error: () => {} },
  storage: { get: async () => null, set: async () => {} },
};

// ===== isXiaoAIAnswerFailure：小爱兜底话术 =====

const failures = [
  '我不知道',
  '我还在学习中',
  '这个问题把我问住了',
  '被难住了诶',
  '没听懂你说的话',
  '暂时不支持该功能',
  '没有找到歌曲',
  '无法找到相关内容',
  '换个问题试试吧',
  '我还不支持这个功能',
  '回答不了',
  '不太清楚',
];
for (const t of failures) {
  assert.equal(isXiaoAIAnswerFailure(t), true, `应当判为失败话术: ${t}`);
}

const valid = [
  '好的，为你播放周杰伦的晴天',
  '北京今天晴，气温25度',
  '已将音量调到50',
  '嗯',
  '在的',
];
for (const t of valid) {
  assert.equal(isXiaoAIAnswerFailure(t), false, `不应当判为失败话术: ${t}`);
}

// ===== splitForTTS：分段 =====

assert.deepEqual(QAFallback.splitForTTS('你好世界', 100), ['你好世界']);
assert.deepEqual(QAFallback.splitForTTS('很长'.repeat(300), 0).length, 1);

{
  const long = '第一句话。第二句话！第三句话？这是一段没有句号的很长很长很长的内容';
  const parts = QAFallback.splitForTTS(long, 10);
  assert.ok(parts.length > 1, '应当被切分');
  for (const p of parts) {
    assert.ok(p.length <= 10, `分段超长: ${p} (${p.length})`);
  }
}

{
  const parts = QAFallback.splitForTTS('啊'.repeat(35), 10);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.map(p => p.length), [10, 10, 10, 5]);
}

// ===== sanitizeForTTS：清洗 =====

assert.equal(
  QAFallback.sanitizeForTTS('详情见[官网](https://example.com)或 https://a.b/c 引用[1] *重点* #标题#'),
  '详情见官网或 引用 重点 标题',
);

assert.equal(QAFallback.sanitizeForTTS('<think>推理过程</think>答案'), '答案');

console.log('All qa_fallback static tests passed!');