/**
 * HookGenerator Tests
 *
 * Tests for the React hooks generator.
 * Hooks wrap the API layer and provide TanStack Query integration.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { OpenAPIV3 } from 'openapi-types'
import { EntityResolver } from '../../src/core/entity-resolver.js'
import { HookGenerator } from '../../src/core/hook-generator.js'
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

describe('HookGenerator', () => {
  let generator: HookGenerator

  beforeAll(() => {
    generator = new HookGenerator()
  })

  describe('file generation', () => {
    it('generates entity-grouped hook files', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
    })

    it('generates query keys file', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.keys).toContain('queryKeys')
      expect(output.keys).toContain('accounts')
    })

    it('generates index file with exports', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.index).toContain('export')
      expect(output.index).toContain('useAccounts')
    })
  })

  describe('query hook generation', () => {
    it('generates useList hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useAccounts(')
      expect(code).toContain('useQuery')
    })

    it('generates useGet hook with id parameter', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useAccount(')
      expect(code).toMatch(/useAccount\([^)]*id:\s*string/)
    })

    it('query hooks call api layer', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsApi.list()')
      expect(code).toContain('accountsApi.get(id)')
    })

    it('query hooks use correct query keys', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('queryKeys.accounts.all')
      expect(code).toContain('queryKeys.accounts.detail(id)')
    })
  })

  describe('mutation hook generation', () => {
    it('generates useCreate mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useCreateAccount(')
      expect(code).toContain('useMutation')
    })

    it('generates useUpdate mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useUpdateAccount(')
    })

    it('generates useDelete mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useDeleteAccount(')
    })

    it('mutation hooks call api layer', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsApi.create(')
      expect(code).toContain('accountsApi.update(')
      expect(code).toContain('accountsApi.delete(')
    })

    it('mutations invalidate queries on success', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onSuccess')
      expect(code).toContain('invalidateQueries')
    })
  })

  describe('useListWithMeta hook', () => {
    it('generates useListWithMeta when metadata endpoint exists', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useAccountsWithMeta(')
    })

    it('useListWithMeta returns columns in addition to data', () => {
      const model = resolveFixture('with-custom-operations.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('columns')
      expect(code).toContain('isLoadingMetadata')
    })
  })

  describe('query keys', () => {
    it('generates all query key for list', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.keys).toContain("all: ['accounts']")
    })

    it('generates detail query key factory', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.keys).toContain('detail: (id: string)')
      expect(output.keys).toContain("'accounts'")
    })
  })

  describe('imports', () => {
    it('imports from TanStack Query', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '@tanstack/react-query'")
      expect(code).toContain('useQuery')
      expect(code).toContain('useMutation')
    })

    it('imports from api layer', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '../api/accounts.js'")
      expect(code).toContain('accountsApi')
    })

    it('imports query keys', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from './keys.js'")
      expect(code).toContain('queryKeys')
    })
  })

  describe('multiple entities', () => {
    it('generates hooks for each entity', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
      expect(output.entities.has('contacts')).toBe(true)
      expect(output.entities.has('files')).toBe(true)
    })

    it('index exports all hooks', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)

      expect(output.index).toContain('useAccounts')
      expect(output.index).toContain('useContacts')
      expect(output.index).toContain('useFiles')
    })
  })

  describe('TypeScript types', () => {
    it('hooks have proper return types', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('UseQueryResult')
    })

    it('mutations have proper types', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('UseMutationResult')
    })
  })

  describe('code quality', () => {
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
