export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
  expired?: boolean;
  warning?: string;
}

export interface AIConfig {
  enabled?: boolean;
  api_url?: string;
  api_key?: string;
  model?: string;
  timeout?: number;
}

/** 问答接管配置（mi-song-gpt）：语义判定用 ai_config（小模型），问答用 qa_config（强模型+联网） */
export interface QAConfig {
  enabled?: boolean;
  api_url?: string;
  api_key?: string;
  model?: string;
  timeout?: number;
  system_prompt?: string;
  history_max_length?: number;
  thinking_notice?: string;
  native_answer_wait_sec?: number;
  web_search_enabled?: boolean;
  web_search_strategy?: 'auto' | 'hybrid';
  web_search_fallback_notice?: string;
  max_reply_length?: number;
}

export interface MiotConfig {
  server_host: string;
  server_host_status: 'empty' | 'loopback' | 'ok';
  suggested_addresses: string[];
  conversation_monitor_enabled: boolean;
  conversation_poll_interval: number;
  debug_log_enabled: boolean;
  voice_command_enabled: boolean;
  voice_memory_enabled: boolean;
  voice_memory_max_records: number;
  scheduled_tasks_enabled: boolean;
  timezone: string;
  force_mp3: boolean;
  radio_force_mp3: boolean;
  volume_normalize: boolean;
  song_transition_offset: number;
  max_song_index: number;
  external_search_enabled: boolean;
  external_search_url: string;
  external_search_token: string;
  external_search_sources: SearchSource[];
  external_search_playlist_id: string;
  external_search_timeout: number;
  external_search_no_import: boolean;
  search_priority: 'parallel' | 'local_first' | 'external_first';
  music_api_model_disabled: string[];
  music_api_model_defaults: string[];
  indicator_light_enabled: boolean;
  interrupt_tts_hint_enabled: boolean;
  interrupt_tts_hint_text: string;
  play_announcement_enabled: boolean;
  play_announcement_template: string;
  play_announcement_wait_mode: string;
  play_announcement_delay: number;
  play_announcement_scope: string;
  smart_resume_timeout: number;
  default_cover_id: string | number;
  touchscreen_lyrics_enabled: boolean;
  ai_config: AIConfig;
  qa_config: QAConfig;
}

export interface SearchSource {
  id: string;
  name: string;
  url: string;
  token: string;
  enabled: boolean;
}

export interface SearchProvider {
  id?: string;
  entry_path?: string;
  entryPath?: string;
  name: string;
  url?: string;
  installed?: boolean;
  active?: boolean;
  search_path?: string;
  searchPath?: string;
  icon?: string;
}

export interface Account {
  id: string;
  account: string;
  account_name?: string;
  name?: string;
  user_id?: string;
  status?: string;
  logged_in?: boolean;
  is_valid?: boolean;
  login_method?: string;
}

export interface Device {
  device_id?: string;
  id?: string;
  name: string;
  alias?: string;
  model?: string;
  hardware?: string;
  managed?: boolean;
  online?: boolean;
  presence?: string;
  deviceID?: string;
}

export interface AccountDevices {
  account_id: string;
  account_name?: string;
  devices: Device[];
  last_selected_device_id?: string;
}

export interface DeviceMember {
  account_id: string;
  device_id: string;
}

export interface DeviceGroup {
  id: string;
  name: string;
  members: DeviceMember[];
  created_at?: string;
  updated_at?: string;
}

export interface Playlist {
  id: number;
  name: string;
  song_count?: number;
  type?: string;
  sort_by?: string;
  sort_order?: string;
}

export interface Song {
  id: number;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  cover_url?: string;
  lyric_url?: string;
  is_live?: boolean;
}

/** 某台设备在某个歌单上次播到哪一首（后端 GET /playlists/:id/progress） */
export interface PlaylistProgress {
  playlist_id: number;
  song_id: number;
  song_index: number;
  position_sec: number;
  updated_at: number;
}

export type PlayMode = 'order' | 'single' | 'random' | 'loop' | 'singlePlay';

