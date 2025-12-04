/**
 * Config Generator Tests
 *
 * Tests for runtime configuration module generation with 3-mode sync support.
 */

import { describe, it, expect } from 'vitest'
import { generateConfig } from '../../src/generators/config-generator.js'
import type { ParsedOpenAPI, ParsedEndpoint } from '../../src/generators/parser.js'

describe('ConfigGenerator', () => {
  const createParsedAPI = (overrides: Partial<ParsedOpenAPI> = {}): ParsedOpenAPI => ({
    title: 'Test API',
    version: '1.0.0',
    endpoints: [],
    schemas: [],
    ...overrides,
  })

  const createEndpoint = (overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint => ({
    path: '/contacts',
    method: 'get',
    operationId: 'list_contacts',
    responses: [],
    ...overrides,
  })

  describe('generate', () => {
    it('should export SyncMode type', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("export type SyncMode = 'api' | 'realtime' | 'offline'")
    })

    it('should generate ReplicationConfig interface', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export interface ReplicationConfig')
      expect(result.config).toContain('initialRetryDelay: number')
      expect(result.config).toContain('maxRetryDelay: number')
      expect(result.config).toContain('backoffMultiplier: number')
      expect(result.config).toContain('resetOnOnline: boolean')
    })

    it('should generate SyncConfig interface with 3-mode support', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export interface SyncConfig')
      expect(result.config).toContain('electricUrl: string')
      expect(result.config).toContain('apiUrl: string')
      expect(result.config).toContain('authTokenKey: string')
      expect(result.config).toContain('defaultSyncMode: SyncMode')
      expect(result.config).toContain('entities: Record<string, SyncMode>')
      expect(result.config).toContain('replication: ReplicationConfig')
      expect(result.config).toContain('onAuthError?: () => void')
      expect(result.config).toContain('onQuotaExceeded?: (entity: string, error: Error) => void')
      expect(result.config).toContain('onSyncError?: (entity: string, error: Error) => void')
    })

    it('should generate defaultReplicationConfig constant', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('const defaultReplicationConfig: ReplicationConfig')
      expect(result.config).toContain('initialRetryDelay: 1000')
      expect(result.config).toContain('maxRetryDelay: 300000')
      expect(result.config).toContain('backoffMultiplier: 2')
      expect(result.config).toContain('resetOnOnline: true')
    })

    it('should generate configureSync function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function configureSync(overrides: Partial<SyncConfig>): void')
    })

    it('should merge replication config in configureSync', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('replication: {')
      expect(result.config).toContain('...config.replication,')
      expect(result.config).toContain('...overrides.replication,')
    })

    it('should generate getSyncMode function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getSyncMode(entity: string): SyncMode')
      expect(result.config).toContain('return config.entities[entity] ?? config.defaultSyncMode')
    })

    it('should generate isLocalFirst function with backward compat', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function isLocalFirst(entity: string): boolean')
      expect(result.config).toContain('const mode = getSyncMode(entity)')
      expect(result.config).toContain("return mode === 'realtime' || mode === 'offline'")
    })

    it('should generate getElectricUrl function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getElectricUrl(): string')
      expect(result.config).toContain("throw new Error('Electric URL not configured")
    })

    it('should generate getApiUrl function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getApiUrl(): string')
      expect(result.config).toContain('return config.apiUrl')
    })

    it('should generate getAuthToken function with caching', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getAuthToken(): string')
      expect(result.config).toContain('let cachedToken: string | null = null')
      expect(result.config).toContain('let tokenExpiry: number = 0')
      expect(result.config).toContain('if (cachedToken && tokenExpiry > now)')
      expect(result.config).toContain('localStorage.getItem(config.authTokenKey)')
      expect(result.config).toContain('tokenExpiry = now + 5 * 60 * 1000')
    })

    it('should generate clearTokenCache function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function clearTokenCache(): void')
      expect(result.config).toContain('cachedToken = null')
      expect(result.config).toContain('tokenExpiry = 0')
    })

    it('should generate getReplicationConfig function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getReplicationConfig(): ReplicationConfig')
      expect(result.config).toContain('return { ...config.replication }')
    })

    it('should generate getOnAuthError function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getOnAuthError(): (() => void) | undefined')
      expect(result.config).toContain('return config.onAuthError')
    })

    it('should generate getOnQuotaExceeded function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getOnQuotaExceeded(): ((entity: string, error: Error) => void) | undefined')
      expect(result.config).toContain('return config.onQuotaExceeded')
    })

    it('should generate getOnSyncError function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getOnSyncError(): ((entity: string, error: Error) => void) | undefined')
      expect(result.config).toContain('return config.onSyncError')
    })

    it('should generate getSyncConfig function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getSyncConfig(): SyncConfig')
    })

    it('should include entity configurations from x-sync with localFirst (backward compat)', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            localFirst: true,
          }),
          createEndpoint({
            path: '/accounts',
            method: 'get',
            localFirst: false,
          }),
        ],
      })

      const result = generateConfig(parsedAPI)

      // localFirst: true → 'realtime', localFirst: false → 'api'
      expect(result.config).toContain("contacts: 'realtime'")
      expect(result.config).toContain("accounts: 'api'")
    })

    it('should handle syncMode: realtime', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', syncMode: 'realtime' }),
        ],
      })

      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("contacts: 'realtime'")
    })

    it('should handle syncMode: offline', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/drafts', method: 'get', syncMode: 'offline' }),
        ],
      })

      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("drafts: 'offline'")
    })

    it('should handle syncMode: api', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/analytics', method: 'get', syncMode: 'api' }),
        ],
      })

      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("analytics: 'api'")
    })

    it('should use default values for api configuration', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("electricUrl: ''")
      expect(result.config).toContain("apiUrl: import.meta.env?.VITE_API_URL ?? '/api/v1'")
      expect(result.config).toContain("authTokenKey: 'auth_token'")
      expect(result.config).toContain("defaultSyncMode: 'api'")
      expect(result.config).toContain('replication: defaultReplicationConfig')
    })

    it('should include JSDoc comments when includeJSDoc is true', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI, { includeJSDoc: true })

      expect(result.config).toContain('/**')
      expect(result.config).toContain(' * Sync configuration interface')
      expect(result.config).toContain(' * Configure sync settings at runtime')
      expect(result.config).toContain(' * Sync mode determines how data is synchronized')
    })

    it('should exclude JSDoc comments when includeJSDoc is false', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI, { includeJSDoc: false })

      expect(result.config).not.toContain(' * Sync configuration interface')
      expect(result.config).not.toContain(' * Configure sync settings at runtime')
    })

    it('should handle multiple endpoints for same entity', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/contacts', method: 'get', syncMode: 'realtime' }),
          createEndpoint({ path: '/contacts', method: 'post', syncMode: 'realtime' }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', syncMode: 'realtime' }),
        ],
      })

      const result = generateConfig(parsedAPI)

      // Should only have one entry for contacts in the entities section
      // Extract just the entities object content
      const entitiesMatch = result.config.match(/entities:\s*\{([^}]+)\}/)
      expect(entitiesMatch).not.toBeNull()
      const entitiesContent = entitiesMatch![1]
      const contactsMatches = entitiesContent.match(/contacts: 'realtime'/g)
      expect(contactsMatches).toHaveLength(1)
    })

    it('should skip api version prefixes in entity names', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/api/v1/contacts', method: 'get', syncMode: 'realtime' }),
          createEndpoint({ path: '/v2/accounts', method: 'get', syncMode: 'offline' }),
        ],
      })

      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("contacts: 'realtime'")
      expect(result.config).toContain("accounts: 'offline'")

      // Check entities section doesn't contain api/v1/v2 as entity keys
      const entitiesMatch = result.config.match(/entities:\s*\{([^}]+)\}/)
      expect(entitiesMatch).not.toBeNull()
      const entitiesContent = entitiesMatch![1]
      expect(entitiesContent).not.toContain('api:')
      expect(entitiesContent).not.toContain('v1:')
      expect(entitiesContent).not.toContain('v2:')
    })

    it('should prefer explicit syncMode over localFirst', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({
            path: '/contacts',
            method: 'get',
            syncMode: 'offline',
            localFirst: true, // Should be ignored when syncMode is set
          }),
        ],
      })

      const result = generateConfig(parsedAPI)

      // Check only the entities section (not JSDoc examples which may contain 'realtime')
      const entitiesMatch = result.config.match(/entities:\s*\{([^}]+)\}/)
      expect(entitiesMatch).not.toBeNull()
      const entitiesContent = entitiesMatch![1]
      expect(entitiesContent).toContain("contacts: 'offline'")
      expect(entitiesContent).not.toContain("contacts: 'realtime'")
    })
  })
})
