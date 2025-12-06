/**
 * Config Generator
 *
 * Generates runtime configuration module for sync-patterns.
 * Bakes in default values from OpenAPI x-sync extensions at generation time,
 * allowing runtime overrides.
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'

export interface GeneratedConfig {
  config: string
}

export interface ConfigGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ConfigGeneratorOptions> = {
  includeJSDoc: true,
}

export class ConfigGenerator {
  private options: Required<ConfigGeneratorOptions>

  constructor(options: ConfigGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedConfig {
    const config = this.generateConfigFile(parsedAPI.endpoints)
    return { config }
  }

  private generateConfigFile(endpoints: ParsedEndpoint[]): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader())
    lines.push('')

    // Extract entity configurations
    const entityConfigs = this.extractEntityConfigs(endpoints)

    // SyncMode type
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Sync mode determines how data is synchronized')
      lines.push(' * - api: Server-only, uses TanStack Query (no local storage)')
      lines.push(' * - realtime: ElectricSQL + TanStack DB (in-memory, sub-ms reactivity)')
      lines.push(' * - offline: OfflineExecutor + IndexedDB (persistent, survives refresh)')
      lines.push(' */')
    }
    lines.push("export type SyncMode = 'api' | 'realtime' | 'offline'")
    lines.push('')

    // ReplicationConfig interface
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Replication retry configuration for offline sync')
      lines.push(' */')
    }
    lines.push('export interface ReplicationConfig {')
    lines.push('  /** Starting delay in ms for retry backoff (default: 1000) */')
    lines.push('  initialRetryDelay: number')
    lines.push('  /** Maximum delay cap in ms (default: 300000 = 5min) */')
    lines.push('  maxRetryDelay: number')
    lines.push('  /** Multiplier for exponential backoff (default: 2) */')
    lines.push('  backoffMultiplier: number')
    lines.push('  /** Reset delay when browser comes online (default: true) */')
    lines.push('  resetOnOnline: boolean')
    lines.push('}')
    lines.push('')

    // Type definition
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Sync configuration interface')
      lines.push(' */')
    }
    lines.push('export interface SyncConfig {')
    lines.push('  /** Electric sync service URL */')
    lines.push('  electricUrl: string')
    lines.push('  /** API base URL for mutations */')
    lines.push('  apiUrl: string')
    lines.push('  /** Key for auth token in localStorage */')
    lines.push('  authTokenKey: string')
    lines.push('  /** Default sync mode for entities not explicitly configured */')
    lines.push('  defaultSyncMode: SyncMode')
    lines.push('  /** Per-entity sync mode configuration */')
    lines.push('  entities: Record<string, SyncMode>')
    lines.push('  /** Replication retry configuration */')
    lines.push('  replication: ReplicationConfig')
    lines.push('  /** Callback when auth error occurs (401/403) */')
    lines.push('  onAuthError?: () => void')
    lines.push('  /** Callback when storage quota exceeded */')
    lines.push('  onQuotaExceeded?: (entity: string, error: Error) => void')
    lines.push('  /** Callback when sync error occurs */')
    lines.push('  onSyncError?: (entity: string, error: Error) => void')
    lines.push('}')
    lines.push('')

    // Default replication config
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Default replication configuration')
      lines.push(' */')
    }
    lines.push('const defaultReplicationConfig: ReplicationConfig = {')
    lines.push('  initialRetryDelay: 1000,')
    lines.push('  maxRetryDelay: 300000,')
    lines.push('  backoffMultiplier: 2,')
    lines.push('  resetOnOnline: true,')
    lines.push('}')
    lines.push('')

    // Default configuration
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Default configuration baked in from OpenAPI x-sync extensions')
      lines.push(' * Can be overridden at runtime via configureSync()')
      lines.push(' */')
    }
    lines.push('let config: SyncConfig = {')
    lines.push("  electricUrl: '',")
    lines.push("  apiUrl: import.meta.env?.VITE_API_URL ?? '/api/v1',")
    lines.push("  authTokenKey: 'auth_token',")
    lines.push("  defaultSyncMode: 'api',")
    lines.push('  entities: {')

    // Add entity configurations
    const sortedEntities = Object.entries(entityConfigs).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    for (const [entityName, syncMode] of sortedEntities) {
      lines.push(`    ${entityName}: '${syncMode}',`)
    }

    lines.push('  },')
    lines.push('  replication: defaultReplicationConfig,')
    lines.push('}')
    lines.push('')

    // configureSync function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Configure sync settings at runtime')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * ```typescript')
      lines.push(' * import { configureSync } from "@/generated/config"')
      lines.push(' *')
      lines.push(' * configureSync({')
      lines.push(' *   electricUrl: "https://electric.example.com",')
      lines.push(" *   defaultSyncMode: 'realtime',")
      lines.push(' *   entities: {')
      lines.push(" *     contacts: 'realtime',  // ElectricSQL sync")
      lines.push(" *     drafts: 'offline',     // RxDB persistent storage")
      lines.push(" *     analytics: 'api'       // Server-only")
      lines.push(' *   }')
      lines.push(' * })')
      lines.push(' * ```')
      lines.push(' */')
    }
    lines.push('export function configureSync(overrides: Partial<SyncConfig>): void {')
    lines.push('  config = {')
    lines.push('    ...config,')
    lines.push('    ...overrides,')
    lines.push('    entities: {')
    lines.push('      ...config.entities,')
    lines.push('      ...overrides.entities,')
    lines.push('    },')
    lines.push('    replication: {')
    lines.push('      ...config.replication,')
    lines.push('      ...overrides.replication,')
    lines.push('    },')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    // getSyncMode function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the sync mode for an entity')
      lines.push(' *')
      lines.push(' * @param entity Entity name (e.g., "contacts", "accounts")')
      lines.push(" * @returns Sync mode: 'api', 'realtime', or 'offline'")
      lines.push(' */')
    }
    lines.push('export function getSyncMode(entity: string): SyncMode {')
    lines.push('  return config.entities[entity] ?? config.defaultSyncMode')
    lines.push('}')
    lines.push('')

    // isLocalFirst function (backward compatibility)
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Check if an entity is configured for local-first mode')
      lines.push(' * @deprecated Use getSyncMode() instead for 3-mode support')
      lines.push(' *')
      lines.push(' * @param entity Entity name (e.g., "contacts", "accounts")')
      lines.push(" * @returns true if entity uses realtime or offline mode")
      lines.push(' */')
    }
    lines.push('export function isLocalFirst(entity: string): boolean {')
    lines.push("  const mode = getSyncMode(entity)")
    lines.push("  return mode === 'realtime' || mode === 'offline'")
    lines.push('}')
    lines.push('')

    // getElectricUrl function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured Electric sync service URL')
      lines.push(' *')
      lines.push(' * @throws {Error} if Electric URL is not configured')
      lines.push(' * @returns Electric service URL')
      lines.push(' */')
    }
    lines.push('export function getElectricUrl(): string {')
    lines.push('  if (!config.electricUrl) {')
    lines.push(
      "    throw new Error('Electric URL not configured. Call configureSync() first.')"
    )
    lines.push('  }')
    lines.push('  return config.electricUrl')
    lines.push('}')
    lines.push('')

    // getSyncConfig function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the current sync configuration')
      lines.push(' *')
      lines.push(' * @returns A copy of the current configuration')
      lines.push(' */')
    }
    lines.push('export function getSyncConfig(): SyncConfig {')
    lines.push('  return { ...config, entities: { ...config.entities } }')
    lines.push('}')
    lines.push('')

    // getApiUrl function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured API base URL')
      lines.push(' *')
      lines.push(' * @returns API base URL (e.g., "/api/v1")')
      lines.push(' */')
    }
    lines.push('export function getApiUrl(): string {')
    lines.push('  return config.apiUrl')
    lines.push('}')
    lines.push('')

    // Token caching state
    lines.push('// Cached token getter with refresh support')
    lines.push('let cachedToken: string | null = null')
    lines.push('let tokenExpiry: number = 0')
    lines.push('')

    // getAuthToken function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the current auth token from localStorage with caching')
      lines.push(' *')
      lines.push(' * @returns Auth token or empty string if not found')
      lines.push(' */')
    }
    lines.push('export function getAuthToken(): string {')
    lines.push("  if (typeof localStorage === 'undefined') return ''")
    lines.push('')
    lines.push('  const now = Date.now()')
    lines.push('  if (cachedToken && tokenExpiry > now) {')
    lines.push('    return cachedToken')
    lines.push('  }')
    lines.push('')
    lines.push('  cachedToken = localStorage.getItem(config.authTokenKey) ?? ""')
    lines.push('  // Assume 5 minute cache, actual expiry should be parsed from JWT')
    lines.push('  tokenExpiry = now + 5 * 60 * 1000')
    lines.push('  return cachedToken')
    lines.push('}')
    lines.push('')

    // clearTokenCache function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Clear the cached auth token, forcing a fresh read on next getAuthToken()')
      lines.push(' */')
    }
    lines.push('export function clearTokenCache(): void {')
    lines.push('  cachedToken = null')
    lines.push('  tokenExpiry = 0')
    lines.push('}')
    lines.push('')

    // getReplicationConfig function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the current replication configuration')
      lines.push(' *')
      lines.push(' * @returns Replication config with retry settings')
      lines.push(' */')
    }
    lines.push('export function getReplicationConfig(): ReplicationConfig {')
    lines.push('  return { ...config.replication }')
    lines.push('}')
    lines.push('')

    // getOnAuthError function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured auth error callback')
      lines.push(' *')
      lines.push(' * @returns Auth error callback if configured')
      lines.push(' */')
    }
    lines.push('export function getOnAuthError(): (() => void) | undefined {')
    lines.push('  return config.onAuthError')
    lines.push('}')
    lines.push('')

    // getOnQuotaExceeded function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured quota exceeded callback')
      lines.push(' *')
      lines.push(' * @returns Quota exceeded callback if configured')
      lines.push(' */')
    }
    lines.push('export function getOnQuotaExceeded(): ((entity: string, error: Error) => void) | undefined {')
    lines.push('  return config.onQuotaExceeded')
    lines.push('}')
    lines.push('')

    // getOnSyncError function
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Get the configured sync error callback')
      lines.push(' *')
      lines.push(' * @returns Sync error callback if configured')
      lines.push(' */')
    }
    lines.push('export function getOnSyncError(): ((entity: string, error: Error) => void) | undefined {')
    lines.push('  return config.onSyncError')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Extract entity configurations from endpoints
   */
  private extractEntityConfigs(endpoints: ParsedEndpoint[]): Record<string, 'api' | 'realtime' | 'offline'> {
    const configs: Record<string, 'api' | 'realtime' | 'offline'> = {}

    for (const endpoint of endpoints) {
      const syncMode = this.getSyncMode(endpoint)
      if (syncMode) {
        const entityName = this.extractEntityName(endpoint.path)
        if (entityName) {
          // Only set if not already configured (first endpoint wins)
          if (!(entityName in configs)) {
            configs[entityName] = syncMode
          }
        }
      }
    }

    return configs
  }

  /**
   * Get sync mode from endpoint with backward compatibility
   */
  private getSyncMode(endpoint: ParsedEndpoint): 'api' | 'realtime' | 'offline' | undefined {
    // New format: explicit syncMode
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'

    // Legacy format: localFirst boolean
    // local_first: true → 'realtime' (backward compat)
    if (endpoint.localFirst === true) return 'realtime'
    if (endpoint.localFirst === false) return 'api'

    return undefined
  }

  /**
   * Extract entity name from path
   * Examples:
   *   /contacts -> contacts
   *   /api/contacts -> contacts
   *   /v1/contacts -> contacts
   *   /contacts/{id} -> contacts (ignores path params)
   */
  private extractEntityName(path: string): string | null {
    // Remove leading/trailing slashes and split
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))

    // Find the first segment that looks like a resource name (plural noun)
    // Skip common prefixes like 'api', 'v1', 'v2', etc.
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find(
      (seg) => !skipPrefixes.includes(seg.toLowerCase())
    )

    return resourceSegment || null
  }

  private generateFileHeader(): string {
    return `/**
 * Sync Configuration
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 *
 * This module manages runtime configuration for sync-patterns,
 * including Electric URL and per-entity local-first settings.
 */`
  }
}

// Factory function for easy usage
export function generateConfig(
  parsedAPI: ParsedOpenAPI,
  options?: ConfigGeneratorOptions
): GeneratedConfig {
  const generator = new ConfigGenerator(options)
  return generator.generate(parsedAPI)
}
