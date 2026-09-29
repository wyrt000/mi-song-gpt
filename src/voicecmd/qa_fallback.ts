// MIoT 智能音箱插件 - QA 问答接管（mi-song-gpt 新增）
//
// 与上游 songloft-plugin-miot 的差异：原插件在「固定口令 → 语音记忆 → 搜索规则 → AI 播放意图」
// 全部未命中时直接把话语权交还小爱；本模块在该位置插入一层"问答接管"：
//
//   1. 等待/读取小爱对这句话的原生回答（云端对话记录的 content 字段）；
//   2. 回答有效（未命中兜底话术正则）→ 不打扰，让小爱自己的回答播完；
//   3. 回答命中兜底话术或超时无回答 → 打断小爱 → 播"正在思考"占位 →
//      调用问答大模型（可选火山方舟 Responses API 联网搜索）→ TTS 分段播报 → 记录对话历史。
//
// 判定与问答分离：播放意图判定用 ai_config（快而便宜的小模型），问答用 qa_config（强模型）。

/// <reference types="@songloft/plugin-sdk" />

import type { ConfigManager } from '../config/manager';
import type { MinaService } from '../service/service';
import type { AIAnalysisResult, AskMessage, ConversationMessage, QAConfig } from '../types';
import { aiChatCompletionsUrl, aiResponsesUrl, maskUrl } from '../utils/ai_url';

// ===== 类型 =====

export interface QAHandleInput {
  msg: ConversationMessage;
  query: string;
  accountId: string;
  /** AI 播放意图分析结果；null 表示判定器未启用或调用失败 */
  aiResult: AIAnalysisResult | null;
  /** 判定器是否启用 */
  aiEnabled: boolean;
}

export interface QAHandleOutput {
  /** true = QA 已完整接管（或确认交给小爱），engine 不再走默认逻辑 */
  handled: boolean;
  outcome: 'answered_by_xiaoai' | 'answered_by_llm' | 'llm_failed' | 'skipped';
  answer?: string;
  note?: string;
  /** 分阶段耗时（等待小爱原生回答 / 大模型请求），供 UI meta 行展示 */
  elapsed?: { native_ms?: number; llm_ms?: number };
}

export interface QATestResult {
  text: string;
  used_search: boolean;
  elapsed_ms: number;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// ===== 常量 =====

const HISTORY_STORAGE_KEY = 'qa_history';
const DEFAULT_SYSTEM_PROMPT = '你是一个智能音箱助手，请用简洁的口语回答用户的问题，每次回答控制在150字以内，不要使用 markdown、列表和特殊符号。';

/** 每设备最多保留的对话轮数（防御性上限，与前端输入范围一致） */
const HISTORY_MAX_ROUNDS = 20;

/**
 * 小爱"答不上来"的兜底话术正则（移植自 migpt-next 实战配置，并补充音乐场景）：
 * 命中即认为小爱无法回答，由问答大模型接管。
 */
const XIAOAI_ANSWER_FAILURE_RE = new RegExp(
  '(?:我(?:还|暂时|暂不|也)?(?:不知道|不知道咋说|不太清楚|不支持|不会|回答不上)' +
  '|不太清楚|无法(?:回答|理解|获取|处理)|没法回答|回答不了|没听懂' +
  '|不明白.{0,8}(?:说|意思)|换个问题|我还在学习|(?:你|我).{0,4}(?:问住|难住)了' +
  '|被难住了(?:诶|呢|呀|哦)?|暂(?:时)?不支持(?:该|此)?功能|不知道咋说' +
  '|还.{0,4}(?:支持.{0,6}功能|学习)|不如换.{0,6}(?:方式|问题|说)' +
  '|超出.{0,6}(?:能力|范围)|(?:没有|无法)找到.{0,8}(?:答案|结果|内容|歌曲|音乐|歌)' +
  '|(?:暂时|还)回答不)',
  'i',
);

/**
 * 时效性问题正则（hybrid 联网策略）：命中才走联网搜索，避免普通聊天浪费搜索额度。
 * 移植自 migpt-next web-search 的 hybrid 策略（精简版）。
 */
const FRESHNESS_RE = new RegExp(
  '(最新|最近|今天|今日|昨天|昨日|明天|明日|现在|目前|当前|今年|热搜|新闻|天气|气温|降雨|降水' +
  '|台风|地震|股价|股票|基金|汇率|黄金|金价|油价|比分|赛果|排行榜|排名|几点|什么时间|价格|多少钱' +
  '|发布|上映|上线|更新|版本|疫情|限行)',
  'i',
);

/** 判断小爱的原生回答是否属于"答不上来" */
export function isXiaoAIAnswerFailure(text: string): boolean {
  return XIAOAI_ANSWER_FAILURE_RE.test(String(text || ''));
}

// ===== 实现 =====

export class QAFallback {
  private configManager: ConfigManager;
  private minaService: MinaService;
  /** 对话历史缓存：Promise 表示 in-flight 加载（与 ConfigManager 同约定） */
  private historyCache: Promise<Record<string, ChatMessage[]>> | null = null;
  /** 每设备请求序号：新语音到达时旧请求的 TTS 作废，防止抢话 */
  private requestSeq = new Map<string, number>();

