/**
 * HookGenerator Tests
 *
 * Tests for the React hooks generator.
 * Hooks wrap the API layer and provide TanStack Query integration.
 *
 * Phase 3 (SYNC-012) additions:
 * - Optimistic mutation generation tests
 * - Broadcast integration tests
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
  let generatorWithoutOptimistic: HookGenerator
  let generatorWithoutBroadcast: HookGenerator

  beforeAll(() => {
    generator = new HookGenerator()
    generatorWithoutOptimistic = new HookGenerator({ optimisticMutations: false })
    generatorWithoutBroadcast = new HookGenerator({ broadcastIntegration: false })
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

    it('mutations invalidate queries on settled', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      // Optimistic mutations use onSettled for invalidation
      // This ensures sync with server on both success and error
      expect(code).toContain('onSettled')
      expect(code).toContain('invalidateQueries')
    })

    it('non-optimistic mutations use onSuccess for invalidation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generatorWithoutOptimistic.generate(model)
      const code = output.entities.get('accounts')!

      // Non-optimistic mutations use onSuccess for invalidation
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

  // ===== PHASE 3 (SYNC-012) TESTS =====

  describe('optimistic mutations', () => {
    it('generates onMutate for create mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onMutate: async (newData)')
      expect(code).toContain('cancelQueries')
      expect(code).toContain('previousData')
    })

    it('generates onError with rollback for create mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onError: (_err, _newData, context)')
      expect(code).toContain('context?.previousData')
    })

    it('generates onSettled for create mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onSettled: ()')
      expect(code).toContain('invalidateQueries')
    })

    it('generates optimistic update for update mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onMutate: async ({ id, data })')
      expect(code).toContain('updated_at: new Date().toISOString()')
    })

    it('generates optimistic remove for delete mutation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('onMutate: async (id)')
      expect(code).toContain('removeQueries')
    })

    it('handles both array and paginated response formats in create', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('if (Array.isArray(old))')
      expect(code).toContain("if ('items' in old")
    })

    it('disables optimistic mutations when option is false', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generatorWithoutOptimistic.generate(model)
      const code = output.entities.get('accounts')!

      // Should use simpler onSuccess pattern instead
      expect(code).toContain('onSuccess: ()')
      expect(code).not.toContain('onMutate: async (newData)')
    })

    it('includes temp ID generation for optimistic create', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('crypto.randomUUID()')
      expect(code).toContain('created_at: new Date().toISOString()')
    })
  })

  describe('broadcast integration', () => {
    it('imports useBroadcastInvalidation', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain("import { useBroadcastInvalidation }")
      expect(code).toContain("from '@pattern-stack/sync-patterns/runtime'")
    })

    it('generates list hook with autoRefresh option', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('interface UseAccountsOptions')
      expect(code).toContain('autoRefresh?: boolean')
      expect(code).toContain('options: UseAccountsOptions = {}')
    })

    it('calls useBroadcastInvalidation in list hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('useBroadcastInvalidation({')
      expect(code).toContain("channel: 'account'")
      expect(code).toContain('queryKeyPrefix: queryKeys.accounts.all')
      expect(code).toContain('enabled: autoRefresh')
    })

    it('generates get hook with autoRefresh option', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('interface UseAccountOptions')
      expect(code).toContain('id: string, options: UseAccountOptions')
    })

    it('calls useBroadcastInvalidation in get hook', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).toContain('queryKeyPrefix: queryKeys.accounts.detail(id)')
      expect(code).toContain('enabled: autoRefresh && !!id')
    })

    it('disables broadcast integration when option is false', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generatorWithoutBroadcast.generate(model)
      const code = output.entities.get('accounts')!

      expect(code).not.toContain('useBroadcastInvalidation')
      expect(code).not.toContain('autoRefresh')
    })

    it('uses entity singular name as broadcast channel', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      expect(contactsCode).toContain("channel: 'contact'")
    })
  })

  describe('broadcast on mutations', () => {
    it('imports useBroadcast for realtime entities with mutations', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      // Contacts is realtime mode with mutations, should import useBroadcast
      expect(contactsCode).toContain("import { useBroadcast }")
      expect(contactsCode).toContain("from '@pattern-stack/sync-patterns/runtime'")
    })

    it('does not import useBroadcast for non-realtime entities', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generator.generate(model)
      const accountsCode = output.entities.get('accounts')!

      // Accounts is api mode (default), should NOT import useBroadcast for emit
      expect(accountsCode).not.toContain("import { useBroadcast }")
    })

    it('emits broadcast event on create mutation success for realtime entities', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      // Should use useBroadcast and emit on create success
      expect(contactsCode).toContain("const { emit } = useBroadcast()")
      expect(contactsCode).toContain("emit('contact'")
      expect(contactsCode).toContain("type: 'created'")
    })

    it('emits broadcast event on update mutation success for realtime entities', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      // Should emit on update success
      expect(contactsCode).toContain("type: 'updated'")
    })

    it('emits broadcast event on delete mutation success for realtime entities', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      // Should emit on delete success
      expect(contactsCode).toContain("type: 'deleted'")
    })

    it('includes entity_id in broadcast payload', () => {
      const model = resolveFixture('with-sync-modes.json')
      const output = generator.generate(model)
      const contactsCode = output.entities.get('contacts')!

      expect(contactsCode).toContain("entity_id:")
    })

    it('can disable broadcast on mutations via option', () => {
      const generatorNoBroadcast = new HookGenerator({ broadcastOnMutations: false })
      const model = resolveFixture('with-sync-modes.json')
      const output = generatorNoBroadcast.generate(model)
      const contactsCode = output.entities.get('contacts')!

      // Should not import useBroadcast for emit
      expect(contactsCode).not.toContain("const { emit } = useBroadcast()")
    })
  })

  describe('backward compatibility', () => {
    it('still generates working hooks without new features', () => {
      const model = resolveFixture('minimal-crud.json')
      const output = generatorWithoutOptimistic.generate(model)
      const code = output.entities.get('accounts')!

      // Core functionality still works
      expect(code).toContain('export function useAccounts(')
      expect(code).toContain('export function useAccount(')
      expect(code).toContain('export function useCreateAccount(')
      expect(code).toContain('useMutation')
      expect(code).toContain('useQuery')
    })

    it('supports both optimistic and non-optimistic generators', () => {
      const model = resolveFixture('minimal-crud.json')

      const optimisticOutput = generator.generate(model)
      const simpleOutput = generatorWithoutOptimistic.generate(model)

      const optimisticCode = optimisticOutput.entities.get('accounts')!
      const simpleCode = simpleOutput.entities.get('accounts')!

      // Optimistic version has more complex mutation handling
      expect(optimisticCode.length).toBeGreaterThan(simpleCode.length)
      expect(optimisticCode).toContain('onMutate')
      expect(simpleCode).not.toContain('onMutate: async')
    })
  })
})
