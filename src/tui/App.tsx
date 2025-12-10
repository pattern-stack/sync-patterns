/**
 * TUI Explorer - Main App Component
 *
 * Root component for the interactive terminal UI
 */

import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import chalk from 'chalk'

export interface AppProps {
  entity?: string
  apiUrl: string
  recordId?: string
  mode?: 'optimistic' | 'confirmed'
  noCache: boolean
  configPath?: string
  theme: 'light' | 'dark' | 'auto'
  pageSize: number
  debug: boolean
}

// Create a QueryClient for TanStack Query integration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent({ entity, apiUrl, recordId, mode, pageSize, debug }: AppProps) {
  const { exit } = useApp()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [view, _setView] = useState<'welcome' | 'entity-list'>('welcome')

  // Handle keyboard input
  useInput((input, key) => {
    // Quit on 'q' or Ctrl+C
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }

    // Help on '?'
    if (input === '?') {
      // Show help (TODO: implement help overlay in Issue 8)
    }
  })

  // Determine sync mode indicator
  const syncModeIndicator = mode === 'optimistic'
    ? chalk.green('● Optimistic')
    : mode === 'confirmed'
    ? chalk.yellow('○ Confirmed')
    : chalk.cyan('◐ Auto')

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between">
            <Text bold color="cyan">sync-patterns Explorer</Text>
            <Text>{syncModeIndicator}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>API: {apiUrl}</Text>
          </Box>
        </Box>
      </Box>

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1}>
        {view === 'welcome' && (
          <Box flexDirection="column" padding={2}>
            <Box marginBottom={1}>
              <Text bold color="green">Welcome to TUI Explorer!</Text>
            </Box>

            <Box flexDirection="column" marginBottom={2}>
              <Text>
                The interactive terminal UI for exploring Pattern Stack entities.
              </Text>
            </Box>

            <Box flexDirection="column" marginBottom={2}>
              <Text bold>Features (Coming Soon):</Text>
              <Box marginLeft={2} flexDirection="column">
                <Text>• Browse all entities with record counts</Text>
                <Text>• View data in tables with smart field rendering</Text>
                <Text>• Search and filter records</Text>
                <Text>• View detailed record information</Text>
                <Text>• Inspect API requests and responses</Text>
              </Box>
            </Box>

            {entity && (
              <Box marginBottom={2}>
                <Text>
                  Starting entity: <Text bold color="cyan">{entity}</Text>
                </Text>
              </Box>
            )}

            {debug && (
              <Box marginBottom={2} borderStyle="single" borderColor="yellow" padding={1}>
                <Box flexDirection="column">
                  <Text bold color="yellow">Debug Mode</Text>
                  <Text dimColor>API URL: {apiUrl}</Text>
                  <Text dimColor>Mode: {mode || 'auto'}</Text>
                  <Text dimColor>Page Size: {pageSize}</Text>
                  {recordId && <Text dimColor>Record ID: {recordId}</Text>}
                </Box>
              </Box>
            )}

            <Box marginTop={1}>
              <Text dimColor>
                This is Phase 1 foundation. Full functionality coming in future issues.
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer / Status Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          q: Quit  •  ?: Help  •  Entity exploration coming soon...
        </Text>
      </Box>
    </Box>
  )
}

export default function App(props: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent {...props} />
    </QueryClientProvider>
  )
}