  constructor(configManager: ConfigManager, minaService: MinaService) {
    this.configManager = configManager;
    this.minaService = minaService;
  }

  /**
   * 问答接管主入口。engine 在音乐意图（规则/记忆/AI）全部未命中后调用。
   * 返回 handled=false 时 engine 继续原有的 smart-resume 逻辑。
   */
  async handle(input: QAHandleInput): Promise<QAHandleOutput> {
    const cfg = await this.configManager.getQAConfig();
    if (!cfg.enabled || !cfg.api_url.trim() || !cfg.api_key.trim() || !cfg.model.trim()) {
      return { handled: false, outcome: 'skipped', note: 'qa disabled or config incomplete' };
    }

    const { msg, query, accountId } = input;
    const deviceId = msg.device_id;
    const scope = accountId + ':' + deviceId;

    // 触发条件：判定器不可用（未启用/失败/未产生音乐动作），或判定结果为 qa/unknown/低置信。
    // 能走到这里的消息必然没有执行任何音乐操作（engine 保证），所以只需排除
    // "判定器明确给出了可执行的音乐动作但置信度不达标"以外的情形都算 QA 候选——
    // 低置信音乐动作同样先过"小爱原生回答"这道闸，答不上来才由大模型兜底。
    if (input.aiEnabled && input.aiResult) {
      const { action, confidence } = input.aiResult;
      const candidate = action === 'qa' || action === 'unknown' || confidence === 'low';
      if (!candidate) {
        return { handled: false, outcome: 'skipped', note: `not a qa candidate (action=${action}, confidence=${confidence})` };
      }
    }

    // 1) 读取/等待小爱原生回答（计时回传，UI「最近对话记录」meta 行显示）
    const nativeStart = Date.now();
    const native = await this.waitForNativeAnswer(msg, accountId, deviceId, cfg);
    const nativeMs = Date.now() - nativeStart;
    if (native && !isXiaoAIAnswerFailure(native)) {
      songloft.log.info(`[QA] keep native answer: ${native.slice(0, 80)}`);
      return { handled: false, outcome: 'answered_by_xiaoai', answer: native, elapsed: { native_ms: nativeMs } };
    }
    if (native) {
      songloft.log.info(`[QA] native answer hit fallback phrase: ${native.slice(0, 80)}`);
    } else {
      songloft.log.info('[QA] no native answer within wait window, taking over');
    }

    // 2) 大模型接管：打断小爱 → 占位提示 → 请求（可联网）→ TTS
    const seq = (this.requestSeq.get(scope) || 0) + 1;
    this.requestSeq.set(scope, seq);

    try {
      await this.minaService.stopPlay(accountId, deviceId);
    } catch (e) {
      songloft.log.warn(`[QA] failed to interrupt speaker: ${String(e)}`);
    }
    if (cfg.thinking_notice) {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        await this.minaService.textToSpeech(accountId, deviceId, cfg.thinking_notice);
      } catch (e) {
        songloft.log.warn(`[QA] failed to play thinking notice: ${String(e)}`);
      }
    }

