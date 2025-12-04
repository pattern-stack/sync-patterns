/**
 * Config Generator Tests
 *
 * Tests for runtime configuration module generation.
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
    it('should generate SyncConfig interface', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export interface SyncConfig')
      expect(result.config).toContain('electricUrl: string')
      expect(result.config).toContain('apiUrl: string')
      expect(result.config).toContain('authTokenKey: string')
      expect(result.config).toContain('defaultLocalFirst: boolean')
      expect(result.config).toContain('entities: Record<string, boolean>')
    })

    it('should generate configureSync function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function configureSync(overrides: Partial<SyncConfig>): void')
    })

    it('should generate isLocalFirst function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function isLocalFirst(entity: string): boolean')
      expect(result.config).toContain('return config.entities[entity] ?? config.defaultLocalFirst')
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

    it('should generate getAuthToken function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getAuthToken(): string')
      expect(result.config).toContain('localStorage.getItem(config.authTokenKey)')
    })

    it('should generate getSyncConfig function', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('export function getSyncConfig(): SyncConfig')
    })

    it('should include entity configurations from x-sync', () => {
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

      expect(result.config).toContain('contacts: true')
      expect(result.config).toContain('accounts: false')
    })

    it('should use default values for api configuration', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI)

      expect(result.config).toContain("electricUrl: ''")
      expect(result.config).toContain("apiUrl: import.meta.env?.VITE_API_URL ?? '/api/v1'")
      expect(result.config).toContain("authTokenKey: 'auth_token'")
      expect(result.config).toContain('defaultLocalFirst: false')
    })

    it('should include JSDoc comments when includeJSDoc is true', () => {
      const parsedAPI = createParsedAPI()
      const result = generateConfig(parsedAPI, { includeJSDoc: true })

      expect(result.config).toContain('/**')
      expect(result.config).toContain(' * Sync configuration interface')
      expect(result.config).toContain(' * Configure sync settings at runtime')
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
          createEndpoint({ path: '/contacts', method: 'get', localFirst: true }),
          createEndpoint({ path: '/contacts', method: 'post', localFirst: true }),
          createEndpoint({ path: '/contacts/{id}', method: 'get', localFirst: true }),
        ],
      })

      const result = generateConfig(parsedAPI)

      // Should only have one entry for contacts in the entities section
      // Extract just the entities object content
      const entitiesMatch = result.config.match(/entities:\s*\{([^}]+)\}/)
      expect(entitiesMatch).not.toBeNull()
      const entitiesContent = entitiesMatch![1]
      const contactsMatches = entitiesContent.match(/contacts: true/g)
      expect(contactsMatches).toHaveLength(1)
    })

    it('should skip api version prefixes in entity names', () => {
      const parsedAPI = createParsedAPI({
        endpoints: [
          createEndpoint({ path: '/api/v1/contacts', method: 'get', localFirst: true }),
          createEndpoint({ path: '/v2/accounts', method: 'get', localFirst: true }),
        ],
      })

      const result = generateConfig(parsedAPI)

      expect(result.config).toContain('contacts: true')
      expect(result.config).toContain('accounts: true')
      expect(result.config).not.toContain('api: ')
      expect(result.config).not.toContain('v1: ')
      expect(result.config).not.toContain('v2: ')
    })
  })
})
