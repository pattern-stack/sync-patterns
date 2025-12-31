/**
 * Column Hook Generator
 *
 * Generates React hooks for fetching dynamic column metadata at runtime.
 * These hooks use TanStack Query with aggressive caching and return
 * static base columns as placeholder data for instant rendering.
 */

import type {
  EntityModel,
  EntityDefinition,
} from '../core/entity-model.js'

export interface GeneratedColumnHooks {
  /** Per-entity hook files: Map<entityName, fileContent> */
  hooks: Map<string, string>
  /** Barrel export file content */
  index: string
}

export interface ColumnHookGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ColumnHookGeneratorOptions> = {
  includeJSDoc: true,
}

export class ColumnHookGenerator {
  private options: Required<ColumnHookGeneratorOptions>

  constructor(options: ColumnHookGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedColumnHooks {
    const hooks = new Map<string, string>()

    // Generate hook file for each entity with column metadata
    for (const [entityName, entity] of model.entities) {
      if (entity.columnMetadata && entity.columnMetadata.length > 0) {
        hooks.set(entityName, this.generateEntityHookFile(entity))
      }
    }

    return {
      hooks,
      index: this.generateIndexFile(model.entities),
    }
  }

  /**
   * Generate hook file for a single entity
   */
  private generateEntityHookFile(entity: EntityDefinition): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader(entity.pascalName))
    lines.push('')

    // Imports
    lines.push("import { useQuery, type UseQueryOptions } from '@tanstack/react-query'")
    lines.push(`import { ${entity.singular}BaseColumns } from '../columns/${entity.singular}.columns.js'`)
    lines.push("import type { ColumnMetadataResponse } from '../columns/types.js'")
    lines.push("import { getApiUrl, getAuthToken } from '../config.js'")
    lines.push('')