    const started = Date.now();
    const useSearch = cfg.web_search_enabled
      && (cfg.web_search_strategy === 'auto' || FRESHNESS_RE.test(query));
    let answer = '';
    let attemptedSearch = false;
    if (useSearch) {
      attemptedSearch = true;
      try {
        answer = await this.callResponsesSearch(cfg, scope, query);
      } catch (e) {
        songloft.log.warn(`[QA] web search failed: ${String(e)}`);
        answer = '';
      }
    }
    if (!answer) {
      try {
        answer = await this.callChatLLM(cfg, scope, query, true);
        if (answer && attemptedSearch && cfg.web_search_fallback_notice) {
          answer = cfg.web_search_fallback_notice + answer;
        }
      } catch (e) {
        songloft.log.warn(`[QA] chat completions failed: ${String(e)}`);
        answer = '';
      }
    }
    const llmMs = Date.now() - started;
    songloft.log.info(`[QA] llm done in ${llmMs}ms search=${attemptedSearch} len=${answer.length}`);

    const elapsed = { native_ms: nativeMs, llm_ms: llmMs };
    if (!answer) {
      return { handled: false, outcome: 'llm_failed', note: 'LLM returned empty, leaving speaker as is', elapsed };
    }
    if ((this.requestSeq.get(scope) || 0) !== seq) {
      songloft.log.info('[QA] request superseded by newer voice input, skip TTS');
      return { handled: true, outcome: 'answered_by_llm', answer, note: 'superseded, TTS skipped', elapsed };
    }

    await this.speakAnswer(accountId, deviceId, answer, cfg);
    await this.appendHistory(scope, query, answer, cfg);

    return { handled: true, outcome: 'answered_by_llm', answer, note: attemptedSearch ? 'web_search' : 'chat', elapsed };
  }

  /**
   * 问答测试（设置页"问答测试"按钮）：不走原生回答检查、不打断音箱、不写历史，
   * 只验证问答链路（含联网搜索降级）并返回文本结果。
   */
  async testQA(query: string): Promise<QATestResult> {
    const cfg = await this.configManager.getQAConfig();
    if (!cfg.api_url.trim() || !cfg.api_key.trim() || !cfg.model.trim()) {
      throw new Error('问答配置不完整，请先填写 API 地址、密钥和模型');
    }
    const q = query.trim();
    const started = Date.now();
    const useSearch = cfg.web_search_enabled
      && (cfg.web_search_strategy === 'auto' || FRESHNESS_RE.test(q));
    let answer = '';
    let usedSearch = false;
    if (useSearch) {
      usedSearch = true;
      try {
        answer = await this.callResponsesSearch(cfg, 'test', q);
      } catch (e) {
        songloft.log.warn(`[QA] test search failed: ${String(e)}`);
        answer = '';
      }
    }
    if (!answer) {
      answer = await this.callChatLLM(cfg, 'test', q, false);
      if (answer && usedSearch && cfg.web_search_fallback_notice) {
        answer = cfg.web_search_fallback_notice + answer;
      }
    }
    return { text: answer, used_search: usedSearch, elapsed_ms: Date.now() - started };
  }

  // ===== 原生回答 =====

  /** 从对话记录里取第一条非空回答文本 */
  private firstAnswerText(ask?: AskMessage | null): string {
    const answers = ask?.response?.answer;
    if (!Array.isArray(answers)) return '';
    for (const a of answers) {
      if (a && typeof a.content === 'string' && a.content.trim()) {
        return a.content.trim();
      }
    }
    return '';
  }

