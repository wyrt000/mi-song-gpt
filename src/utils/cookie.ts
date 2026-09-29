// MIoT 智能音箱插件 - Cookie 管理工具
//
// 本文件原先是一份自带的 CookieJar 实现（约 330 行）。该实现已上游到
// @songloft/plugin-sdk（见 songloft-org/songloft#401），此处只保留再导出，
// 避免同一套逻辑在多个插件里各存一份、各自漂移。
//
// 保留这个文件而不是让调用方直接 import SDK：src/{mina,qrcode}/ 下有 4 处
// `from '../utils/cookie'`，保持导入路径不变可以把本次改动限制在 utils/ 内。
//
// 注意 CookieJar 只是本地存储：宿主的 fetch 不会自动带 Cookie，
// 请求前仍需自行 getCookieHeader(url) 塞进请求头（见 utils/http.ts）。

export { CookieJar, parseSetCookie, buildCookieHeader } from '@songloft/plugin-sdk';
export type { Cookie } from '@songloft/plugin-sdk';