    // Query defaults for column metadata (aggressive caching)
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Query defaults for column metadata')
      lines.push(' * Columns rarely change, so we cache aggressively.')
      lines.push(' */')
    }
    lines.push('const columnQueryDefaults = {')
    lines.push('  staleTime: 1000 * 60 * 30,      // 30 minutes')
    lines.push('  gcTime: 1000 * 60 * 60 * 24,    // 24 hours')
    lines.push('  retry: 1,')
    lines.push('  refetchOnWindowFocus: false,')
    lines.push('  refetchOnMount: false,')
    lines.push('}')
    lines.push('')

    // Options interface
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Options for use${entity.pascalName}Columns hook`)
      lines.push(' */')
    }
    lines.push(`export interface Use${entity.pascalName}ColumnsOptions {`)
    lines.push('  /** Include organization custom fields (default: true) */')
    lines.push('  includeOrg?: boolean')
    lines.push('  /** Include user custom fields (default: true) */')
    lines.push('  includeUser?: boolean')
    lines.push('  /** Include external fields from integrations */')
    lines.push('  includeExternal?: string[]')
    lines.push('  /** View context (default: "list") */')
    lines.push("  view?: 'list' | 'detail' | 'form'")
    lines.push('  /** Additional TanStack Query options */')
    lines.push('  queryOptions?: Omit<UseQueryOptions<ColumnMetadataResponse>, "queryKey" | "queryFn" | "placeholderData">')
    lines.push('}')
    lines.push('')

    // Main hook
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Fetch dynamic column metadata for ${entity.pascalName}`)
      lines.push(' *')
      lines.push(' * Returns static base columns immediately (placeholderData) while')
      lines.push(' * fetching dynamic columns (org/user/external fields) in the background.')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * ```tsx')
      lines.push(` * const { columns, isLoading } = use${entity.pascalName}Columns()`)
      lines.push(' *')
      lines.push(' * // With options:')
      lines.push(` * const { columns } = use${entity.pascalName}Columns({`)
      lines.push(" *   view: 'detail',")
      lines.push(' *   includeExternal: ["salesforce"],')
      lines.push(' * })')
      lines.push(' * ```')
      lines.push(' */')
    }
    lines.push(`export function use${entity.pascalName}Columns(options: Use${entity.pascalName}ColumnsOptions = {}) {`)
    lines.push('  const {')
    lines.push('    includeOrg = true,')
    lines.push('    includeUser = true,')
    lines.push('    includeExternal,')
    lines.push("    view = 'list',")
    lines.push('    queryOptions,')
    lines.push('  } = options')
    lines.push('')
    lines.push('  const query = useQuery({')
    lines.push(`    queryKey: ['${entity.singular}', 'columns', { view, includeOrg, includeUser, includeExternal }],`)
    lines.push('    queryFn: async (): Promise<ColumnMetadataResponse> => {')
    lines.push('      const params = new URLSearchParams()')
    lines.push('      params.set("view", view)')
    lines.push('      if (!includeOrg) params.set("include_org", "false")')
    lines.push('      if (!includeUser) params.set("include_user", "false")')
    lines.push('      if (includeExternal?.length) {')
    lines.push('        params.set("include_external", includeExternal.join(","))')
    lines.push('      }')
    lines.push('')
    lines.push(`      const url = \`\${getApiUrl()}/${entity.name}/columns?\${params.toString()}\``)
    lines.push('      const token = getAuthToken()')
    lines.push('')
    lines.push('      const response = await fetch(url, {')
    lines.push("        method: 'GET',")
    lines.push('        headers: {')
    lines.push("          'Content-Type': 'application/json',")
    lines.push("          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),")
    lines.push('        },')
    lines.push('      })')
    lines.push('')
    lines.push('      if (!response.ok) {')
    lines.push('        throw new Error(`Failed to fetch column metadata: ${response.status}`)')
    lines.push('      }')
    lines.push('')
    lines.push('      return response.json()')
    lines.push('    },')
    lines.push('    ...columnQueryDefaults,')
    lines.push('    // Static columns as placeholder - renders instantly')
    lines.push('    placeholderData: {')
    lines.push(`      columns: ${entity.singular}BaseColumns,`)
    lines.push(`      entity: '${entity.singular}',`)
    lines.push('      view,')
    lines.push("      version: '1.0',")
    lines.push('    },')
    lines.push('    ...queryOptions,')
    lines.push('  })')
    lines.push('')
    lines.push('  return {')
    lines.push('    /** Column metadata (static until dynamic loads) */')
    lines.push('    columns: query.data?.columns ?? [],')
    lines.push('    /** Full response including entity and view info */')
    lines.push('    data: query.data,')
    lines.push('    /** Whether initial load is in progress */')
    lines.push('    isLoading: query.isLoading,')
    lines.push('    /** Whether background refresh is in progress */')
    lines.push('    isFetching: query.isFetching,')
    lines.push('    /** Whether using placeholder data */')
    lines.push('    isPlaceholder: query.isPlaceholderData,')
    lines.push('    /** Any error that occurred */')
    lines.push('    error: query.error,')
    lines.push('    /** Refetch columns */')
    lines.push('    refetch: query.refetch,')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate barrel export file
   */
  private generateIndexFile(entities: Map<string, EntityDefinition>): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Column Hook Exports'))
    lines.push('')

    // Get entities with column metadata
    const entitiesWithColumns = Array.from(entities.entries())
      .filter(([_, e]) => e.columnMetadata && e.columnMetadata.length > 0)
      .sort((a, b) => a[0].localeCompare(b[0]))

    // Export each entity's hook
    for (const [entityName, entity] of entitiesWithColumns) {
      lines.push(`export * from './use${entity.pascalName}Columns.js'`)
    }
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate file header comment
   */
  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }
}

/**
 * Factory function for generating column hooks
 */
export function generateColumnHooks(
  model: EntityModel,
  options?: ColumnHookGeneratorOptions
): GeneratedColumnHooks {
  const generator = new ColumnHookGenerator(options)
  return generator.generate(model)
}