  /**
   * 等待小爱的原生回答。
   * monitor 投递消息时回答可能还没生成（content 为空），按 native_answer_wait_sec
   * 短轮询云端记录直到出现；模拟消息（said_ 端点）没有真实记录，直接跳过。
   */
  private async waitForNativeAnswer(
    msg: ConversationMessage,
    accountId: string,
    deviceId: string,
    cfg: QAConfig,
  ): Promise<string> {
    let current = this.firstAnswerText(msg.message as AskMessage | undefined);
    if (current) return current;

    const waitSec = Math.max(0, Math.min(10, Number(cfg.native_answer_wait_sec) || 0));
    if (waitSec <= 0) return '';
    if (typeof msg.message.request_id === 'string' && msg.message.request_id.startsWith('said_')) {
      return '';
    }

    const targetTs = msg.message.timestamp_ms;
    const deadline = Date.now() + waitSec * 1000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 400));
      let asks: AskMessage[] | null = null;
      try {
        asks = await this.minaService.getLatestAsk(accountId, deviceId, 3);
      } catch {
        asks = null;
      }
      if (asks && asks.length > 0) {
        const text = this.firstAnswerText(asks.find(a => a.timestamp_ms === targetTs));
        if (text) return text;
        // 平台可能重写记录时间戳：退而求其次，取不早于本条的最新有内容记录
        const newer = asks
          .filter(a => a.timestamp_ms >= targetTs)
          .map(a => this.firstAnswerText(a))
          .find(t => !!t);
        if (newer) return newer;
      }
    }
    return '';
  }

  // ===== LLM =====

  /** 组装消息数组：system + 历史 + 当前提问 */
  private async buildMessages(cfg: QAConfig, scope: string, query: string, withHistory: boolean): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    const system = (cfg.system_prompt || DEFAULT_SYSTEM_PROMPT).trim();
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    if (withHistory && cfg.history_max_length > 0) {
      const history = await this.getHistory(scope, cfg);
      messages.push(...history);
    }
    messages.push({ role: 'user', content: query });
    return messages;
  }

  /** 普通对话：POST /chat/completions（非流式） */
  private async callChatLLM(cfg: QAConfig, scope: string, query: string, withHistory: boolean): Promise<string> {
    const messages = await this.buildMessages(cfg, scope, query, withHistory);
    const endpoint = aiChatCompletionsUrl(cfg.api_url);
    songloft.log.info(`[QA] chat → ${maskUrl(endpoint)} model=${cfg.model} msgs=${messages.length}`);
    const body = {
      model: cfg.model,
      messages,
      temperature: 0.7,
      max_tokens: 600,
      stream: false,
    };
    const data = await this.postJSON(endpoint, body, cfg.api_key, cfg.timeout);
    const content = data?.choices?.[0]?.message?.content;
    const cleaned = QAFallback.sanitizeForTTS(typeof content === 'string' ? content : '');
    if (!cleaned) {
      throw new Error('empty answer');
    }
    return cleaned;
  }

  /**
   * 联网对话：POST /responses + web_search 工具（火山方舟需在控制台开通"联网搜索"插件）。
   * 失败抛异常，由调用方降级为普通对话。
   */
  private async callResponsesSearch(cfg: QAConfig, scope: string, query: string): Promise<string> {
    const messages = await this.buildMessages(cfg, scope, query, true);
    const endpoint = aiResponsesUrl(cfg.api_url);
    if (!endpoint) {
      throw new Error('invalid api_url');
    }
    songloft.log.info(`[QA] responses(web_search) → ${maskUrl(endpoint)} model=${cfg.model}`);
    const body = {
      model: cfg.model,
      input: messages,
      tools: [{ type: 'web_search' }],
      stream: false,
    };
    const data = await this.postJSON(endpoint, body, cfg.api_key, cfg.timeout);
    let text = '';
    const output = data?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item && item.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part && part.type === 'output_text' && typeof part.text === 'string') {
              text += part.text;
            }
          }
        }
      }
    }
    if (!text && typeof data?.output_text === 'string') {
      text = data.output_text;
    }
    const cleaned = QAFallback.sanitizeForTTS(text);
    if (!cleaned) {
      throw new Error('empty search answer');
    }
    return cleaned;
  }

  /** 带 JSON 解析与超时的 POST */
  private async postJSON(endpoint: string, body: unknown, apiKey: string, timeoutSec: number): Promise<any> {
    const fetchPromise = fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('QA API call timed out')), Math.max(1, timeoutSec) * 1000);
    });
    const resp = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    if (!resp || typeof resp.ok !== 'boolean' || typeof resp.status !== 'number') {
      throw new Error('invalid response object');
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`API error ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  }

  // ===== 文本处理 =====

  /** 清洗 LLM 输出为可朗读文本：剥离思维链、markdown 链接/URL/引用角标/符号 */
  static sanitizeForTTS(text: string): string {
    return String(text || '')
      .replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '')
      .replace(/\[([^\]]{1,40})\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[\d{1,3}\]/g, '')
      .replace(/[*_#`>~|]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * 按句切分长回答（音箱 TTS 对单段长度有限制）。
   * 刻意不用正则后行断言（QuickJS 沙盒兼容性），手工扫描切分。
   */
  static splitForTTS(text: string, maxLen: number): string[] {
    const t = String(text || '').trim();
    if (!t) return [];
    const limit = Math.max(0, Number(maxLen) || 0);
    if (limit <= 0 || t.length <= limit) return [t];

    const sentences: string[] = [];
    let start = 0;
    for (let i = 0; i < t.length; i++) {
      if ('。！？!?；;\n'.indexOf(t[i]) !== -1) {
        sentences.push(t.slice(start, i + 1));
        start = i + 1;
      }
    }
    if (start < t.length) sentences.push(t.slice(start));

    const chunks: string[] = [];
    let buf = '';
    for (const raw of sentences) {
      const piece = raw.trim();
      if (!piece) continue;
      if (piece.length > limit) {
        if (buf) {
          chunks.push(buf);
          buf = '';
        }
        for (let i = 0; i < piece.length; i += limit) {
          chunks.push(piece.slice(i, i + limit));
        }
        continue;
      }
      if ((buf + piece).length > limit) {
        chunks.push(buf);
        buf = piece;
      } else {
        buf = buf ? buf + piece : piece;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.length > 0 ? chunks : [t];
  }

  /** 分段 TTS 播报 */
  private async speakAnswer(accountId: string, deviceId: string, text: string, cfg: QAConfig): Promise<void> {
    const segments = QAFallback.splitForTTS(text, cfg.max_reply_length);
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      try {
        const ok = await this.minaService.textToSpeech(accountId, deviceId, segments[i]);
        if (!ok) {
          songloft.log.warn(`[QA] TTS segment ${i + 1}/${segments.length} failed`);
        }
      } catch (e) {
        songloft.log.warn(`[QA] TTS segment ${i + 1}/${segments.length} error: ${String(e)}`);
      }
    }
  }

  // ===== 对话历史 =====

  private async loadHistory(): Promise<Record<string, ChatMessage[]>> {
    if (this.historyCache === null) {
      let raw: string | null = null;
      try {
        raw = (await songloft.storage.get(HISTORY_STORAGE_KEY)) as string | null;
      } catch {
        raw = null;
      }
      let parsed: Record<string, ChatMessage[]> = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
        } catch {
          parsed = {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        parsed = {};
      }
      this.historyCache = Promise.resolve(parsed);
    }
    return this.historyCache;
  }

  private historyLimit(cfg: QAConfig): number {
    return Math.max(0, Math.min(HISTORY_MAX_ROUNDS, Number(cfg.history_max_length) || 0)) * 2;
  }

  private async getHistory(scope: string, cfg: QAConfig): Promise<ChatMessage[]> {
    const all = await this.loadHistory();
    const list = all[scope];
    if (!Array.isArray(list) || list.length === 0) return [];
    const max = this.historyLimit(cfg);
    return max > 0 ? list.slice(-max) : [];
  }

  private async appendHistory(scope: string, query: string, answer: string, cfg: QAConfig): Promise<void> {
    const max = this.historyLimit(cfg);
    if (max <= 0) return;
    const all = await this.loadHistory();
    const list = Array.isArray(all[scope]) ? all[scope] : [];
    list.push({ role: 'user', content: query }, { role: 'assistant', content: answer });
    all[scope] = list.slice(-max);
    this.historyCache = Promise.resolve(all);
    try {
      await songloft.storage.set(HISTORY_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      songloft.log.warn(`[QA] failed to persist history: ${String(e)}`);
    }
  }
}