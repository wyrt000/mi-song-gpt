export type MemoryTargetType = 'play_song' | 'play_playlist';

export const DEFAULT_MEMORY_MAX_RECORDS = 100;
export const MIN_MEMORY_MAX_RECORDS = 10;
// 上限仅约束「自动学习」记录；手动别名（manualAlias）由用户显式维护，
// 不计数也不参与淘汰，因此不受此上限影响（见 enforceLimit）。
export const MAX_MEMORY_MAX_RECORDS = 5000;

export function normalizeMemoryMaxRecords(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MEMORY_MAX_RECORDS;
  return Math.max(MIN_MEMORY_MAX_RECORDS, Math.min(MAX_MEMORY_MAX_RECORDS, Math.round(parsed)));
}

export interface MemoryRecord {
  id: string;
  query?: string;
  normalizedQuery: string;
  type: MemoryTargetType;
  songId?: number;
  songName?: string;
  artist?: string;
  playlistId?: number;
  playlistName?: string;
  songIndex?: number;
  hitCount: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  recordVersion?: 2;
  canonicalKey?: string;
  manualAlias?: boolean;
  aliasSource?: 'auto' | 'manual';
  memoryHitCount?: number;
  savedAiCalls?: number;
  lastHitReason?: string;
}

export interface MemoryRecordInput {
  query: string;
  type: MemoryTargetType;
  songId?: number;
  songName?: string;
  artist?: string;
  playlistId?: number;
  playlistName?: string;
  songIndex?: number;
  matchedRecordId?: string;
  memoryHitReason?: string;
}

export interface MemoryResolveCandidate {
  canonicalKey: string;
  songName: string;
  artist: string;
}

export interface MemoryAmbiguityRecord {
  query: string;
  normalizedQuery: string;
  reason: string;
  candidateCount: number;
  candidates: MemoryResolveCandidate[];
  lastSeenAt: string;
  occurrenceCount: number;
}

export interface MemoryAliasView {
  id: string;
  query: string;
  normalizedQuery: string;
  manualAlias: boolean;
  aliasSource: 'auto' | 'manual';
  hitCount: number;
  localHitCount: number;
  lastUsedAt: string;
  updatedAt: string;
}

export interface MemoryEntityView {
  canonicalKey: string;
  songId?: number;
  songName: string;
  artist: string;
  queryCount: number;
  localHitCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: string;
  updatedAt: string;
  aliases: MemoryAliasView[];
}

export interface MemoryUnclassifiedView {
  id: string;
  query: string;
  normalizedQuery: string;
  type: MemoryTargetType;
  songName: string;
  artist: string;
  hitCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  recordCount: number;
  entityCount: number;
  unclassifiedCount: number;
  localHitCount: number;
  savedAiCalls: number;
  ambiguousCount: number;
}

export interface MemoryMutationResult {
  ok: boolean;
  error?: string;
  record?: MemoryRecord;
}

export interface MemoryStoreSnapshot {
  version: 1;
  records: MemoryRecord[];
  updatedAt: string;
}

export type MemoryFindResult = MemoryRecord | null;

export type MemoryLoadStatus = 'ok' | 'missing' | 'read_error' | 'format_error';

export interface MemoryLoadResult {
  status: MemoryLoadStatus;
  snapshot?: MemoryStoreSnapshot;
  error?: string;
  invalidRecordCount?: number;
}

export type MemoryResolveStatus = 'exact' | 'entity_hit' | 'ambiguous' | 'miss';

export interface MemoryResolveResult {
  status: MemoryResolveStatus;
  record?: MemoryRecord;
  canonicalKey?: string;
  score?: number;
  reason?: string;
  candidateCount?: number;
  margin?: number;
  candidates?: MemoryResolveCandidate[];
}

export interface MemoryStorageAdapter {
  load(): Promise<MemoryLoadResult>;
  save(snapshot: MemoryStoreSnapshot): Promise<boolean>;
}
