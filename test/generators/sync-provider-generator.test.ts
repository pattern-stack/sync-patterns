/**
 * Sync Provider Generator Tests
 *
 * Tests for SyncProvider React component generation.
 */

import { describe, it, expect } from 'vitest'
import { generateSyncProvider } from '../../src/generators/sync-provider-generator.js'
import type { ParsedOpenAPI, ParsedEndpoint } from '../../src/generators/parser.js'

describe('SyncProviderGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    info: {
      title: 'Test API',
      version: '1.0.0',
    },
    servers: [],
    endpoints: [],
    schemas: [],
    security: [],
    ...overrides,
  })

  const createEndpoint = (overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint => ({
    path: '/contacts',
    method: 'get',
    operationId: 'list_contacts',
    parameters: [],
    responses: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should generate SyncState interface', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('interface SyncState {')
      expect(result.provider).toContain('rxdb: AppDatabase | null')
      expect(result.provider).toContain('isOnline: boolean')
      expect(result.provider).toContain('isSyncing: boolean')
      expect(result.provider).toContain('lastSyncedAt: Date | null')
      expect(result.provider).toContain('pendingMutations: number')
      expect(result.provider).toContain('syncError: Error | null')
      expect(result.provider).toContain('quotaExceeded: boolean')
      expect(result.provider).toContain('forceSync: () => Promise<void>')
      expect(result.provider).toContain('clearLocalData: () => Promise<void>')
    })

    it('should generate SyncContext', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('const SyncContext = createContext<SyncState | null>(null)')
    })

    it('should generate useSyncState hook', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('export function useSyncState(): SyncState {')
      expect(result.provider).toContain('const ctx = useContext(SyncContext)')
      expect(result.provider).toContain("throw new Error('useSyncState must be used within SyncProvider')")
      expect(result.provider).toContain('return ctx')
    })

    it('should generate useIsOnline hook', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('export function useIsOnline(): boolean {')
      expect(result.provider).toContain('const { isOnline } = useSyncState()')
      expect(result.provider).toContain('return isOnline')
    })

    it('should generate usePendingMutations hook', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('export function usePendingMutations(): number {')
      expect(result.provider).toContain('const { pendingMutations } = useSyncState()')
      expect(result.provider).toContain('return pendingMutations')
    })

    it('should generate SyncProvider component', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('export function SyncProvider({ children, fallback }: SyncProviderProps): JSX.Element {')
      expect(result.provider).toContain('<SyncContext.Provider value={value}>')
      expect(result.provider).toContain('{children}')
      expect(result.provider).toContain('</SyncContext.Provider>')
    })

    it('should include online/offline detection', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('// Online/offline detection')
      expect(result.provider).toContain("window.addEventListener('online', handleOnline)")
      expect(result.provider).toContain("window.addEventListener('offline', handleOffline)")
      expect(result.provider).toContain("window.removeEventListener('online', handleOnline)")
      expect(result.provider).toContain("window.removeEventListener('offline', handleOffline)")
      expect(result.provider).toContain('const handleOnline = () => setIsOnline(true)')
      expect(result.provider).toContain('const handleOffline = () => setIsOnline(false)')
    })

    it('should include lazy RxDB initialization', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('// Initialize RxDB')
      expect(result.provider).toContain("const { getRxDatabase } = await import('../db/rxdb-init')")
      expect(result.provider).toContain('const db = await getRxDatabase()')
      expect(result.provider).toContain('setRxdb(db)')
      expect(result.provider).toContain('setIsInitialized(true)')
    })

    it('should include quotaExceeded state', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('const [quotaExceeded, setQuotaExceeded] = useState(false)')
      expect(result.provider).toContain('quotaExceeded,')
    })

    it('should include forceSync action', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('const forceSync = useCallback(async () => {')
      expect(result.provider).toContain('if (!rxdb || !isOnline) return')
      expect(result.provider).toContain('setIsSyncing(true)')
      expect(result.provider).toContain('setLastSyncedAt(new Date())')
      expect(result.provider).toContain('setSyncError(err as Error)')
      expect(result.provider).toContain('setIsSyncing(false)')
      expect(result.provider).toContain('}, [rxdb, isOnline])')
    })

    it('should include clearLocalData action', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('const clearLocalData = useCallback(async () => {')
      expect(result.provider).toContain('if (!rxdb) return')
      expect(result.provider).toContain('const collections = Object.values(rxdb.collections)')
      expect(result.provider).toContain('await Promise.all(collections.map(col => col.remove()))')
      expect(result.provider).toContain("console.log('[sync] Local data cleared')")
      expect(result.provider).toContain('}, [rxdb])')
    })

    it('should include fallback prop for loading state', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('interface SyncProviderProps {')
      expect(result.provider).toContain('fallback?: React.ReactNode')
      expect(result.provider).toContain('if (!isInitialized && fallback) {')
      expect(result.provider).toContain('return <>{fallback}</>')
    })

    it('should include proper React imports', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain("import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'")
      expect(result.provider).toContain("import type { AppDatabase } from '../db/rxdb-init'")
      // Should NOT include unused RxDatabase import
      expect(result.provider).not.toContain("import type { RxDatabase } from 'rxdb'")
    })

    it('should include config callback imports', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain("import { getOnQuotaExceeded, getOnSyncError } from '../config'")
    })

    it('should include file path comment', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('// src/generated/providers/SyncProvider.tsx')
    })

    it('should handle endpoints with offline sync mode', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            syncMode: 'offline',
          }),
          createEndpoint({
            path: '/accounts',
            method: 'get',
            syncMode: 'api',
          }),
        ],
      })

      const result = generateSyncProvider(parsedAPI)

      // The provider should generate regardless of entities
      // Entity-specific imports would be used in a more sophisticated generator
      expect(result.provider).toContain('export function SyncProvider')
    })

    it('should handle endpoints with realtime sync mode', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            syncMode: 'realtime',
          }),
        ],
      })

      const result = generateSyncProvider(parsedAPI)

      // Realtime endpoints should not be treated as offline
      expect(result.provider).toContain('export function SyncProvider')
    })

    it('should handle legacy localFirst: true as realtime (not offline)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            localFirst: true,
          }),
        ],
      })

      const result = generateSyncProvider(parsedAPI)

      // localFirst: true should be treated as realtime, not offline
      // The generator should still work
      expect(result.provider).toContain('export function SyncProvider')
    })

    it('should include value object with all state properties', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('const value: SyncState = {')
      expect(result.provider).toContain('rxdb,')
      expect(result.provider).toContain('isOnline,')
      expect(result.provider).toContain('isSyncing,')
      expect(result.provider).toContain('lastSyncedAt,')
      expect(result.provider).toContain('pendingMutations,')
      expect(result.provider).toContain('syncError,')
      expect(result.provider).toContain('quotaExceeded,')
      expect(result.provider).toContain('forceSync,')
      expect(result.provider).toContain('clearLocalData,')
    })

    it('should handle error states during RxDB initialization', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('setSyncError(error)')
      expect(result.provider).toContain('setIsInitialized(true) // Still mark as initialized so app can render')
      expect(result.provider).toContain("console.error('[sync] RxDB init failed:', err)")
    })

    it('should detect QuotaExceededError and set quotaExceeded state', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('// Detect quota exceeded errors')
      expect(result.provider).toContain('const error = err as Error')
      expect(result.provider).toContain("const isQuotaError = error?.name === 'QuotaExceededError' ||")
      expect(result.provider).toContain("error?.message?.toLowerCase().includes('quota')")
      expect(result.provider).toContain('if (isQuotaError) {')
      expect(result.provider).toContain('setQuotaExceeded(true)')
    })

    it('should call getOnQuotaExceeded callback on quota error', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain("getOnQuotaExceeded()?.('init', error)")
    })

    it('should use mounted flag to prevent state updates after unmount', () => {
      const parsedAPI = createParsedAPI()
      const result = generateSyncProvider(parsedAPI)

      expect(result.provider).toContain('let mounted = true')
      expect(result.provider).toContain('if (mounted) {')
      expect(result.provider).toContain('mounted = false')
    })
  })
})
