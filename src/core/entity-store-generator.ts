/**
 * EntityStore Generator
 *
 * Generates a typed runtime facade that provides direct object access
 * for frontend developers without needing hooks.
 *
 * Output structure:
 *   store/
 *     EntityStore.ts          - Main store class with typed accessors
 *     EntityStoreProvider.tsx - React context provider
 *     index.ts                - Re-exports all
 */

import type {
  EntityModel,
  EntityDefinition,
} from './entity-model.js'

export interface GeneratedEntityStore {
  /** EntityStore class */
  store: string
  /** React provider component */
  provider: string
  /** Index file with exports */
  index: string
}

export interface EntityStoreGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<EntityStoreGeneratorOptions> = {
  includeJSDoc: true,
}

export class EntityStoreGenerator {
  private options: Required<EntityStoreGeneratorOptions>

  constructor(options: EntityStoreGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedEntityStore {
    return {
      store: this.generateStore(model),
      provider: this.generateProvider(),
      index: this.generateIndex(),
    }
  }

  /**
   * Generate the EntityStore class
   */
  private generateStore(model: EntityModel): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader())
    lines.push('')

    // Imports
    lines.push(this.generateImports(model))
    lines.push('')

    // EntityStore class
    lines.push(this.generateStoreClass(model))

    return lines.join('\n')
  }

  /**
   * Generate file header
   */
  private generateFileHeader(): string {
    return `/**
 * EntityStore
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * Provides typed facade for entity cache access without hooks.
 * Wraps TanStack Query cache for direct object access.
 */`
  }

  /**
   * Generate imports
   */
  private generateImports(model: EntityModel): string {
    const imports: string[] = []

    // TanStack Query
    imports.push("import type { QueryClient } from '@tanstack/react-query'")
    imports.push('')

    // Type imports - collect all entity types
    const types = Array.from(model.entities.values())
      .filter(e => e.schemas.item)
      .map(e => e.schemas.item!)
      .sort()

    if (types.length > 0) {
      imports.push(`import type { ${types.join(', ')} } from '../schemas/index.js'`)
    }

    // API imports for prefetching
    const apiNames = Array.from(model.entities.keys())
      .map(name => `${name}Api`)
      .sort()

    if (apiNames.length > 0) {
      for (const [name] of model.entities) {
        imports.push(`import { ${name}Api } from '../api/${name}.js'`)
      }
    }

    return imports.join('\n')
  }

  /**
   * Generate the EntityStore class
   */
  private generateStoreClass(model: EntityModel): string {
    const lines: string[] = []

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * EntityStore - Typed facade for entity cache access
 *
 * Provides direct object access to cached entities without needing React hooks.
 * Each entity gets typed accessors: get, getMany, set, prefetch, prefetchMany.
 *
 * @example
 * const store = useEntityStore()
 * const category = store.categories.get(categoryId)
 * store.categories.prefetchMany([id1, id2, id3])
 */
`
      : ''

    lines.push(`${jsdoc}export class EntityStore {
  constructor(private queryClient: QueryClient) {}
`)

    // Generate accessor for each entity
    for (const [name, entity] of model.entities) {
      lines.push('')
      lines.push(this.generateEntityAccessor(name, entity))
    }

    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Generate accessor object for a single entity
   */
  private generateEntityAccessor(name: string, entity: EntityDefinition): string {
    const typeName = entity.schemas.item || entity.pascalName
    const lines: string[] = []

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * ${entity.pascalName} cache accessors
   */
`
      : ''

    lines.push(`${jsdoc}  ${name} = {`)

    // get method
    lines.push(`    /**
     * Get a single ${entity.singular} from cache
     * @param id - The ${entity.singular} ID
     * @returns The cached ${entity.singular} or undefined
     */`)
    lines.push(`    get: (id: string): ${typeName} | undefined => {`)
    lines.push(`      return this.queryClient.getQueryData<${typeName}>(['${name}', id])`)
    lines.push(`    },`)
    lines.push('')

    // getMany method
    lines.push(`    /**
     * Get multiple ${name} from cache
     * @param ids - Array of ${entity.singular} IDs
     * @returns Array of cached ${name} (undefined entries filtered out)
     */`)
    lines.push(`    getMany: (ids: string[]): ${typeName}[] => {`)
    lines.push(`      return ids`)
    lines.push(`        .map(id => this.queryClient.getQueryData<${typeName}>(['${name}', id]))`)
    lines.push(`        .filter((item): item is ${typeName} => item !== undefined)`)
    lines.push(`    },`)
    lines.push('')

    // set method
    lines.push(`    /**
     * Set a ${entity.singular} in cache
     * @param entity - The ${entity.singular} to cache
     */`)
    lines.push(`    set: (entity: ${typeName}): void => {`)
    lines.push(`      this.queryClient.setQueryData(['${name}', entity.id], entity)`)
    lines.push(`    },`)
    lines.push('')

    // Only generate prefetch methods if entity has a get operation
    if (entity.operations.get) {
      // prefetch method
      lines.push(`    /**
     * Prefetch a single ${entity.singular} if not already cached
     * @param id - The ${entity.singular} ID to prefetch
     */`)
      lines.push(`    prefetch: async (id: string): Promise<void> => {`)
      lines.push(`      if (this.${name}.get(id)) return // Already cached`)
      lines.push(`      await this.queryClient.prefetchQuery({`)
      lines.push(`        queryKey: ['${name}', id],`)
      lines.push(`        queryFn: () => ${name}Api.get(id),`)
      lines.push(`        staleTime: Infinity,`)
      lines.push(`      })`)
      lines.push(`    },`)
      lines.push('')

      // prefetchMany method
      lines.push(`    /**
     * Prefetch multiple ${name} if not already cached
     * @param ids - Array of ${entity.singular} IDs to prefetch
     */`)
      lines.push(`    prefetchMany: async (ids: string[]): Promise<void> => {`)
      lines.push(`      const uncached = [...new Set(ids)].filter(id => !this.${name}.get(id))`)
      lines.push(`      if (uncached.length === 0) return`)
      lines.push(``)
      lines.push(`      // Prefetch individually (batch endpoint would be more efficient)`)
      lines.push(`      await Promise.all(`)
      lines.push(`        uncached.map(id =>`)
      lines.push(`          this.queryClient.prefetchQuery({`)
      lines.push(`            queryKey: ['${name}', id],`)
      lines.push(`            queryFn: () => ${name}Api.get(id),`)
      lines.push(`            staleTime: Infinity,`)
      lines.push(`          }).catch(error => {`)
      lines.push(`            // Log but don't throw - prefetch failures are non-critical`)
      lines.push(`            console.warn(\`[EntityStore] Failed to prefetch ${entity.singular} \${id}:\`, error)`)
      lines.push(`          })`)
      lines.push(`        )`)
      lines.push(`      )`)
      lines.push(`    },`)
    }

    lines.push(`  }`)

    return lines.join('\n')
  }

  /**
   * Generate the React provider component
   */
  private generateProvider(): string {
    return `/**
 * EntityStore Provider
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * React context provider for EntityStore.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EntityStore } from './EntityStore.js'

const EntityStoreContext = createContext<EntityStore | null>(null)

/**
 * Provider component for EntityStore
 *
 * @example
 * <QueryClientProvider client={queryClient}>
 *   <EntityStoreProvider>
 *     <App />
 *   </EntityStoreProvider>
 * </QueryClientProvider>
 */
export function EntityStoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const store = useMemo(() => new EntityStore(queryClient), [queryClient])

  return (
    <EntityStoreContext.Provider value={store}>
      {children}
    </EntityStoreContext.Provider>
  )
}

/**
 * Hook to access EntityStore
 *
 * Must be used within EntityStoreProvider.
 *
 * @example
 * const store = useEntityStore()
 * const category = store.categories.get(categoryId)
 */
export function useEntityStore(): EntityStore {
  const store = useContext(EntityStoreContext)
  if (!store) {
    throw new Error('useEntityStore must be used within EntityStoreProvider')
  }
  return store
}
`
  }

  /**
   * Generate index file
   */
  private generateIndex(): string {
    return `/**
 * EntityStore Module
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 */

export { EntityStore } from './EntityStore.js'
export { EntityStoreProvider, useEntityStore } from './EntityStoreProvider.js'
`
  }
}
