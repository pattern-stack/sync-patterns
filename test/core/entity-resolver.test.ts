/**
 * EntityResolver Tests
 *
 * Tests for the core entity resolution logic.
 * These tests define the contract that the EntityResolver must satisfy.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { OpenAPIV3 } from 'openapi-types'
import { EntityResolver } from '../../src/core/entity-resolver.js'
import type { EntityModel, SyncMode } from '../../src/core/entity-model.js'

// Test fixtures
const fixturesDir = resolve(import.meta.dirname, '../fixtures')

function loadFixture(name: string): OpenAPIV3.Document {
  const content = readFileSync(resolve(fixturesDir, name), 'utf-8')
  return JSON.parse(content) as OpenAPIV3.Document
}

describe('EntityResolver', () => {
  let resolver: EntityResolver

  beforeAll(() => {
    resolver = new EntityResolver()
  })

  describe('entity detection', () => {
    it('detects entity from versioned path: /api/v1/accounts → accounts', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)

      expect(model.entities.has('accounts')).toBe(true)
    })

    it('sets correct singular and pascal names', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.singular).toBe('account')
      expect(accounts.pascalName).toBe('Account')
    })

    it('detects multiple entities from spec', () => {
      const spec = loadFixture('with-sync-modes.json')
      const model = resolver.resolve(spec)

      expect(model.entities.has('accounts')).toBe(true)
      expect(model.entities.has('contacts')).toBe(true)
      expect(model.entities.has('files')).toBe(true)
    })

    it('ignores non-entity paths: /health, /ready', () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.1.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/health': {
            get: { operationId: 'health', responses: { '200': { description: 'OK' } } },
          },
          '/ready': {
            get: { operationId: 'ready', responses: { '200': { description: 'OK' } } },
          },
          '/api/v1/accounts': {
            get: { operationId: 'list_accounts', responses: { '200': { description: 'OK' } } },
          },
        },
      }
      const model = resolver.resolve(spec)

      expect(model.entities.has('health')).toBe(false)
      expect(model.entities.has('ready')).toBe(false)
      expect(model.entities.has('accounts')).toBe(true)
    })
  })

  describe('CRUD operation detection', () => {
    it('detects list operation: GET /accounts', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.list).toBeDefined()
      expect(accounts.operations.list!.method).toBe('get')
      expect(accounts.operations.list!.operationId).toBe('list_accounts')
    })

    it('detects get operation: GET /accounts/{id}', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.get).toBeDefined()
      expect(accounts.operations.get!.method).toBe('get')
      expect(accounts.operations.get!.pathParams).toHaveLength(1)
      expect(accounts.operations.get!.pathParams[0].name).toBe('account_id')
    })

    it('detects create operation: POST /accounts', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.create).toBeDefined()
      expect(accounts.operations.create!.method).toBe('post')
      expect(accounts.operations.create!.requestSchema).toBeDefined()
      expect(accounts.operations.create!.requestSchema!.name).toBe('AccountCreate')
    })

    it('detects update operation: PUT /accounts/{id}', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.update).toBeDefined()
      expect(accounts.operations.update!.method).toBe('put')
      expect(accounts.operations.update!.requestSchema).toBeDefined()
      expect(accounts.operations.update!.requestSchema!.name).toBe('AccountUpdate')
    })

    it('detects delete operation: DELETE /accounts/{id}', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.delete).toBeDefined()
      expect(accounts.operations.delete!.method).toBe('delete')
    })
  })

  describe('custom operation detection', () => {
    it('classifies custom operations: POST /accounts/{id}/transition', () => {
      const spec = loadFixture('with-custom-operations.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.customOperations.length).toBeGreaterThan(0)

      const transition = accounts.customOperations.find(
        (op) => op.operationId === 'transition_account_stage'
      )
      expect(transition).toBeDefined()
      expect(transition!.method).toBe('post')
      expect(transition!.path).toContain('/transition')
    })

    it('detects archive as custom operation', () => {
      const spec = loadFixture('with-custom-operations.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      const archive = accounts.customOperations.find(
        (op) => op.operationId === 'archive_account'
      )
      expect(archive).toBeDefined()
    })

    it('detects metadata endpoint', () => {
      const spec = loadFixture('with-custom-operations.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.metadataOperation).toBeDefined()
      expect(accounts.metadataOperation!.path).toContain('/metadata')
    })
  })

  describe('sync mode extraction', () => {
    it('extracts x-sync-mode: offline', () => {
      const spec = loadFixture('with-sync-modes.json')
      const model = resolver.resolve(spec)

      expect(model.entities.get('accounts')!.syncMode).toBe('offline')
    })

    it('extracts x-sync-mode: realtime', () => {
      const spec = loadFixture('with-sync-modes.json')
      const model = resolver.resolve(spec)

      expect(model.entities.get('contacts')!.syncMode).toBe('realtime')
    })

    it('defaults to api when no x-sync-mode', () => {
      const spec = loadFixture('with-sync-modes.json')
      const model = resolver.resolve(spec)

      expect(model.entities.get('files')!.syncMode).toBe('api')
    })

    it('handles legacy x-sync.local_first: true → realtime', () => {
      const spec = loadFixture('with-sync-modes.json')
      const model = resolver.resolve(spec)

      expect(model.entities.get('legacy')!.syncMode).toBe('realtime')
    })
  })

  describe('schema detection', () => {
    it('detects list response schema', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.schemas.listResponse).toBe('AccountListResponse')
    })

    it('detects item schema from create/get response', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.schemas.item).toBe('Account')
    })

    it('detects create request schema', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.schemas.createRequest).toBe('AccountCreate')
    })

    it('detects update request schema', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.schemas.updateRequest).toBe('AccountUpdate')
    })

    it('detects paginated list response with items property', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.list!.responseSchema!.arrayProperty).toBe('items')
    })
  })

  describe('parameter extraction', () => {
    it('extracts path parameters with correct names', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)
      const get = model.entities.get('accounts')!.operations.get!

      expect(get.pathParams).toHaveLength(1)
      expect(get.pathParams[0].name).toBe('account_id')
      expect(get.pathParams[0].type).toBe('string')
      expect(get.pathParams[0].required).toBe(true)
    })

    it('extracts query parameters from custom operations', () => {
      const spec = loadFixture('with-custom-operations.json')
      const model = resolver.resolve(spec)
      const metadata = model.entities.get('accounts')!.metadataOperation!

      expect(metadata.queryParams.length).toBeGreaterThan(0)
      const viewParam = metadata.queryParams.find((p) => p.name === 'view')
      expect(viewParam).toBeDefined()
      expect(viewParam!.enumValues).toContain('list')
    })
  })

  describe('API info extraction', () => {
    it('extracts API title and version', () => {
      const spec = loadFixture('minimal-crud.json')
      const model = resolver.resolve(spec)

      expect(model.info.title).toBe('Minimal CRUD API')
      expect(model.info.version).toBe('1.0.0')
    })
  })
})
