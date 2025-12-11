/**
 * Generated Code Loader
 *
 * Uses jiti to load TypeScript modules from the user's generated directory
 * at runtime. This allows the TUI to use the generated hooks directly.
 */

import { createJiti } from 'jiti'
import { join } from 'path'

// Create jiti instance for loading TypeScript with ESM support
const jiti = createJiti(import.meta.url, {
  // Interop for ESM/CJS compatibility
  interopDefault: true,
  // Enable ESM syntax support
  esmResolve: true,
})

export interface GeneratedModules {
  /** The entities-hook module with useEntities() */
  entitiesHook: {
    useEntities: () => EntitiesApi
  } | null
  /** Individual entity modules */
  entities: Record<string, EntityModule>
  /** The API client */
  client: {
    apiClient: ApiClient
  } | null
  /** Whether loading succeeded */
  loaded: boolean
  /** Error message if loading failed */
  error: string | null
}

export interface EntitiesApi {
  get: (name: string) => EntityApi | undefined
  [key: string]: EntityApi | ((name: string) => EntityApi | undefined)
}

export interface EntityApi {
  useList?: () => QueryResult
  useListWithMeta?: (options?: { view?: string }) => QueryResultWithMeta
  useOne?: (id: string) => QueryResult
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface EntityModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface QueryResult {
  data: unknown
  isLoading: boolean
  error: Error | null
}

export interface QueryResultWithMeta extends QueryResult {
  columns: ColumnMetadata[]
  isLoadingMetadata: boolean
  metadataError: Error | null
  isReady: boolean
}

export interface ColumnMetadata {
  key: string
  label: string
  type?: string
  sortable?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface ApiClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => Promise<any>
}

/**
 * Load generated modules from the user's project
 *
 * @param generatedDir - Path to generated directory (relative to cwd)
 * @returns Object containing loaded modules or error info
 */
export function loadGeneratedModules(generatedDir: string): GeneratedModules {
  const basePath = join(process.cwd(), generatedDir)

  const result: GeneratedModules = {
    entitiesHook: null,
    entities: {},
    client: null,
    loaded: false,
    error: null,
  }

  try {
    // Load entities-hook.tsx (main entry point)
    try {
      const entitiesHookPath = join(basePath, 'entities-hook.tsx')
      result.entitiesHook = jiti(entitiesHookPath)
    } catch (e) {
      // entities-hook might not exist, try entities-hook.ts
      try {
        const entitiesHookPath = join(basePath, 'entities-hook.ts')
        result.entitiesHook = jiti(entitiesHookPath)
      } catch {
        // Will try loading individual entities
      }
    }

    // Load API client
    try {
      const clientPath = join(basePath, 'client', 'index.ts')
      result.client = jiti(clientPath)
    } catch {
      // Client might be at different path
      try {
        const clientPath = join(basePath, 'client.ts')
        result.client = jiti(clientPath)
      } catch {
        // Client not found
      }
    }

    result.loaded = true
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }

  return result
}

/**
 * Load a specific entity module
 *
 * @param generatedDir - Path to generated directory
 * @param entityName - Name of the entity (e.g., 'accounts')
 * @returns The entity module or null
 */
export function loadEntityModule(
  generatedDir: string,
  entityName: string
): EntityModule | null {
  const basePath = join(process.cwd(), generatedDir)
  const entityPath = join(basePath, 'entities', `${entityName}.ts`)

  try {
    return jiti(entityPath)
  } catch (error) {
    // Log error for debugging
    console.error(`[jiti] Failed to load ${entityPath}:`)
    console.error(error instanceof Error ? error.message : error)

    // Try .tsx extension
    const tsxPath = join(basePath, 'entities', `${entityName}.tsx`)
    try {
      return jiti(tsxPath)
    } catch (error2) {
      console.error(`[jiti] Also failed to load ${tsxPath}:`)
      console.error(error2 instanceof Error ? error2.message : error2)
      return null
    }
  }
}
