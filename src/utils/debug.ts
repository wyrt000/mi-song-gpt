// MIoT 智能音箱插件 - 调试日志开关
//
// 会话监听默认每秒轮询、推流路径也会打诊断日志，若这些 info 日志无条件打印
// 会构造模板字符串并跨 __go_console 桥，纯浪费且刷屏。用一个同步可读的布尔缓存
// 门控这些日志：热路径上不能每次 await 读配置，因此由配置加载/更新时通过
// setDebugLog 写入本模块的缓存，热路径用 isDebugLog() 同步读取。
//
// 对应设置项 PluginConfig.debug_log_enabled（默认 false）。
// 历史上叫 conversation_poll_debug（只门控会话轮询），随排障需要扩展到推流路径，
// 更名为通用的「调试日志」开关；旧配置由 ConfigManager.getConfig 迁移一次。

let _debugLog = false;

/** 热路径同步读取当前调试日志开关。 */
export function isDebugLog(): boolean {
  return _debugLog;
}

/** 由配置加载/更新时调用，更新缓存的开关值。 */
export function setDebugLog(enabled: boolean): void {
  _debugLog = !!enabled;
}
