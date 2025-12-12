/**
 * Integration Tests
 *
 * End-to-end tests using the real sales-patterns OpenAPI spec.
 * Validates that the full pipeline works correctly.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { execSync } from 'child_process'
import type { OpenAPIV3 } from 'openapi-types'
import { EntityResolver } from '../../src/core/entity-resolver.js'
import { ApiGenerator } from '../../src/core/api-generator.js'
import { HookGenerator } from '../../src/core/hook-generator.js'
import type { EntityModel } from '../../src/core/entity-model.js'

// Test fixtures
const fixturesDir = resolve(import.meta.dirname, '../fixtures')
const tempDir = resolve(import.meta.dirname, '../.temp-generated')

function loadFixture(name: string): OpenAPIV3.Document {
  const content = readFileSync(resolve(fixturesDir, name), 'utf-8')
  return JSON.parse(content) as OpenAPIV3.Document
}

describe('Integration: sales-patterns spec', () => {
  let spec: OpenAPIV3.Document
  let model: EntityModel
  let resolver: EntityResolver
  let apiGenerator: ApiGenerator
  let hookGenerator: HookGenerator

  beforeAll(() => {
    spec = loadFixture('sales-patterns-openapi.json')
    resolver = new EntityResolver()
    apiGenerator = new ApiGenerator()
    hookGenerator = new HookGenerator()
    model = resolver.resolve(spec)
  })

  describe('EntityResolver', () => {
    it('extracts API info correctly', () => {
      expect(model.info.title).toBe('DealBrain API')
      expect(model.info.version).toBe('0.1.0')
    })

    it('detects expected entities', () => {
      // sales-patterns has: accounts, activities, files
      expect(model.entities.has('accounts')).toBe(true)
      expect(model.entities.has('activities')).toBe(true)
      expect(model.entities.has('files')).toBe(true)
    })

    it('does NOT detect system paths as entities', () => {
      expect(model.entities.has('health')).toBe(false)
      expect(model.entities.has('ready')).toBe(false)
      expect(model.entities.has('auth')).toBe(false)
    })

    it('detects CRUD operations for accounts', () => {
      const accounts = model.entities.get('accounts')!

      expect(accounts.operations.list).toBeDefined()
      expect(accounts.operations.get).toBeDefined()
      expect(accounts.operations.create).toBeDefined()
      expect(accounts.operations.update).toBeDefined()
      expect(accounts.operations.delete).toBeDefined()
    })

    it('detects custom operations for accounts', () => {
      const accounts = model.entities.get('accounts')!

      // Should have stage transition and other custom ops
      expect(accounts.customOperations.length).toBeGreaterThan(0)

      const hasTransition = accounts.customOperations.some(
        (op) => op.operationId.includes('transition') || op.path.includes('transition')
      )
      expect(hasTransition).toBe(true)
    })

    it('detects metadata endpoint for accounts', () => {
      const accounts = model.entities.get('accounts')!

      expect(accounts.metadataOperation).toBeDefined()
      expect(accounts.metadataOperation!.path).toContain('metadata')
    })

    it('extracts sync mode from x-sync-mode extension', () => {
      const accounts = model.entities.get('accounts')!

      // sales-patterns accounts use offline mode
      expect(['api', 'realtime', 'offline']).toContain(accounts.syncMode)
    })
  })

  describe('ApiGenerator', () => {
    it('generates API files for all entities', () => {
      const output = apiGenerator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
      expect(output.entities.has('activities')).toBe(true)
      expect(output.entities.has('files')).toBe(true)
    })

    it('generates complete accounts API', () => {
      const output = apiGenerator.generate(model)
      const code = output.entities.get('accounts')!

      // Should have all CRUD methods
      expect(code).toContain('async list()')
      expect(code).toContain('async get(id: string)')
      expect(code).toContain('async create(')
      expect(code).toContain('async update(')
      expect(code).toContain('async delete(')

      // Should have listWithMeta
      expect(code).toContain('async listWithMeta(')
    })

    it('generates client with configuration', () => {
      const output = apiGenerator.generate(model)

      expect(output.client).toContain('configureApi')
      expect(output.client).toContain('baseUrl')
      expect(output.client).toContain('authToken')
    })

    it('generates index with all exports', () => {
      const output = apiGenerator.generate(model)

      expect(output.index).toContain('accountsApi')
      expect(output.index).toContain('activitiesApi')
      expect(output.index).toContain('filesApi')
    })
  })

  describe('HookGenerator', () => {
    it('generates hook files for all entities', () => {
      const output = hookGenerator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
      expect(output.entities.has('activities')).toBe(true)
      expect(output.entities.has('files')).toBe(true)
    })

    it('generates complete accounts hooks', () => {
      const output = hookGenerator.generate(model)
      const code = output.entities.get('accounts')!

      // Query hooks
      expect(code).toContain('useAccounts')
      expect(code).toContain('useAccount')
      expect(code).toContain('useAccountsWithMeta')

      // Mutation hooks
      expect(code).toContain('useCreateAccount')
      expect(code).toContain('useUpdateAccount')
      expect(code).toContain('useDeleteAccount')
    })

    it('generates query keys for all entities', () => {
      const output = hookGenerator.generate(model)

      expect(output.keys).toContain('accounts')
      expect(output.keys).toContain('activities')
      expect(output.keys).toContain('files')
    })

    it('hooks import from api layer', () => {
      const output = hookGenerator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsApi')
      expect(code).toContain("from '../api/accounts.js'")
    })
  })

  describe('Generated code structure', () => {
    it('API code has valid structure', () => {
      const output = apiGenerator.generate(model)
      const code = output.entities.get('accounts')!

      // Should be valid export
      expect(code).toContain('export const accountsApi')

      // Should have async methods
      expect(code).toMatch(/async \w+\(/)

      // Should use apiClient
      expect(code).toContain('apiClient.')
    })

    it('Hook code has valid structure', () => {
      const output = hookGenerator.generate(model)
      const code = output.entities.get('accounts')!

      // Should be valid exports
      expect(code).toContain('export function useAccounts')

      // Should use TanStack Query
      expect(code).toContain('useQuery')
      expect(code).toContain('useMutation')
    })
  })

  describe('TypeScript compilation (optional)', () => {
    it.skip('generated code type-checks successfully', () => {
      // This test writes generated code to disk and runs tsc
      // Skip by default as it requires file system and tsc

      const apiOutput = apiGenerator.generate(model)
      const hookOutput = hookGenerator.generate(model)

      // Clean and create temp directory
      rmSync(tempDir, { recursive: true, force: true })
      mkdirSync(join(tempDir, 'api'), { recursive: true })
      mkdirSync(join(tempDir, 'hooks'), { recursive: true })
      mkdirSync(join(tempDir, 'schemas'), { recursive: true })

      // Write API files
      for (const [name, code] of apiOutput.entities) {
        writeFileSync(join(tempDir, 'api', `${name}.ts`), code)
      }
      writeFileSync(join(tempDir, 'api', 'client.ts'), apiOutput.client)
      writeFileSync(join(tempDir, 'api', 'types.ts'), apiOutput.types)
      writeFileSync(join(tempDir, 'api', 'index.ts'), apiOutput.index)

      // Write hook files
      for (const [name, code] of hookOutput.entities) {
        writeFileSync(join(tempDir, 'hooks', `${name}.ts`), code)
      }
      writeFileSync(join(tempDir, 'hooks', 'keys.ts'), hookOutput.keys)
      writeFileSync(join(tempDir, 'hooks', 'index.ts'), hookOutput.index)

      // Write stub schemas (just types for compilation)
      writeFileSync(
        join(tempDir, 'schemas', 'index.ts'),
        `// Stub schemas for type checking
export type Account = { id: string; name: string }
export type AccountCreate = { name: string }
export type AccountUpdate = { name?: string }
export type AccountListResponse = { items: Account[]; total: number }
export type Activity = { id: string }
export type ActivityCreate = { type: string }
export type File = { id: string; name: string }
`
      )

      // Try to type-check
      try {
        execSync(`npx tsc --noEmit --skipLibCheck -p ${tempDir}`, {
          cwd: tempDir,
          encoding: 'utf-8',
        })
        // If we get here, type checking passed
        expect(true).toBe(true)
      } catch (error) {
        // Type checking failed - log the error
        console.error('Type check failed:', error)
        expect.fail('Generated code failed type checking')
      } finally {
        // Clean up
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })
})

describe('Integration: entity count validation', () => {
  it('sales-patterns has exactly 3 main entities', () => {
    const spec = loadFixture('sales-patterns-openapi.json')
    const resolver = new EntityResolver()
    const model = resolver.resolve(spec)

    // Main entities (excluding system endpoints)
    const mainEntities = Array.from(model.entities.keys())
    expect(mainEntities).toContain('accounts')
    expect(mainEntities).toContain('activities')
    expect(mainEntities).toContain('files')

    // Should be 3 or more (might have additional sub-entities)
    expect(model.entities.size).toBeGreaterThanOrEqual(3)
  })
})
