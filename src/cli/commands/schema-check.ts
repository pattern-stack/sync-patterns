/**
 * Schema Check Command
 *
 * CLI command to detect schema drift between OpenAPI spec and stored hashes.
 * Helps developers identify when schema_version needs to be incremented.
 *
 * Usage:
 *   sync-patterns schema:check --input openapi.yaml
 *   sync-patterns schema:check --input openapi.yaml --fix
 *   sync-patterns schema:check --input openapi.yaml --strict
 */

import { promises as fs } from 'fs'
import { resolve, dirname } from 'path'
import { createHash } from 'crypto'
import { loadOpenAPISpec, parseOpenAPI, ParsedSchema, ParsedEndpoint } from '../../generators/parser.js'

export interface SchemaCheckOptions {
  input: string
  fix?: boolean
  strict?: boolean
  verbose?: boolean
  hashFile?: string
}

export interface SchemaCheckResult {
  entity: string
  currentVersion: number
  suggestedVersion: number
  currentHash: string
  storedHash: string | null
  changes: {
    added: string[]
    removed: string[]
    modified: string[]
  }
  needsUpdate: boolean
}

interface StoredHashes {
  version: number
  entities: Record<string, { hash: string; schemaVersion: number }>
}

const DEFAULT_HASH_FILE = '.sync-patterns-schema-hashes.json'

