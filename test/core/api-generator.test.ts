/**
 * ApiGenerator Tests
 *
 * Tests for the pure TypeScript API layer generator.
 * This generator produces entity-grouped API objects that can be used
 * by both React hooks AND the TUI (no React dependency).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { OpenAPIV3 } from 'openapi-types'
import { EntityResolver } from '../../src/core/entity-resolver.js'
import { ApiGenerator } from '../../src/core/api-generator.js'
import type { EntityModel } from '../../src/core/entity-model.js'

// Test fixtures
const fixturesDir = resolve(import.meta.dirname, '../fixtures')

function loadFixture(name: string): OpenAPIV3.Document {
  const content = readFileSync(resolve(fixturesDir, name), 'utf-8')
  return JSON.parse(content) as OpenAPIV3.Document
}

function resolveFixture(name: string): EntityModel {
  const spec = loadFixture(name)
  const resolver = new EntityResolver()
  return resolver.resolve(spec)
}

describe('ApiGenerator', () => {
  let generator: ApiGenerator

  beforeAll(() => {
    generator = new ApiGenerator()
  })

  describe('file generation', () => {
    it('generates entity-grouped api files', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
    })

    it('generates index file with exports', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.index).toContain('export')
      expect(output.index).toContain('accountsApi')
    })

    it('generates types file', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.types).toContain('ApiConfig')
      expect(output.types).toContain('baseUrl')
      expect(output.types).toContain('authToken')
    })

    it('generates client file with configurable instance', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.client).toContain('configureApi')
      expect(output.client).toContain('getApiConfig')
    })
  })

  describe('CRUD method generation', () => {
    it('generates list method', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async list(')
      expect(code).toContain("get<")
      expect(code).toContain('/api/v1/accounts')
    })

    it('generates get method with id parameter', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async get(')
      expect(code).toMatch(/get\([^)]*id:\s*string/)
      expect(code).toContain('${id}')
    })

    it('generates create method with typed data parameter', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async create(')
      expect(code).toContain('AccountCreate')
      expect(code).toContain('post<')
    })

    it('generates update method with id and data parameters', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async update(')
      expect(code).toMatch(/update\([^)]*id:\s*string/)
      expect(code).toContain('AccountUpdate')
      expect(code).toContain('put<')
    })

    it('generates delete method with id parameter', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async delete(')
      expect(code).toMatch(/delete\([^)]*id:\s*string/)
    })
  })

  describe('listWithMeta convenience method', () => {
    it('generates listWithMeta when metadata endpoint exists', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('async listWithMeta(')
      expect(code).toContain('/metadata')
    })

    it('listWithMeta returns both data and columns', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('data:')
      expect(code).toContain('columns:')
    })

    it('listWithMeta accepts view parameter', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toMatch(/listWithMeta\([^)]*view/)
    })
  })

  describe('custom operation generation', () => {
    it('generates custom operations', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('transitionStage')
    })

    it('custom operations include path parameters', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      // transitionStage should take account_id
      expect(code).toMatch(/transitionStage\([^)]*id:\s*string/)
    })

    it('custom operations include request body when present', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('StageTransition')
    })
  })

  describe('API client configuration', () => {
    it('client supports baseUrl configuration', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.client).toContain('baseUrl')
    })

    it('client supports authToken configuration', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.client).toContain('authToken')
    })

    it('client adds Authorization header when token present', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.client).toContain('Authorization')
      expect(output.client).toContain('Bearer')
    })
  })

  describe('type imports', () => {
    it('imports entity types from schemas', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('import')
      expect(code).toContain('Account')
      expect(code).toContain('AccountCreate')
      expect(code).toContain('AccountUpdate')
    })

    it('imports list response type for paginated endpoints', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('AccountListResponse')
    })
  })

  describe('multiple entities', () => {
    it('generates separate files for each entity', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
      expect(output.entities.has('contacts')).toBe(true)
      expect(output.entities.has('files')).toBe(true)
    })

    it('index exports all entity APIs', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)

      expect(output.index).toContain('accountsApi')
      expect(output.index).toContain('contactsApi')
      expect(output.index).toContain('filesApi')
    })
  })

  describe('code quality', () => {
    it('generates valid TypeScript syntax', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      // Basic syntax checks
      expect(code).toContain('export const accountsApi')
      expect(code).toMatch(/async \w+\(/)
      expect(code).toContain('await')
    })

    it('includes JSDoc comments', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('/**')
      expect(code).toContain('*/')
    })

    it('includes file header with generation notice', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('Auto-generated')
      expect(code).toContain('Do not edit')
    })
  })
})
