/**
 * Entity Discovery Utilities
 *
 * Scans src/generated/entities/ to discover available entities and their metadata
 */

import { promises as fs } from 'fs'
import { join } from 'path'

export type SyncMode = 'api' | 'realtime' | 'offline'

export interface EntityMetadata {
  /** Entity name (plural, e.g., "accounts") */
  name: string
  /** Display name (singular, e.g., "Account") */
  displayName: string
  /** Sync mode detected from config or imports */
  syncMode: SyncMode
  /** Available operations (detected from exported hooks) */
  operations: {
    list: boolean
    get: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  /** Path to the entity module */
  modulePath: string
}

/**
 * Scan src/generated/entities/ directory to find all entity modules
 */
export async function discoverEntities(generatedDir: string = 'src/generated'): Promise<EntityMetadata[]> {
  const entitiesDir = join(process.cwd(), generatedDir, 'entities')

  try {
    // Check if entities directory exists
    await fs.access(entitiesDir)
  } catch {
    // No entities directory - return empty array
    return []
  }

  try {
    const files = await fs.readdir(entitiesDir)

    // Filter to .ts files (excluding .d.ts and types.ts)
    const entityFiles = files.filter(
      f => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'types.ts' && f !== 'index.ts'
    )

    const entities: EntityMetadata[] = []

    for (const file of entityFiles) {
      const filePath = join(entitiesDir, file)
      const entityName = file.replace('.ts', '')
      const metadata = await extractEntityMetadata(entityName, filePath)

      if (metadata) {
        entities.push(metadata)
      }
    }

    return entities.sort((a, b) => a.displayName.localeCompare(b.displayName))
  } catch (error) {
    console.error('Error discovering entities:', error)
    return []
  }
}

/**
 * Extract metadata from an entity module by analyzing its exports
 */
async function extractEntityMetadata(
  entityName: string,
  filePath: string
): Promise<EntityMetadata | null> {
  try {
    // Read the file to analyze imports and exports
    const content = await fs.readFile(filePath, 'utf-8')

    // Detect sync mode from imports
    const syncMode = detectSyncMode(content)

    // Detect available operations from exported hooks
    const operations = detectOperations(content, entityName)

    // Generate display name (singular PascalCase)
    const displayName = toDisplayName(entityName)

    return {
      name: entityName,
      displayName,
      syncMode,
      operations,
      modulePath: filePath,
    }
  } catch (error) {
    console.error(`Error extracting metadata for ${entityName}:`, error)
    return null
  }
}

/**
 * Detect sync mode from imports in the entity file
 */
function detectSyncMode(content: string): SyncMode {
  // Check for offline executor imports
  if (content.includes("from '../offline/") || content.includes('Offline')) {
    return 'offline'
  }

  // Check for TanStack DB/realtime collection imports
  if (
    content.includes("from '../collections/") &&
    (content.includes('RealtimeCollection') || content.includes('@tanstack/react-db'))
  ) {
    return 'realtime'
  }

  // Default to API mode
  return 'api'
}

/**
 * Detect available operations from exported functions
 */
function detectOperations(content: string, entityName: string): EntityMetadata['operations'] {
  const displayName = toDisplayName(entityName)

  return {
    // List: use{Entity}s or use{Entity}sWithMeta
    list: content.includes(`export function use${displayName}s`) ||
          content.includes(`export function use${displayName}sWithMeta`),

    // Get: use{Entity}(
    get: content.includes(`export function use${displayName}(`),

    // Create: useCreate{Entity}
    create: content.includes(`export function useCreate${displayName}`),

    // Update: useUpdate{Entity}
    update: content.includes(`export function useUpdate${displayName}`),

    // Delete: useDelete{Entity}
    delete: content.includes(`export function useDelete${displayName}`),
  }
}

/**
 * Convert entity name to display name (singular PascalCase)
 * Examples:
 *   accounts → Account
 *   contacts → Contact
 *   purchase-orders → PurchaseOrder
 */
function toDisplayName(entityName: string): string {
  // Remove trailing 's' for plurals (simple heuristic)
  let singular = entityName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('ses') || singular.endsWith('shes') || singular.endsWith('ches') || singular.endsWith('xes')) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1)
  }

  // Convert to PascalCase
  return singular
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