export async function schemaCheckCommand(options: SchemaCheckOptions): Promise<void> {
  try {
    console.log('sync-patterns schema:check')
    console.log('==========================')
    console.log()

    // Load and parse OpenAPI specification
    console.log(`Loading OpenAPI spec from: ${options.input}`)
    const spec = await loadOpenAPISpec(options.input)
    console.log(`Loaded: ${spec.info.title} v${spec.info.version}`)

    const parsed = await parseOpenAPI(spec)

    // Extract offline entities and their schemas
    const offlineEntities = extractOfflineEntities(parsed.endpoints, parsed.schemas)

    if (Object.keys(offlineEntities).length === 0) {
      console.log('\n✓ No offline mode entities found in OpenAPI spec')
      return
    }

    // Load stored hashes
    const hashFilePath = options.hashFile || resolve(dirname(options.input), DEFAULT_HASH_FILE)
    const storedHashes = await loadStoredHashes(hashFilePath)

    // Check each entity for drift
    const results: SchemaCheckResult[] = []

    for (const [entityName, entityInfo] of Object.entries(offlineEntities)) {
      const currentHash = calculateSchemaHash(entityInfo.schema)
      const stored = storedHashes?.entities[entityName]
      const storedHash = stored?.hash || null
      const currentVersion = entityInfo.schemaVersion

      // Determine if schema has changed
      const needsUpdate = storedHash !== null && storedHash !== currentHash

      // Calculate suggested version
      let suggestedVersion = currentVersion
      if (needsUpdate) {
        suggestedVersion = currentVersion + 1
      }

      // Detect specific changes (simplified - compare properties)
      const changes = detectChanges(stored, entityInfo.schema)

      results.push({
        entity: entityName,
        currentVersion,
        suggestedVersion,
        currentHash,
        storedHash,
        changes,
        needsUpdate,
      })
    }

    // Report results
    console.log('\nSchema Check Results:')
    console.log('---------------------')

    let hasIssues = false
    for (const result of results) {
      if (result.needsUpdate) {
        hasIssues = true
        console.log(`\n⚠️  Schema drift detected for '${result.entity}':`)
        if (result.changes.added.length > 0) {
          console.log(`   + Added fields: ${result.changes.added.join(', ')}`)
        }
        if (result.changes.removed.length > 0) {
          console.log(`   - Removed fields: ${result.changes.removed.join(', ')}`)
        }
        if (result.changes.modified.length > 0) {
          console.log(`   ~ Modified fields: ${result.changes.modified.join(', ')}`)
        }
        console.log(`   Current version: ${result.currentVersion}`)
        console.log(`   Suggested version: ${result.suggestedVersion}`)
        console.log(`   Hash: ${result.storedHash?.slice(0, 8)}... → ${result.currentHash.slice(0, 8)}...`)
      } else if (result.storedHash === null) {
        console.log(`\n📝 New entity '${result.entity}':`)
        console.log(`   Version: ${result.currentVersion}`)
        console.log(`   Hash: ${result.currentHash.slice(0, 8)}...`)
      } else if (options.verbose) {
        console.log(`\n✓ '${result.entity}' is up to date (v${result.currentVersion})`)
      }
    }

    // Summary
    const driftCount = results.filter((r) => r.needsUpdate).length
    const newCount = results.filter((r) => r.storedHash === null).length

    console.log('\n---------------------')
    if (driftCount > 0) {
      console.log(`⚠️  ${driftCount} entity(ies) have schema drift`)
    }
    if (newCount > 0) {
      console.log(`📝 ${newCount} new entity(ies) detected`)
    }
    if (driftCount === 0 && newCount === 0) {
      console.log('✓ All schemas are up to date')
    }

    // Handle --fix flag
    if (options.fix) {
      console.log('\nUpdating schema hashes...')
      await saveStoredHashes(hashFilePath, results)
      console.log(`✓ Updated ${hashFilePath}`)

      if (driftCount > 0) {
        console.log('\n⚠️  IMPORTANT: You must manually update schema_version in your OpenAPI spec:')
        for (const result of results.filter((r) => r.needsUpdate)) {
          console.log(`   ${result.entity}: schema_version: ${result.currentVersion} → ${result.suggestedVersion}`)
        }
      }
    } else if (driftCount > 0 || newCount > 0) {
      console.log('\nRun with --fix to update stored hashes.')
    }

    // Handle --strict flag
    if (options.strict && driftCount > 0) {
      console.log('\n❌ Schema drift detected with --strict flag')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Schema check failed:')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

/**
 * Extract entities with syncMode: 'offline'
 */
function extractOfflineEntities(
  endpoints: ParsedEndpoint[],
  schemas: ParsedSchema[]
): Record<string, { schema: ParsedSchema; schemaVersion: number }> {
  const entities: Record<string, { schema: ParsedSchema; schemaVersion: number }> = {}

  for (const endpoint of endpoints) {
    // Check for offline mode
    const syncMode = endpoint.syncMode
    if (syncMode !== 'offline') continue

    // Extract entity name
    const entityName = extractEntityName(endpoint.path)
    if (!entityName || entities[entityName]) continue

    // Find matching schema
    const pascalName = toPascalCase(singularize(entityName))
    const matchingSchema = schemas.find(
      (s) =>
        s.name === pascalName ||
        s.name === `${pascalName}Owner` ||
        s.name === `${pascalName}Response`
    )

    if (matchingSchema) {
      entities[entityName] = {
        schema: matchingSchema,
        schemaVersion: endpoint.schemaVersion ?? 0,
      }
    }
  }

  return entities
}

/**
 * Calculate hash of schema for drift detection
 */
function calculateSchemaHash(schema: ParsedSchema): string {
  // Create a canonical representation
  const canonical = JSON.stringify(schema, Object.keys(schema).sort())
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/**
 * Detect changes between stored and current schema
 */
function detectChanges(
  stored: { hash: string; schemaVersion: number } | undefined,
  currentSchema: ParsedSchema
): { added: string[]; removed: string[]; modified: string[] } {
  // Simplified change detection - in a full implementation,
  // we'd store the full schema and diff properties
  return {
    added: [],
    removed: [],
    modified: stored ? ['(schema hash changed)'] : [],
  }
}

/**
 * Load stored hashes from file
 */
async function loadStoredHashes(filePath: string): Promise<StoredHashes | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as StoredHashes
  } catch {
    return null
  }
}

/**
 * Save hashes to file
 */
async function saveStoredHashes(filePath: string, results: SchemaCheckResult[]): Promise<void> {
  const hashes: StoredHashes = {
    version: 1,
    entities: {},
  }

  for (const result of results) {
    hashes.entities[result.entity] = {
      hash: result.currentHash,
      schemaVersion: result.currentVersion,
    }
  }

  await fs.writeFile(filePath, JSON.stringify(hashes, null, 2), 'utf8')
}

// Helper functions
function extractEntityName(path: string): string | null {
  const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
  const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
  const resourceSegment = segments.find((seg) => !skipPrefixes.includes(seg.toLowerCase()))
  return resourceSegment || null
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, (char) => char.toUpperCase())
}

function singularize(str: string): string {
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