export interface PlayerStatus {
  state?: string;
  is_playing?: boolean;
  position?: number;
  duration?: number;
  volume?: number;
  play_mode?: PlayMode;
  playlist_id?: number;
  playlist_name?: string;
  current_index?: number;
  current_song?: Song | null;
  device_online?: boolean;
  speed?: number;
}

export interface SleepTimerStatus {
  active: boolean;
  mode: 'time' | 'songs';
  /** time 模式为毫秒，songs 模式为歌曲数。 */
  remaining: number;
  total: number;
}

export interface ConversationMessage {
  id?: string;
  timestamp?: number | string;
  account_id?: string;
  device_id?: string;
  device_name?: string;
  query?: string;
  text?: string;
  answer?: string;
  /** 语音引擎处理来源：rule=口令 memory=记忆 search=搜索 ai=AI播放 xiaoai=小爱原生 llm=大模型接管 */
  outcome?: string;
  /** 来源补充说明（命中口令/AI 动作等） */
  outcome_detail?: string;
  /** 判定反馈与分阶段耗时（meta 行）：只有新产生的记录才有，历史记录缺省 */
  outcome_meta?: OutcomeMeta;
}

/** 单个处理阶段的耗时 */
export interface OutcomeStage {
  key: string;
  label: string;
  ms: number;
}

/** 语音引擎的判定反馈与耗时明细 */
export interface OutcomeMeta {
  /** 语义判定结果（判定器启用时无论是否执行都会带上） */
  ai?: { action: string; confidence: string; params?: unknown };
  /** 分阶段耗时（按发生顺序） */
  stages?: OutcomeStage[];
  /** 处理总耗时 */
  total_ms: number;
  /** 是否真正执行了动作或完成接管 */
  executed?: boolean;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
}

export interface VoiceCommand {
  id?: string;
  type: string;
  patterns?: string[];
  pattern?: string;
  param?: string;
  enabled?: boolean;
  keywords?: string[];
}

export interface IndexStatus {
  ready?: boolean;
  is_ready?: boolean;
  refreshing?: boolean;
  song_count?: number;
  playlist_count?: number;
  message?: string;
  error?: string;
}

export interface MemoryStats {
  entityCount?: number;
  queryCount?: number;
  hitCount?: number;
  savedAiCalls?: number;
  [key: string]: unknown;
}

export interface MemoryEntity {
  canonicalKey?: string;
  canonical_key?: string;
  songName?: string;
  artist?: string;
  aliases?: Array<{ id?: string; query?: string; alias?: string }>;
  records?: Array<{ id: string; query?: string }>;
}

export type ScheduleType = 'daily' | 'weekly' | 'monthly';

export interface ScheduledTask {
  id?: string;
  name: string;
  enabled: boolean;
  action: string;
  schedule: {
    type: ScheduleType;
    time: string;
    weekdays?: number[];
    monthdays?: number[];
    holiday_mode?: string;
  };
  target: {
    all_managed?: boolean;
    all?: boolean;
    devices?: DeviceMember[];
  };
  params: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleLog {
  id?: string;
  task_id?: string;
  task_name?: string;
  success?: boolean;
  message?: string;
  timestamp?: number | string;
}

export interface LoginChallenge {
  need_captcha?: boolean;
  captcha_url?: string;
  need_verify?: boolean;
  verify_url?: string;
  notification_url?: string;
  session_id?: string;
  poll_session_id?: string;
  qrcode_url?: string;
  qr_url?: string;
  image?: string;
  status?: string;
  account?: Account;
  message?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  /**
   * `searchable` 下拉的匹配文本，缺省时回退 `label`。
   *
   * 歌单的 label 是 `playlistLabel()` 产出的「名称 (歌曲数)」，直接拿它匹配会让
   * 输入 `2` 命中所有歌曲数含 2 的歌单。旧版原生前端匹配的是纯名称
   * （`.playlist-select-item-name` 的 textContent），这里靠该字段还原。
   */
  searchText?: string;
}
