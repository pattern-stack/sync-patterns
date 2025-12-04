/**
 * Sync Provider Generator
 *
 * Generates the SyncProvider React component that manages:
 * - RxDB database initialization (lazy)
 * - Online/offline detection
 * - Sync state and pending mutations
 * - forceSync() and clearLocalData() actions
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'

export interface GeneratedSyncProvider {
  /** SyncProvider.tsx content */
  provider: string
}

export interface SyncProviderGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<SyncProviderGeneratorOptions> = {
  includeJSDoc: true,
}

interface EntityInfo {
  name: string
  pascalName: string
}

export class SyncProviderGenerator {
  private options: Required<SyncProviderGeneratorOptions>

  constructor(options: SyncProviderGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedSyncProvider {
    // Extract offline entities for imports
    const offlineEntities = this.extractOfflineEntities(parsedAPI.endpoints)

    // Generate provider file
    const provider = this.generateProviderFile(offlineEntities)

    return { provider }
  }

  /**
   * Extract entities with syncMode: 'offline'
   */
  private extractOfflineEntities(endpoints: ParsedEndpoint[]): EntityInfo[] {
    const entities: EntityInfo[] = []
    const seen = new Set<string>()

    for (const endpoint of endpoints) {
      const syncMode = this.getSyncMode(endpoint)
      if (syncMode !== 'offline') continue

      const entityName = this.extractEntityName(endpoint.path)
      if (!entityName || seen.has(entityName)) continue

      seen.add(entityName)

      const pascalName = this.toPascalCase(this.singularize(entityName))

      entities.push({
        name: entityName,
        pascalName,
      })
    }

    return entities
  }

  private getSyncMode(endpoint: ParsedEndpoint): 'api' | 'realtime' | 'offline' {
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'
    if (endpoint.localFirst === true) return 'realtime' // backward compat
    return 'api'
  }

  private generateProviderFile(entities: EntityInfo[]): string {
    const lines: string[] = []

    // File path comment
    lines.push('// src/generated/providers/SyncProvider.tsx')
    lines.push('')

    // Imports
    lines.push("import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'")
    lines.push("import type { AppDatabase } from '../db/rxdb-init'")
    lines.push("import { getOnQuotaExceeded, getOnSyncError } from '../config'")
    lines.push('')

    // SyncState interface
    lines.push('interface SyncState {')
    lines.push('  // Database instances')
    lines.push('  rxdb: AppDatabase | null')
    lines.push('')
    lines.push('  // Connection status')
    lines.push('  isOnline: boolean')
    lines.push('  isSyncing: boolean')
    lines.push('  lastSyncedAt: Date | null')
    lines.push('')
    lines.push('  // Pending mutations count (offline queue)')
    lines.push('  pendingMutations: number')
    lines.push('')
    lines.push('  // Error state')
    lines.push('  syncError: Error | null')
    lines.push('  quotaExceeded: boolean  // True if IndexedDB quota was hit (fell back to realtime)')
    lines.push('')
    lines.push('  // Actions')
    lines.push('  forceSync: () => Promise<void>')
    lines.push('  clearLocalData: () => Promise<void>')
    lines.push('}')
    lines.push('')

    // SyncContext
    lines.push('const SyncContext = createContext<SyncState | null>(null)')
    lines.push('')

    // useSyncState hook
    lines.push('export function useSyncState(): SyncState {')
    lines.push('  const ctx = useContext(SyncContext)')
    lines.push('  if (!ctx) {')
    lines.push("    throw new Error('useSyncState must be used within SyncProvider')")
    lines.push('  }')
    lines.push('  return ctx')
    lines.push('}')
    lines.push('')

    // useIsOnline hook
    lines.push('export function useIsOnline(): boolean {')
    lines.push('  const { isOnline } = useSyncState()')
    lines.push('  return isOnline')
    lines.push('}')
    lines.push('')

    // usePendingMutations hook
    lines.push('export function usePendingMutations(): number {')
    lines.push('  const { pendingMutations } = useSyncState()')
    lines.push('  return pendingMutations')
    lines.push('}')
    lines.push('')

    // SyncProviderProps interface
    lines.push('interface SyncProviderProps {')
    lines.push('  children: React.ReactNode')
    lines.push('  fallback?: React.ReactNode')
    lines.push('}')
    lines.push('')

    // SyncProvider component
    lines.push('export function SyncProvider({ children, fallback }: SyncProviderProps): JSX.Element {')
    lines.push('  const [rxdb, setRxdb] = useState<AppDatabase | null>(null)')
    lines.push('  const [isOnline, setIsOnline] = useState(navigator.onLine)')
    lines.push('  const [isSyncing, setIsSyncing] = useState(false)')
    lines.push('  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)')
    lines.push('  const [pendingMutations, setPendingMutations] = useState(0)')
    lines.push('  const [syncError, setSyncError] = useState<Error | null>(null)')
    lines.push('  const [quotaExceeded, setQuotaExceeded] = useState(false)')
    lines.push('  const [isInitialized, setIsInitialized] = useState(false)')
    lines.push('')

    // Online/offline detection effect
    lines.push('  // Online/offline detection')
    lines.push('  useEffect(() => {')
    lines.push('    const handleOnline = () => setIsOnline(true)')
    lines.push('    const handleOffline = () => setIsOnline(false)')
    lines.push('')
    lines.push("    window.addEventListener('online', handleOnline)")
    lines.push("    window.addEventListener('offline', handleOffline)")
    lines.push('')
    lines.push('    return () => {')
    lines.push("      window.removeEventListener('online', handleOnline)")
    lines.push("      window.removeEventListener('offline', handleOffline)")
    lines.push('    }')
    lines.push('  }, [])')
    lines.push('')

    // Initialize RxDB effect
    lines.push('  // Initialize RxDB')
    lines.push('  useEffect(() => {')
    lines.push('    let mounted = true')
    lines.push('')
    lines.push('    async function init() {')
    lines.push('      try {')
    lines.push("        const { getRxDatabase } = await import('../db/rxdb-init')")
    lines.push('        const db = await getRxDatabase()')
    lines.push('')
    lines.push('        if (mounted) {')
    lines.push('          setRxdb(db)')
    lines.push('          setIsInitialized(true)')
    lines.push("          console.log('[sync] RxDB initialized')")
    lines.push('        }')
    lines.push('      } catch (err) {')
    lines.push('        if (mounted) {')
    lines.push('          // Detect quota exceeded errors')
    lines.push('          const error = err as Error')
    lines.push("          const isQuotaError = error?.name === 'QuotaExceededError' ||")
    lines.push("                               error?.message?.toLowerCase().includes('quota')")
    lines.push('')
    lines.push('          if (isQuotaError) {')
    lines.push('            setQuotaExceeded(true)')
    lines.push("            getOnQuotaExceeded()?.('init', error)")
    lines.push('          }')
    lines.push('')
    lines.push('          setSyncError(error)')
    lines.push('          setIsInitialized(true) // Still mark as initialized so app can render')
    lines.push("          console.error('[sync] RxDB init failed:', err)")
    lines.push('        }')
    lines.push('      }')
    lines.push('    }')
    lines.push('')
    lines.push('    init()')
    lines.push('')
    lines.push('    return () => {')
    lines.push('      mounted = false')
    lines.push('    }')
    lines.push('  }, [])')
    lines.push('')

    // forceSync callback
    lines.push('  const forceSync = useCallback(async () => {')
    lines.push('    if (!rxdb || !isOnline) return')
    lines.push('')
    lines.push('    setIsSyncing(true)')
    lines.push('    try {')
    lines.push('      // Trigger replication sync for all collections')
    lines.push('      // Implementation depends on replication state access')
    lines.push('      setLastSyncedAt(new Date())')
    lines.push('    } catch (err) {')
    lines.push('      setSyncError(err as Error)')
    lines.push('    } finally {')
    lines.push('      setIsSyncing(false)')
    lines.push('    }')
    lines.push('  }, [rxdb, isOnline])')
    lines.push('')

    // clearLocalData callback
    lines.push('  const clearLocalData = useCallback(async () => {')
    lines.push('    if (!rxdb) return')
    lines.push('')
    lines.push('    // Clear all collections')
    lines.push('    const collections = Object.values(rxdb.collections)')
    lines.push('    await Promise.all(collections.map(col => col.remove()))')
    lines.push('')
    lines.push("    console.log('[sync] Local data cleared')")
    lines.push('  }, [rxdb])')
    lines.push('')

    // Value object
    lines.push('  const value: SyncState = {')
    lines.push('    rxdb,')
    lines.push('    isOnline,')
    lines.push('    isSyncing,')
    lines.push('    lastSyncedAt,')
    lines.push('    pendingMutations,')
    lines.push('    syncError,')
    lines.push('    quotaExceeded,')
    lines.push('    forceSync,')
    lines.push('    clearLocalData,')
    lines.push('  }')
    lines.push('')

    // Fallback rendering
    lines.push('  if (!isInitialized && fallback) {')
    lines.push('    return <>{fallback}</>')
    lines.push('  }')
    lines.push('')

    // Provider rendering
    lines.push('  return (')
    lines.push('    <SyncContext.Provider value={value}>')
    lines.push('      {children}')
    lines.push('    </SyncContext.Provider>')
    lines.push('  )')
    lines.push('}')

    return lines.join('\n')
  }

  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find((seg) => !skipPrefixes.includes(seg.toLowerCase()))
    return resourceSegment || null
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toUpperCase())
  }

  private singularize(str: string): string {
    if (str.endsWith('ies')) {
      return str.slice(0, -3) + 'y'
    }
    if (str.endsWith('ses') || str.endsWith('shes') || str.endsWith('ches') || str.endsWith('xes')) {
      return str.slice(0, -2)
    }
    if (str.endsWith('s') && !str.endsWith('ss')) {
      return str.slice(0, -1)
    }
    return str
  }
}

// Factory function for easy usage
export function generateSyncProvider(
  parsedAPI: ParsedOpenAPI,
  options?: SyncProviderGeneratorOptions
): GeneratedSyncProvider {
  const generator = new SyncProviderGenerator(options)
  return generator.generate(parsedAPI)
}
