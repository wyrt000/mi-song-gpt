import type { ApiEnvelope } from './types';

// 反代 BASE_PATH 子路径部署下，硬编码的绝对路径（以 "/" 开头）会绕过 BASE_PATH 直接
// 打到域名根——这类绝对路径不受 <base href> 影响（WebF 下 <base href> 本身也完全不
// 生效，见 docs/webf/upstream-issues.md #2，不能依赖它，document.baseURI 同样不存在）。
// 从当前页面路径里找出插件路由段之前的部分即为 BASE_PATH 前缀（songloft-org/songloft#407）。
// vite dev 环境路径不含该段，天然回退为空前缀，与原先硬编码绝对路径的行为一致。
export function hostPathPrefix(): string {
  const match = window.location.pathname.match(/^(.*)\/api\/v1\/jsplugin\/[^/]+/);
  return match ? match[1] : '';
}

function pluginBase(): string {
  return `${hostPathPrefix()}/api/v1/jsplugin/miot`;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

function pluginApi() {
  return window.SongloftPlugin;
}

async function browserRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = pluginApi()?.getAuthToken?.();
  const response = await fetch(`${pluginBase()}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return decodePayload<T>(payload, response.status, response.ok);
}

async function browserEnvelope<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = pluginApi()?.getAuthToken?.();
  const response = await fetch(`${pluginBase()}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as { success?: boolean; error?: string } & T;
  if (!response.ok || payload.success !== true) {
    throw new ApiError(payload.error || `请求失败 (${response.status})`, response.status);
  }
  return payload;
}

export function unwrap<T>(value: unknown): T {
  return decodePayload<T>(value, 0, true);
}

/** 宿主 writeJSONError 的体是 {error, detail}（无 success 字段）：detail 是底层原因，必须带上 */
function withDetail(message: string, payload: unknown): string {
  const detail = (payload as { detail?: string } | null)?.detail;
  return detail && detail !== message ? `${message} — ${detail}` : message;
}

function decodePayload<T>(value: unknown, status: number, ok: boolean): T {
  const payload = value as Partial<ApiEnvelope<T>> | null;
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === true) {
      return payload.data as T;
    }
    throw new ApiError(withDetail(payload.error || '请求失败，请稍后重试', payload), status);
  }
  if (!ok) {
    const detail = (payload as { error?: string; message?: string } | null)?.error
      || (payload as { error?: string; message?: string } | null)?.message
      || `请求失败 (${status})`;
    throw new ApiError(withDetail(detail, payload), status);
  }
  return value as T;
}

export async function get<T>(path: string): Promise<T> {
  const api = pluginApi();
  if (api?.apiGet) return decodePayload<T>(await api.apiGet(path), 0, true);
  return browserRequest<T>('GET', path);
}

export async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const api = pluginApi();
  if (api?.apiPost) return decodePayload<T>(await api.apiPost(path, body), 0, true);
  return browserRequest<T>('POST', path, body);
}

/**
 * POST，带 `X-Plugin-Timeout-Ms`（宿主 v2.11.0+ 放宽插件调用超时到 [30s, 300s]，
 * 旧宿主会忽略该头并保持 30s 默认）。慢端点（问答测试这类要跑两次上游 LLM 调用的）用。
 * 错误消息附带宿主返回的 detail（如 "scheduler: call timeout"），不再只有通用文案。
 */
export async function postLong<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const token = pluginApi()?.getAuthToken?.();
  const clamped = Math.max(30000, Math.min(300000, Math.round(timeoutMs)));
  const response = await fetch(`${pluginBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Plugin-Timeout-Ms': String(clamped),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return decodePayload<T>(payload, response.status, response.ok);
}

export async function postEnvelope<T>(path: string, body: unknown = {}): Promise<T> {
  const api = pluginApi();
  if (api?.apiPost) {
    const payload = (await api.apiPost(path, body)) as { success?: boolean; error?: string } & T;
    if (!payload || payload.success !== true) {
      throw new ApiError(payload?.error || '请求失败，请稍后重试');
    }
    return payload;
  }
  return browserEnvelope<T>('POST', path, body);
}

export async function del<T>(path: string): Promise<T> {
  const api = pluginApi();
  if (api?.apiDelete) return decodePayload<T>(await api.apiDelete(path), 0, true);
  return browserRequest<T>('DELETE', path);
}

export function query(params: Record<string, string | number | boolean | undefined>): string {
  const values: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      values.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return values.length ? `?${values.join('&')}` : '';
}

export function pluginWebSocketUrl(path: string): string {
  const location = window.location;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = pluginApi()?.getAuthToken?.() || '';
  return `${protocol}//${location.host}${pluginBase()}${path}${
    path.includes('?') ? '&' : '?'
  }${token ? `access_token=${encodeURIComponent(token)}` : ''}`;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}
