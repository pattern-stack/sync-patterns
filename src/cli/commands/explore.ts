/**
 * Explore Command
 *
 * Interactive TUI for exploring entities from generated code
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { render } from 'ink'
import React from 'react'
import { getTokenForUrl } from '../utils/auth-config.js'

export interface ExploreOptions {
  entity?: string
  apiUrl?: string
  id?: string
  mode?: 'optimistic' | 'confirmed'
  noCache?: boolean
  generate?: boolean
  config?: string
  theme?: 'light' | 'dark' | 'auto'
  pageSize?: string
  debug?: boolean
  generatedDir?: string
  list?: boolean
  token?: string
}

async function checkGeneratedCode(outputDir: string): Promise<boolean> {
  try {
    await fs.access(outputDir)
    return true
  } catch {
    return false
  }
}

/**
 * Common paths where generated code might be located
 */
const GENERATED_PATHS = [
  'application/frontend/src/generated',   // Pattern Stack monorepo
  'frontend/src/generated',               // Simple monorepo
  'packages/frontend/src/generated',      // Nx/Turborepo
  'src/generated',                        // Standalone frontend
]

async function findGeneratedDir(): Promise<string | null> {
  for (const path of GENERATED_PATHS) {
    const fullPath = join(process.cwd(), path, 'entities')
    try {
      await fs.access(fullPath)
      return path
    } catch {
      // Try next path
    }
  }
  return null
}

export async function exploreCommand(options: ExploreOptions): Promise<void> {
  try {
    // Find generated code directory
    const generatedDir = options.generatedDir || await findGeneratedDir()

    if (!generatedDir) {
      console.error('Error: Generated code not found')
      console.error('')
      console.error('The TUI Explorer requires generated code to function.')
      console.error('Searched in:')
      for (const path of GENERATED_PATHS) {
        console.error(`  - ${path}`)
      }
      console.error('')
      console.error('Please run the following command first:')
      console.error('')
      console.error('  sync-patterns generate <openapi-spec> --output <dir>')
      console.error('')
      console.error('Or specify the directory:')
      console.error('')
      console.error('  sync-patterns explore --generated-dir <path>')
      console.error('')
      process.exit(1)
    }

    const fullGeneratedPath = join(process.cwd(), generatedDir)
    const hasGenerated = await checkGeneratedCode(join(fullGeneratedPath, 'entities'))

    if (!hasGenerated) {
      console.error(`Error: No entities found in ${generatedDir}`)
      console.error('')
      console.error('Run sync-patterns generate first.')
      process.exit(1)
    }

    // List mode - just output entities without interactive TUI
    if (options.list) {
      const { discoverEntities } = await import('../../tui/utils/entity-discovery.js')
      const entities = await discoverEntities(generatedDir)

      if (entities.length === 0) {
        console.log('No entities found in', generatedDir)
      } else {
        console.log(`Found ${entities.length} entities:\n`)
        for (const entity of entities) {
          const modeIcon = entity.syncMode === 'realtime' ? '●' : entity.syncMode === 'offline' ? '◐' : '○'
          console.log(`  ${modeIcon} ${entity.displayName} (${entity.name})`)
          console.log(`    Mode: ${entity.syncMode}`)
          console.log(`    Hooks: ${entity.hooks.length > 0 ? entity.hooks.join(', ') : 'none detected'}`)
          console.log('')
        }
      }
      process.exit(0)
    }

    // Validate pageSize if provided
    if (options.pageSize) {
      const pageSize = parseInt(options.pageSize, 10)
      if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
        console.error('Error: --page-size must be a number between 1 and 100')
        process.exit(1)
      }
    }

    // Validate mode if provided
    if (options.mode && !['optimistic', 'confirmed'].includes(options.mode)) {
      console.error('Error: --mode must be either "optimistic" or "confirmed"')
      process.exit(1)
    }

    // Validate theme if provided
    if (options.theme && !['light', 'dark', 'auto'].includes(options.theme)) {
      console.error('Error: --theme must be one of: light, dark, auto')
      process.exit(1)
    }

    // Dynamic import of App component (will be created next)
    const { default: App } = await import('../../tui/App.js')

    // Get auth token: flag > env > saved config
    const apiUrl = options.apiUrl || process.env.SYNC_PATTERNS_API_URL
    if (!apiUrl) {
      console.error('Error: --api-url is required (or set SYNC_PATTERNS_API_URL)')
      process.exit(1)
    }
    let authToken = options.token || process.env.SYNC_PATTERNS_AUTH_TOKEN

    if (!authToken) {
      authToken = await getTokenForUrl(apiUrl) || undefined
      if (authToken && options.debug) {
        console.log(`Using saved token for ${apiUrl}`)
      }
    }

    // Render the TUI
    const { unmount, waitUntilExit } = render(
      React.createElement(App, {
        entity: options.entity,
        apiUrl,
        recordId: options.id,
        mode: options.mode,
        noCache: options.noCache || false,
        configPath: options.config,
        theme: options.theme || 'auto',
        pageSize: options.pageSize ? parseInt(options.pageSize, 10) : 25,
        debug: options.debug || false,
        generatedDir,
        authToken,
      })
    )

    // Handle clean exit
    process.on('SIGINT', () => {
      unmount()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      unmount()
      process.exit(0)
    })

    // Wait for TUI to exit
    await waitUntilExit()
  } catch (error) {
    console.error('Failed to start TUI Explorer:')
    console.error(error instanceof Error ? error.message : error)

    if (options.debug) {
      console.error('\nStack trace:')
      console.error(error instanceof Error ? error.stack : 'No stack trace available')
    }

    process.exit(1)
  }
}
