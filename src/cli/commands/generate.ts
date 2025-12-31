/**
 * Generate Command
 *
 * Main entry point for code generation from OpenAPI specs
 */

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { loadOpenAPISpec, parseOpenAPI } from '../../generators/parser.js'
import { generateZodSchemas } from '../../generators/zod-generator.js'
import { generateColumnMetadata } from '../../generators/column-metadata-generator.js'
import { generateFieldRenderers } from '../../generators/field-renderer-generator.js'
import { generateEntityConfigs } from '../../generators/entity-config-generator.js'
import { generateColumnHooks } from '../../generators/column-hook-generator.js'
import { EntityResolver, ApiGenerator, HookGenerator, EntityStoreGenerator, CollectionGenerator, EntityHookGenerator } from '../../core/index.js'
import type { OpenAPIV3 } from 'openapi-types'

export interface GenerateOptions {
  output: string
  schemas: boolean
  client: boolean
  hooks: boolean
  store: boolean
  // TanStack DB generators (SYNC-014)
  collections: boolean
  entities: boolean
  // UI Metadata generators
  columns: boolean
  renderers: boolean
  entityConfigs: boolean
  columnHooks: boolean
  // Other options
  apiUrl?: string
  apiUrlEnv?: string
  timeout?: string
  authTokenKey?: string
  dryRun?: boolean
  verbose?: boolean
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Directory might already exist
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  await fs.writeFile(path, content, 'utf8')
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

async function generateWithNewArchitecture(
  spec: OpenAPIV3.Document,
  options: GenerateOptions
): Promise<void> {
  // 1. Resolve to EntityModel
  const resolver = new EntityResolver()
  const model = resolver.resolve(spec)

  console.log(`Resolved ${model.entities.size} entities: ${[...model.entities.keys()].join(', ')}`)

  // 2. Generate API layer (NEW - replaces client-generator)
  if (options.client) {
    console.log('\nGenerating API layer...')
    const apiGenerator = new ApiGenerator()
    const api = apiGenerator.generate(model)

    const apiDir = join(options.output, 'api')
    await ensureDir(apiDir)

    // Write entity files
    for (const [name, content] of api.entities) {
      await writeFile(join(apiDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(apiDir, 'client.ts'), api.client)
    await writeFile(join(apiDir, 'types.ts'), api.types)
    await writeFile(join(apiDir, 'index.ts'), api.index)

    console.log(`Written API layer to ${apiDir}/`)
  }

  // 3. Generate hooks (NEW - replaces hook-generator)
  if (options.hooks) {
    console.log('\nGenerating React hooks...')
    const hookGenerator = new HookGenerator()
    const hooks = hookGenerator.generate(model)

    const hooksDir = join(options.output, 'hooks')
    await ensureDir(hooksDir)

    // Write entity files
    for (const [name, content] of hooks.entities) {
      await writeFile(join(hooksDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(hooksDir, 'keys.ts'), hooks.keys)
    await writeFile(join(hooksDir, 'index.ts'), hooks.index)

    console.log(`Written React hooks to ${hooksDir}/`)
  }

  // 4. Generate EntityStore (NEW)
  if (options.store) {
    console.log('\nGenerating EntityStore...')
    const storeGenerator = new EntityStoreGenerator()
    const store = storeGenerator.generate(model)

    const storeDir = join(options.output, 'store')
    await ensureDir(storeDir)

    // Write store files
    await writeFile(join(storeDir, 'EntityStore.ts'), store.store)
    await writeFile(join(storeDir, 'EntityStoreProvider.tsx'), store.provider)
    await writeFile(join(storeDir, 'index.ts'), store.index)

    console.log(`Written EntityStore to ${storeDir}/`)
  }

  // 5. Zod schemas (KEEP OLD - works fine)
  if (options.schemas) {
    console.log('\nGenerating Zod schemas...')
    // Use existing parseOpenAPI for zod-generator (until refactored)
    const parsed = await parseOpenAPI(spec)
    const schemas = generateZodSchemas(parsed)

    // Write schema files
    const schemasDir = join(options.output, 'schemas')
    await ensureDir(schemasDir)

    for (const [name, content] of schemas.schemas) {
      const fileName = `${toKebabCase(name)}.schema.ts`
      const filePath = join(schemasDir, fileName)
      await writeFile(filePath, content)
      if (options.verbose) {
        console.log(`  Written: ${filePath}`)
      }
    }

    // Write entity barrel files (e.g., accounts.ts groups account-related schemas)
    for (const [entityName, content] of schemas.entityBarrels) {
      const fileName = `${toKebabCase(entityName)}.ts`
      const filePath = join(schemasDir, fileName)
      await writeFile(filePath, content)
      if (options.verbose) {
        console.log(`  Written entity barrel: ${filePath}`)
      }
    }

    // Write index file
    await writeFile(join(schemasDir, 'index.ts'), schemas.index)
    console.log(
      `Written ${schemas.schemas.size} schemas + ${schemas.entityBarrels.size} entity barrels to ${schemasDir}/`
    )
  }

  // ==========================================================================
  // TANSTACK DB GENERATORS (SYNC-014: TanStack DB as Primary Data Layer)
  // ==========================================================================

  // 6. TanStack DB Collections (normalized storage with relationships)
  if (options.collections) {
    console.log('\nGenerating TanStack DB collections...')
    const collectionGenerator = new CollectionGenerator()
    const collections = collectionGenerator.generate(model)

    const collectionsDir = join(options.output, 'collections')
    await ensureDir(collectionsDir)

    // Write entity collection files
    for (const [name, content] of collections.entities) {
      await writeFile(join(collectionsDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(collectionsDir, 'store.ts'), collections.store)
    await writeFile(join(collectionsDir, 'index.ts'), collections.index)

    console.log(`Written TanStack DB collections to ${collectionsDir}/`)
  }

  // 7. Unified Entity Hooks (THE public API for components)
  if (options.entities) {
    console.log('\nGenerating unified entity hooks...')
    const entityHookGenerator = new EntityHookGenerator()
    const entityHooks = entityHookGenerator.generate(model)

    const entitiesDir = join(options.output, 'entities')
    await ensureDir(entitiesDir)

    // Write entity hook files
    for (const [name, content] of entityHooks.entities) {
      await writeFile(join(entitiesDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write index
    await writeFile(join(entitiesDir, 'index.ts'), entityHooks.index)

    console.log(`Written unified entity hooks to ${entitiesDir}/`)
  }

  // ==========================================================================
  // UI METADATA GENERATORS (Pattern Stack 2.0)
  // ==========================================================================

  // 8. Column Metadata (static column definitions from schemas)
  if (options.columns) {
    console.log('\nGenerating column metadata...')
    const columnMetadata = generateColumnMetadata(model)

    const columnsDir = join(options.output, 'columns')
    await ensureDir(columnsDir)

    // Write per-entity column files
    for (const [entityName, content] of columnMetadata.columns) {
      const entity = model.entities.get(entityName)
      if (entity) {
        const fileName = `${entity.singular}.columns.ts`
        await writeFile(join(columnsDir, fileName), content)
        if (options.verbose) {
          console.log(`  Written: ${fileName}`)
        }
      }
    }

    // Write shared types and index
    await writeFile(join(columnsDir, 'types.ts'), columnMetadata.types)
    await writeFile(join(columnsDir, 'index.ts'), columnMetadata.index)

    console.log(`Written ${columnMetadata.columns.size} column metadata files to ${columnsDir}/`)
  }

  // 9. Field Renderers (UIType → React component mapping)
  if (options.renderers) {
    console.log('\nGenerating field renderers...')
    const renderers = generateFieldRenderers()

    const renderersDir = join(options.output, 'renderers')
    await ensureDir(renderersDir)

    await writeFile(join(renderersDir, 'field-renderers.tsx'), renderers.renderers)
    await writeFile(join(renderersDir, 'index.ts'), renderers.index)

    console.log(`Written field renderers to ${renderersDir}/`)
  }

  // 10. Entity Configs (semantic field mapping)
  if (options.entityConfigs) {
    console.log('\nGenerating entity configs...')
    const entityConfigs = generateEntityConfigs(model)

    const configsDir = join(options.output, 'entity-configs')
    await ensureDir(configsDir)

    // Write per-entity config files
    for (const [entityName, content] of entityConfigs.configs) {
      const entity = model.entities.get(entityName)
      if (entity) {
        const fileName = `${entity.singular}.config.ts`
        await writeFile(join(configsDir, fileName), content)
        if (options.verbose) {
          console.log(`  Written: ${fileName}`)
        }
      }
    }

    // Write shared types and index
    await writeFile(join(configsDir, 'types.ts'), entityConfigs.types)
    await writeFile(join(configsDir, 'index.ts'), entityConfigs.index)

    console.log(`Written ${entityConfigs.configs.size} entity config files to ${configsDir}/`)
  }

  // 11. Column Hooks (runtime column metadata fetching)
  // Note: Column hooks generation temporarily disabled pending refactor
  // to remove dependency on deleted config generator
  if (options.columnHooks) {
    console.log('\nColumn hooks generation currently disabled (pending refactor)')
  }
}

export async function generateCommand(
  source: string,
  options: GenerateOptions
): Promise<void> {
  try {
    console.log('sync-patterns generate')
    console.log('======================')
    console.log()

    // Load and parse OpenAPI specification
    console.log(`Loading OpenAPI spec from: ${source}`)
    const spec = await loadOpenAPISpec(source)
    console.log(`Loaded: ${spec.info.title} v${spec.info.version}`)

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would generate:')
      console.log(`  - API layer in ${options.output}/api/`)
      console.log(`  - React hooks in ${options.output}/hooks/`)
      if (options.schemas) {
        console.log(`  - Zod schemas in ${options.output}/schemas/`)
      }
      if (options.collections) {
        console.log(`  - TanStack DB collections in ${options.output}/collections/`)
      }
      if (options.entities) {
        console.log(`  - Unified entity hooks in ${options.output}/entities/`)
      }
      if (options.columns) {
        console.log(`  - Column metadata in ${options.output}/columns/`)
      }
      if (options.renderers) {
        console.log(`  - Field renderers in ${options.output}/renderers/`)
      }
      if (options.entityConfigs) {
        console.log(`  - Entity configs in ${options.output}/entity-configs/`)
      }
      return
    }

    // Generate using new architecture
    await generateWithNewArchitecture(spec, options)
    console.log('\n✅ Generation complete!')
    console.log(`📦 Generated files in: ${options.output}`)
  } catch (error) {
    console.error('❌ Generation failed:')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
