/**
 * EntityHookGenerator Tests
 *
 * Tests for unified entity hook generation.
 * These hooks combine TanStack Query (network) with TanStack DB (storage).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { OpenAPIV3 } from 'openapi-types'
import { EntityResolver } from '../../src/core/entity-resolver.js'
import { EntityHookGenerator } from '../../src/core/entity-hook-generator.js'
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

describe('EntityHookGenerator', () => {
  let generator: EntityHookGenerator

  beforeAll(() => {
    generator = new EntityHookGenerator()
  })

  describe('file generation', () => {
    it('generates entity hook files', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.entities.has('accounts')).toBe(true)
    })

    it('generates index file with exports', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)

      expect(output.index).toContain('export')
      // Plural hooks use proper plural form
      expect(output.index).toContain('useAccounts')
      // Singular hooks use PascalCase singular
      expect(output.index).toContain('useAccount')
      expect(output.index).toContain('accountKeys')
    })
  })

  describe('query keys', () => {
    it('generates query key factory', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export const accountKeys')
      expect(code).toContain("all: ['accounts']")
      expect(code).toContain('lists: ()')
      expect(code).toContain('list: (filters?: AccountFilters)')
      expect(code).toContain('details: ()')
      expect(code).toContain('detail: (id: string)')
    })
  })

  describe('types generation', () => {
    it('generates filters type', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export interface AccountFilters')
    })

    it('generates UseEntitiesOptions type', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export interface UseAccountsOptions')
      expect(code).toContain('where?: AccountFilters')
      expect(code).toContain('orderBy?')
      expect(code).toContain('autoRefresh?: boolean')
    })

    it('generates UseEntityOptions type', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export interface UseAccountOptions')
      expect(code).toContain('autoRefresh?: boolean')
    })
  })

  describe('list hook', () => {
    it('generates useEntities hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useAccounts(')
      expect(code).toContain('UseAccountsOptions')
    })

    it('uses useQuery for network fetching', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('useQuery')
      expect(code).toContain('queryKey: accountKeys.list')
    })

    it('uses useLiveQuery for reactive subscription', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('useLiveQuery')
    })

    it('syncs data from API to collection', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsCollection.upsertMany')
    })

    it('includes broadcast invalidation by default', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('useBroadcastInvalidation')
      expect(code).toContain("channel: 'account'")
    })

    it('returns data, isLoading, error, refetch', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('return {')
      expect(code).toContain('data:')
      expect(code).toContain('isLoading:')
      expect(code).toContain('error:')
      expect(code).toContain('refetch:')
    })
  })

  describe('detail hook', () => {
    it('generates useEntity hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useAccount(')
      expect(code).toContain('id: string')
    })

    it('queries single item from collection', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain(".where('id', '=', id)")
      expect(code).toContain('.first()')
    })
  })

  describe('create mutation', () => {
    it('generates useCreateEntity hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useCreateAccount()')
      expect(code).toContain('useMutation')
    })

    it('includes optimistic insert', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onMutate:')
      expect(code).toContain('tempId')
      expect(code).toContain('accountsCollection.insert')
    })

    it('includes rollback on error', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onError:')
      expect(code).toContain('accountsCollection.delete(context.tempId)')
    })

    it('replaces temp with server data on success', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onSuccess:')
      expect(code).toContain('accountsCollection.upsert')
    })

    it('invalidates queries on settled', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onSettled:')
      expect(code).toContain('invalidateQueries')
    })
  })

  describe('update mutation', () => {
    it('generates useUpdateEntity hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useUpdateAccount()')
    })

    it('includes optimistic update with snapshot', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsCollection.findById')
      expect(code).toContain('accountsCollection.update')
      expect(code).toContain('return { previous }')
    })

    it('includes rollback from snapshot on error', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('context?.previous')
      expect(code).toContain('accountsCollection.upsert(context.previous)')
    })
  })

  describe('delete mutation', () => {
    it('generates useDeleteEntity hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('export function useDeleteAccount()')
    })

    it('includes optimistic delete', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsCollection.delete(id)')
    })

    it('includes rollback insert on error', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('accountsCollection.insert(context.previous)')
    })
  })

  describe('imports', () => {
    it('imports from React', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from 'react'")
      expect(code).toContain('useEffect')
      expect(code).toContain('useMemo')
    })

    it('imports from TanStack Query', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '@tanstack/react-query'")
      expect(code).toContain('useQuery')
      expect(code).toContain('useMutation')
      expect(code).toContain('useQueryClient')
    })

    it('imports from TanStack DB', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '@tanstack/db-react'")
      expect(code).toContain('useLiveQuery')
    })

    it('imports collection from collections directory', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '../collections/accounts.js'")
      expect(code).toContain('accountsCollection')
    })

    it('imports API from api directory', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '../api/accounts.js'")
      expect(code).toContain('accountsApi')
    })

    it('imports types from schemas', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("from '../schemas/index.js'")
      expect(code).toContain('type {')
    })
  })

  describe('options', () => {
    it('can disable broadcast integration', () => {
      const gen = new EntityHookGenerator({ broadcastIntegration: false })
      const model = resolveFixture('minimal-crud.json')
      const output = gen.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).not.toContain('useBroadcastInvalidation')
    })

    it('can disable optimistic mutations', () => {
      const gen = new EntityHookGenerator({ optimisticMutations: false })
      const model = resolveFixture('minimal-crud.json')
      const output = gen.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).not.toContain('onMutate:')
    })

    it('can disable JSDoc', () => {
      const gen = new EntityHookGenerator({ includeJSDoc: false })
      const model = resolveFixture('minimal-crud.json')
      const output = gen.generate(model)
      const code = output.entities.get('accounts')!

      // Should not have JSDoc blocks
      expect(code).not.toMatch(/\/\*\*[\s\S]*?@example[\s\S]*?\*\//)
    })
  })

  describe('relationship types', () => {
    it('generates relation type union for include option', () => {
      const model = resolveFixture('with-entity-references.json')
      const output = generator.generate(model)
      const code = output.entities.get('transactions')!

      expect(code).toContain('type TransactionRelation')
      expect(code).toContain("'category'")
      expect(code).toContain("'account'")
    })

    it('uses include option in hooks', () => {
      const model = resolveFixture('with-entity-references.json')
      const output = generator.generate(model)
      const code = output.entities.get('transactions')!

      expect(code).toContain('include?:')
      expect(code).toContain('query.include(relation)')
    })
  })

  describe('multiple entities', () => {
    it('generates hooks for all entities', () => {
      const model = resolveFixture('with-entity-references.json')
      const output = generator.generate(model)

      expect(output.entities.has('transactions')).toBe(true)
      expect(output.entities.has('categories')).toBe(true)
      expect(output.entities.has('accounts')).toBe(true)
    })

    it('index exports all entity hooks', () => {
      const model = resolveFixture('with-entity-references.json')
      const output = generator.generate(model)

      expect(output.index).toContain('useTransactions')
      expect(output.index).toContain('useCategories')
      expect(output.index).toContain('useAccounts')
    })
  })
})
