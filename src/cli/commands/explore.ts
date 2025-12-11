/**
 * Explore Command
 *
 * Interactive TUI for exploring entities from generated code
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { render } from 'ink'
import React from 'react'

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
}

async function checkGeneratedCode(outputDir: string): Promise<boolean> {
  try {
    await fs.access(outputDir)
    return true
  } catch {
    return false
  }
}

export async function exploreCommand(options: ExploreOptions): Promise<void> {
  try {
    // Check if generated code exists
    const generatedDir = join(process.cwd(), 'src', 'generated')
    const hasGenerated = await checkGeneratedCode(generatedDir)

    if (!hasGenerated) {
      console.error('Error: Generated code not found')
      console.error('')
      console.error('The TUI Explorer requires generated code to function.')
      console.error('Please run the following command first:')
      console.error('')
      console.error('  sync-patterns generate <openapi-spec>')
      console.error('')
      console.error('Example:')
      console.error('  sync-patterns generate ./openapi.json')
      console.error('  sync-patterns generate http://localhost:8000/openapi.json')
      console.error('')
      process.exit(1)
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

    // Render the TUI
    const { unmount, waitUntilExit } = render(
      React.createElement(App, {
        entity: options.entity,
        apiUrl: options.apiUrl || process.env.SYNC_PATTERNS_API_URL || 'http://localhost:8000/api/v1',
        recordId: options.id,
        mode: options.mode,
        noCache: options.noCache || false,
        configPath: options.config,
        theme: options.theme || 'auto',
        pageSize: options.pageSize ? parseInt(options.pageSize, 10) : 25,
        debug: options.debug || false,
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
