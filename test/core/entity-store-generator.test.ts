/**
 * EntityStore Generator Tests
 */

import { describe, it, expect } from 'vitest'
import { EntityStoreGenerator } from '../../src/core/entity-store-generator.js'
import { createEmptyEntityModel, createEmptyEntityDefinition } from '../../src/core/entity-model.js'

describe('EntityStoreGenerator', () => {
  it('generates EntityStore class with entity accessors', () => {
    const model = createEmptyEntityModel()

    // Add categories entity with get operation
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    categories.operations.get = { operationId: 'getCategory', method: 'get', path: '/categories/{id}', parameters: [] }
    model.entities.set('categories', categories)

    // Add accounts entity with get operation
    const accounts = createEmptyEntityDefinition('accounts')
    accounts.schemas.item = 'Account'
    accounts.operations.get = { operationId: 'getAccount', method: 'get', path: '/accounts/{id}', parameters: [] }
    model.entities.set('accounts', accounts)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check that files are generated
    expect(result.store).toBeTruthy()
    expect(result.provider).toBeTruthy()
    expect(result.index).toBeTruthy()

    // Check store file content
    expect(result.store).toContain('export class EntityStore')
    expect(result.store).toContain('constructor(private queryClient: QueryClient)')

    // Check categories accessor
    expect(result.store).toContain('categories = {')
    expect(result.store).toContain('get: (id: string): Category | undefined')
    expect(result.store).toContain('getMany: (ids: string[]): Category[]')
    expect(result.store).toContain('set: (entity: Category): void')
    expect(result.store).toContain('prefetch: async (id: string): Promise<void>')
    expect(result.store).toContain('prefetchMany: async (ids: string[]): Promise<void>')

    // Check accounts accessor
    expect(result.store).toContain('accounts = {')
    expect(result.store).toContain('get: (id: string): Account | undefined')
    expect(result.store).toContain('getMany: (ids: string[]): Account[]')

    // Check imports
    expect(result.store).toContain("import type { QueryClient } from '@tanstack/react-query'")
    expect(result.store).toContain("import type { Account, Category } from '../schemas/index.js'")
    expect(result.store).toContain("import { categoriesApi } from '../api/categories.js'")
    expect(result.store).toContain("import { accountsApi } from '../api/accounts.js'")
  })

  it('generates provider component', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check provider content
    expect(result.provider).toContain('export function EntityStoreProvider')
    expect(result.provider).toContain('export function useEntityStore')
    expect(result.provider).toContain('EntityStoreContext')
    expect(result.provider).toContain('useQueryClient')
    expect(result.provider).toContain('new EntityStore(queryClient)')
  })

  it('generates index file with exports', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check index content
    expect(result.index).toContain("export { EntityStore } from './EntityStore.js'")
    expect(result.index).toContain("export { EntityStoreProvider, useEntityStore } from './EntityStoreProvider.js'")
  })

  it('generates correct query keys', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    // Add get operation so prefetch with queryKey is generated
    categories.operations.get = { operationId: 'getCategory', method: 'get', path: '/categories/{id}', parameters: [] }
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check that query keys match the TanStack Query convention
    expect(result.store).toContain("['categories', id]")
    expect(result.store).toContain("queryKey: ['categories', id]")
  })

  it('handles entities without item schema gracefully', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    // No schemas.item set - should use pascalName
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Should use PascalCase entity name as type
    expect(result.store).toContain('get: (id: string): Category | undefined')
  })

  it('generates prefetchMany with deduplication when entity has get operation', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    // Add get operation so prefetch methods are generated
    categories.operations.get = { operationId: 'getCategory', method: 'get', path: '/categories/{id}', parameters: [] }
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check prefetchMany logic
    expect(result.store).toContain('const uncached = [...new Set(ids)].filter(id => !this.categories.get(id))')
    expect(result.store).toContain('if (uncached.length === 0) return')
    expect(result.store).toContain('await Promise.all(')
  })

  it('does not generate prefetch methods when entity lacks get operation', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    // No get operation - only list
    categories.operations.list = { operationId: 'listCategories', method: 'get', path: '/categories', parameters: [] }
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Should have get/getMany/set but NOT prefetch
    expect(result.store).toContain('get: (id: string)')
    expect(result.store).toContain('getMany: (ids: string[])')
    expect(result.store).toContain('set: (entity: Category)')
    expect(result.store).not.toContain('prefetch:')
    expect(result.store).not.toContain('prefetchMany:')
  })

  it('generates proper error handling in prefetchMany', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    // Add get operation so prefetch methods are generated
    categories.operations.get = { operationId: 'getCategory', method: 'get', path: '/categories/{id}', parameters: [] }
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check that prefetch errors are caught and logged
    expect(result.store).toContain('.catch(error => {')
    expect(result.store).toContain('console.warn')
    expect(result.store).toContain('Failed to prefetch')
  })

  it('can disable JSDoc comments', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator({ includeJSDoc: false })
    const result = generator.generate(model)

    // Should not have long JSDoc at class level (file header is always present)
    // Check that the specific class JSDoc is missing
    expect(result.store).not.toContain('* EntityStore - Typed facade for entity cache access')
  })

  it('generates TypeScript with proper type safety', () => {
    const model = createEmptyEntityModel()
    const categories = createEmptyEntityDefinition('categories')
    categories.schemas.item = 'Category'
    model.entities.set('categories', categories)

    const generator = new EntityStoreGenerator()
    const result = generator.generate(model)

    // Check type guards in getMany
    expect(result.store).toContain('.filter((item): item is Category => item !== undefined)')

    // Check return types
    expect(result.store).toContain('get: (id: string): Category | undefined')
    expect(result.store).toContain('getMany: (ids: string[]): Category[]')
    expect(result.store).toContain('set: (entity: Category): void')
  })
})
