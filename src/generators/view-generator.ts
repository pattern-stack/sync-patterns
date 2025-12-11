/**
 * View Generator
 *
 * Generates React components that wire entity hooks to TUI DataTable/DetailView components.
 * Creates per-entity view components and an index with lookup maps.
 *
 * Key design decisions:
 * 1. Generate TableView and DetailView for each entity
 * 2. TableView uses use{Entity}sWithMeta() for data + metadata
 * 3. DetailView uses use{Entity}() for single record
 * 4. Index exports lookup maps (tableViews, detailViews)
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'
import { cleanOperationId } from './naming.js'

export interface GeneratedViews {
  /** Map of entity name to table view code */
  tableViews: Map<string, string>
  /** Map of entity name to detail view code */
  detailViews: Map<string, string>
  /** Combined index file with lookup maps */
  index: string
}

export interface ViewGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ViewGeneratorOptions> = {
  includeJSDoc: true,
}

/**
 * Information about an entity extracted from endpoints
 */
interface EntityInfo {
  name: string           // singular: "account"
  namePlural: string     // plural: "accounts"
  pascalName: string     // "Account"
  hasList: boolean
  hasGet: boolean
}

export class ViewGenerator {
  private options: Required<ViewGeneratorOptions>

  constructor(options: ViewGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedViews {
    const tableViews = new Map<string, string>()
    const detailViews = new Map<string, string>()
    const entities = this.getEntityInfo(parsedAPI.endpoints)

    for (const entity of entities) {
      // Generate table view if entity has list operation
      if (entity.hasList) {
        const tableViewCode = this.generateTableView(entity)
        tableViews.set(entity.namePlural, tableViewCode)
      }

      // Generate detail view if entity has get operation
      if (entity.hasGet) {
        const detailViewCode = this.generateDetailView(entity)
        detailViews.set(entity.namePlural, detailViewCode)
      }
    }

    // Generate index file
    const index = this.generateIndex(entities)

    return { tableViews, detailViews, index }
  }

  /**
   * Extract entity information from endpoints
   */
  private getEntityInfo(endpoints: ParsedEndpoint[]): EntityInfo[] {
    const entityMap = new Map<string, EntityInfo>()

    for (const endpoint of endpoints) {
      // Extract entity name from path
      const entityNamePlural = this.extractEntityName(endpoint.path)
      if (!entityNamePlural) continue

      // Get or create entity info
      let entityInfo = entityMap.get(entityNamePlural)
      if (!entityInfo) {
        const singular = this.singularize(entityNamePlural)
        entityInfo = {
          name: singular,
          namePlural: entityNamePlural,
          pascalName: this.toPascalCase(singular),
          hasList: false,
          hasGet: false,
        }
        entityMap.set(entityNamePlural, entityInfo)
      }

      // Detect operation type
      const opType = this.detectOperationType(endpoint, entityInfo.name)
      if (opType === 'list') entityInfo.hasList = true
      if (opType === 'get') entityInfo.hasGet = true
    }

    return Array.from(entityMap.values())
  }

  /**
   * Detect operation type from endpoint
   */
  private detectOperationType(
    endpoint: ParsedEndpoint,
    entityName: string
  ): 'list' | 'get' | null {
    if (!endpoint.operationId) return null

    const cleanId = cleanOperationId(endpoint.operationId)
    const parts = cleanId.split('_')
    const action = parts[0]?.toLowerCase()

    // Check if this operation is for this entity
    const entityInOpId = parts.slice(1).join('_').toLowerCase()
    const entityMatches =
      entityInOpId === entityName.toLowerCase() ||
      entityInOpId === this.pluralize(entityName).toLowerCase() ||
      entityInOpId.startsWith(entityName.toLowerCase() + '_') ||
      entityInOpId.startsWith(this.pluralize(entityName).toLowerCase() + '_')

    if (!entityMatches && action !== 'search') {
      if (action === 'search' && parts[1]?.toLowerCase() === this.pluralize(entityName).toLowerCase()) {
        // search_accounts → list operation for accounts
      } else {
        return null
      }
    }

    const hasPathParam = endpoint.path.includes('{')

    switch (action) {
      case 'list':
      case 'search':
        return 'list'
      case 'get':
        return hasPathParam ? 'get' : null
      default:
        return null
    }
  }

  /**
   * Generate table view component for an entity
   */
  private generateTableView(entity: EntityInfo): string {
    const { namePlural, pascalName } = entity
    const lines: string[] = []

    lines.push(this.generateFileHeader(`${pascalName} Table View`))
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * ${pascalName} Table View Component`)
      lines.push(' *')
      lines.push(` * Wires use${pascalName}sWithMeta() hook to DataTable component.`)
      lines.push(' * Fetches data and column metadata, displays in interactive table.')
      lines.push(' */')
    }

    lines.push('')
    lines.push("import React from 'react'")
    lines.push(`import { use${pascalName}sWithMeta } from '../entities/${this.toKebabCase(namePlural)}'`)
    lines.push("import DataTable from '../../tui/components/DataTable'")
    lines.push('')

    lines.push(`export interface ${pascalName}TableViewProps {`)
    lines.push('  onSelect: (row: Record<string, unknown>) => void')
    lines.push('  onBack: () => void')
    lines.push('  pageSize: number')
    lines.push('}')
    lines.push('')

    lines.push(`export function ${pascalName}TableView({ onSelect, onBack, pageSize }: ${pascalName}TableViewProps) {`)
    lines.push(`  const { data, columns, isReady } = use${pascalName}sWithMeta()`)
    lines.push('')
    lines.push('  return (')
    lines.push('    <DataTable')
    lines.push(`      entityName="${namePlural}"`)
    lines.push('      data={data ?? []}')
    lines.push('      columns={columns}')
    lines.push('      loading={!isReady}')
    lines.push('      onSelect={onSelect}')
    lines.push('      onBack={onBack}')
    lines.push('      pageSize={pageSize}')
    lines.push('    />')
    lines.push('  )')
    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Generate detail view component for an entity
   */
  private generateDetailView(entity: EntityInfo): string {
    const { namePlural, pascalName } = entity
    const lines: string[] = []

    lines.push(this.generateFileHeader(`${pascalName} Detail View`))
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * ${pascalName} Detail View Component`)
      lines.push(' *')
      lines.push(` * Wires use${pascalName}() hook to DetailView component.`)
      lines.push(' * Fetches single record by ID, displays in detail view.')
      lines.push(' */')
    }

    lines.push('')
    lines.push("import React from 'react'")
    lines.push(`import { use${pascalName} } from '../entities/${this.toKebabCase(namePlural)}'`)
    lines.push("import DetailView from '../../tui/components/DetailView'")
    lines.push('')

    lines.push(`export interface ${pascalName}DetailViewProps {`)
    lines.push('  id: string')
    lines.push('  onBack: () => void')
    lines.push('}')
    lines.push('')

    lines.push(`export function ${pascalName}DetailView({ id, onBack }: ${pascalName}DetailViewProps) {`)
    lines.push(`  const { data, isLoading } = use${pascalName}(id)`)
    lines.push('')
    lines.push('  return (')
    lines.push('    <DetailView')
    lines.push(`      entityName="${namePlural}"`)
    lines.push('      data={data ?? {}}')
    lines.push('      loading={isLoading}')
    lines.push('      onBack={onBack}')
    lines.push('    />')
    lines.push('  )')
    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Generate index file with lookup maps
   */
  private generateIndex(entities: EntityInfo[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Generated Views Index'))
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Generated view components index')
      lines.push(' *')
      lines.push(' * Exports lookup maps for dynamic entity view rendering:')
      lines.push(' * - tableViews: Map of entity name to TableView component')
      lines.push(' * - detailViews: Map of entity name to DetailView component')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * const TableView = tableViews[entityName]')
      lines.push(' * if (TableView) {')
      lines.push(' *   return <TableView onSelect={...} onBack={...} pageSize={25} />')
      lines.push(' * }')
      lines.push(' */')
    }

    lines.push('')
    lines.push("import { ComponentType } from 'react'")
    lines.push('')

    // Import all table views
    const entitiesWithList = entities.filter(e => e.hasList)
    for (const entity of entitiesWithList) {
      const kebabName = this.toKebabCase(entity.namePlural)
      lines.push(`import { ${entity.pascalName}TableView } from './${kebabName}-table-view'`)
    }
    if (entitiesWithList.length > 0) lines.push('')

    // Import all detail views
    const entitiesWithGet = entities.filter(e => e.hasGet)
    for (const entity of entitiesWithGet) {
      const kebabName = this.toKebabCase(entity.namePlural)
      lines.push(`import { ${entity.pascalName}DetailView } from './${kebabName}-detail-view'`)
    }
    if (entitiesWithGet.length > 0) lines.push('')

    // Props interfaces
    lines.push('export interface TableViewProps {')
    lines.push('  onSelect: (row: Record<string, unknown>) => void')
    lines.push('  onBack: () => void')
    lines.push('  pageSize: number')
    lines.push('}')
    lines.push('')

    lines.push('export interface DetailViewProps {')
    lines.push('  id: string')
    lines.push('  onBack: () => void')
    lines.push('}')
    lines.push('')

    // Table views map
    lines.push('export const tableViews: Record<string, ComponentType<TableViewProps>> = {')
    for (const entity of entitiesWithList) {
      lines.push(`  ${entity.namePlural}: ${entity.pascalName}TableView,`)
    }
    lines.push('}')
    lines.push('')

    // Detail views map
    lines.push('export const detailViews: Record<string, ComponentType<DetailViewProps>> = {')
    for (const entity of entitiesWithGet) {
      lines.push(`  ${entity.namePlural}: ${entity.pascalName}DetailView,`)
    }
    lines.push('}')

    return lines.join('\n')
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  /**
   * Extract entity name from path
   */
  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find(
      (seg) => !skipPrefixes.includes(seg.toLowerCase())
    )
    return resourceSegment || null
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toUpperCase())
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }

  private pluralize(str: string): string {
    if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
      return str + 'es'
    }
    if (str.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].includes(str.slice(-2))) {
      return str.slice(0, -1) + 'ies'
    }
    return str + 's'
  }

  private singularize(str: string): string {
    if (str.endsWith('ies')) {
      return str.slice(0, -3) + 'y'
    }
    if (str.endsWith('ses') || str.endsWith('shes') || str.endsWith('ches') || str.endsWith('xes')) {
      return str.slice(0, -2)
    }
    if (str.endsWith('s') && !str.endsWith('ss')) {
      return str.slice(0, -1)
    }
    return str
  }
}

// Factory function for easy usage
export function generateViews(
  parsedAPI: ParsedOpenAPI,
  options?: ViewGeneratorOptions
): GeneratedViews {
  const generator = new ViewGenerator(options)
  return generator.generate(parsedAPI)
}
