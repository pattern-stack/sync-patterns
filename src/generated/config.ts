/**
 * Sync Configuration
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 *
 * This module manages runtime configuration for sync-patterns,
 * including Electric URL and per-entity local-first settings.
 */

/**
 * Sync mode determines how data is synchronized
 * - api: Server-only, uses TanStack Query (no local storage)
 * - realtime: ElectricSQL + TanStack DB (in-memory, sub-ms reactivity)
 * - offline: OfflineExecutor + IndexedDB (persistent, survives refresh)
 */
export type SyncMode = 'api' | 'realtime' | 'offline'

/**
 * Replication retry configuration for offline sync
 */
export interface ReplicationConfig {
  /** Starting delay in ms for retry backoff (default: 1000) */
  initialRetryDelay: number
  /** Maximum delay cap in ms (default: 300000 = 5min) */
  maxRetryDelay: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number
  /** Reset delay when browser comes online (default: true) */
  resetOnOnline: boolean
}

/**
 * Sync configuration interface
 */
export interface SyncConfig {
  /** Electric sync service URL */
  electricUrl: string
  /** API base URL for mutations */
  apiUrl: string
  /** Key for auth token in localStorage */
  authTokenKey: string
  /** Default sync mode for entities not explicitly configured */
  defaultSyncMode: SyncMode
  /** Per-entity sync mode configuration */
  entities: Record<string, SyncMode>
  /** Replication retry configuration */
  replication: ReplicationConfig
  /** Callback when auth error occurs (401/403) */
  onAuthError?: () => void
  /** Callback when storage quota exceeded */
  onQuotaExceeded?: (entity: string, error: Error) => void
  /** Callback when sync error occurs */
  onSyncError?: (entity: string, error: Error) => void
}

/**
 * Default replication configuration
 */
const defaultReplicationConfig: ReplicationConfig = {
  initialRetryDelay: 1000,
  maxRetryDelay: 300000,
  backoffMultiplier: 2,
  resetOnOnline: true,
}

/**
 * Default configuration baked in from OpenAPI x-sync extensions
 * Can be overridden at runtime via configureSync()
 */
let config: SyncConfig = {
  electricUrl: '',
  apiUrl: import.meta.env?.VITE_API_URL ?? '/api/v1',
  authTokenKey: 'auth_token',
  defaultSyncMode: 'api',
  entities: {
  },
  replication: defaultReplicationConfig,
}

/**
 * Configure sync settings at runtime
 *
 * @example
 * ```typescript
 * import { configureSync } from "@/generated/config"
 *
 * configureSync({
 *   electricUrl: "https://electric.example.com",
 *   defaultSyncMode: 'realtime',
 *   entities: {
 *     contacts: 'realtime',  // ElectricSQL sync
 *     drafts: 'offline',     // RxDB persistent storage
 *     analytics: 'api'       // Server-only
 *   }
 * })
 * ```
 */
export function configureSync(overrides: Partial<SyncConfig>): void {
  config = {
    ...config,
    ...overrides,
    entities: {
      ...config.entities,
      ...overrides.entities,
    },
    replication: {
      ...config.replication,
      ...overrides.replication,
    },
  }
}

/**
 * Get the sync mode for an entity
 *
 * @param entity Entity name (e.g., "contacts", "accounts")
 * @returns Sync mode: 'api', 'realtime', or 'offline'
 */
export function getSyncMode(entity: string): SyncMode {
  return config.entities[entity] ?? config.defaultSyncMode
}

/**
 * Check if an entity is configured for local-first mode
 * @deprecated Use getSyncMode() instead for 3-mode support
 *
 * @param entity Entity name (e.g., "contacts", "accounts")
 * @returns true if entity uses realtime or offline mode
 */
export function isLocalFirst(entity: string): boolean {
  const mode = getSyncMode(entity)
  return mode === 'realtime' || mode === 'offline'
}

/**
 * Get the configured Electric sync service URL
 *
 * @throws {Error} if Electric URL is not configured
 * @returns Electric service URL
 */
export function getElectricUrl(): string {
  if (!config.electricUrl) {
    throw new Error('Electric URL not configured. Call configureSync() first.')
  }
  return config.electricUrl
}

/**
 * Get the current sync configuration
 *
 * @returns A copy of the current configuration
 */
export function getSyncConfig(): SyncConfig {
  return { ...config, entities: { ...config.entities } }
}

/**
 * Get the configured API base URL
 *
 * @returns API base URL (e.g., "/api/v1")
 */
export function getApiUrl(): string {
  return config.apiUrl
}

// Cached token getter with refresh support
let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get the current auth token from localStorage with caching
 *
 * @returns Auth token or empty string if not found
 */
export function getAuthToken(): string {
  if (typeof localStorage === 'undefined') return ''

  const now = Date.now()
  if (cachedToken && tokenExpiry > now) {
    return cachedToken
  }

  cachedToken = localStorage.getItem(config.authTokenKey) ?? ""
  // Assume 5 minute cache, actual expiry should be parsed from JWT
  tokenExpiry = now + 5 * 60 * 1000
  return cachedToken
}

/**
 * Clear the cached auth token, forcing a fresh read on next getAuthToken()
 */
export function clearTokenCache(): void {
  cachedToken = null
  tokenExpiry = 0
}

/**
 * Get the current replication configuration
 *
 * @returns Replication config with retry settings
 */
export function getReplicationConfig(): ReplicationConfig {
  return { ...config.replication }
}

/**
 * Get the configured auth error callback
 *
 * @returns Auth error callback if configured
 */
export function getOnAuthError(): (() => void) | undefined {
  return config.onAuthError
}

/**
 * Get the configured quota exceeded callback
 *
 * @returns Quota exceeded callback if configured
 */
export function getOnQuotaExceeded(): ((entity: string, error: Error) => void) | undefined {
  return config.onQuotaExceeded
}

/**
 * Get the configured sync error callback
 *
 * @returns Sync error callback if configured
 */
export function getOnSyncError(): ((entity: string, error: Error) => void) | undefined {
  return config.onSyncError
}

// ============================================================================
// QUERY PERSISTENCE - Survives page refresh
// ============================================================================

/**
 * Set up TanStack Query cache persistence to localStorage.
 * Call this once when your app initializes, after creating your QueryClient.
 *
 * This ensures that cached data survives page refresh, providing
 * instant UI even when offline or on slow connections.
 *
 * @example
 * ```typescript
 * import { QueryClient } from "@tanstack/react-query"
 * import { setupQueryPersistence } from "./generated/config"
 *
 * const queryClient = new QueryClient()
 * setupQueryPersistence(queryClient)
 * ```
 *
 * @param queryClient - Your TanStack Query client instance
 * @param maxAge - Max age in ms for cached data (default: 24 hours)
 */
export function setupQueryPersistence(
  queryClient: import("@tanstack/react-query").QueryClient,
  maxAge: number = 1000 * 60 * 60 * 24 // 24 hours
): void {
  // Dynamically import to avoid bundling if not used
  Promise.all([
    import("@tanstack/react-query-persist-client"),
    import("@tanstack/query-sync-storage-persister"),
  ]).then(([{ persistQueryClient }, { createSyncStoragePersister }]) => {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: 'PATTERN_STACK_QUERY_CACHE',
    })

    persistQueryClient({
      queryClient,
      persister,
      maxAge,
      buster: "", // Cache buster string, change to invalidate all cached data
    })

    console.info('[sync] Query persistence enabled (localStorage)')
  }).catch((err) => {
    console.warn('[sync] Query persistence not available:', err.message)
  })
}
