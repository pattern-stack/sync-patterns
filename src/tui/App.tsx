/**
 * TUI Explorer - Main App Component
 *
 * Root component for the interactive terminal UI
 */

import React from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import chalk from 'chalk'
import { useNavigation } from './hooks/useNavigation'
import { EntityList } from './components/EntityList'

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
  const navigation = useNavigation(entity ? 'table' : 'entity-list')

  // Handle global keyboard input
  useInput((input, key) => {
    // Quit on 'q' (when at top level) or Ctrl+C
    if ((input === 'q' && navigation.state.view === 'entity-list') || (key.ctrl && input === 'c')) {
      exit()
    }

    // Navigate back on Esc
    if (key.escape) {
      if (navigation.state.view === 'table' || navigation.state.view === 'detail') {
        navigation.goBack()
      }
    }

    // Help on '?'
    if (input === '?') {
      // Show help (TODO: implement help overlay in Issue 8)
    }
  })

  // Entity list handlers
  const handleEntitySelect = (entityName: string) => {
    navigation.goToTable(entityName)
  }

  const handleEntityListBack = () => {
    exit()
  }

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
        {navigation.state.view === 'entity-list' && (
          <EntityList onSelect={handleEntitySelect} onBack={handleEntityListBack} />
        )}

        {navigation.state.view === 'table' && (
          <Box flexDirection="column" padding={2}>
            <Box marginBottom={1}>
              <Text bold color="cyan">
                Entity: {navigation.state.selectedEntity}
              </Text>
            </Box>
            <Box marginBottom={2}>
              <Text color="yellow">Table view coming in Issue 4 (DataTable Component)</Text>
            </Box>
            {debug && (
              <Box marginBottom={2} borderStyle="single" borderColor="yellow" padding={1}>
                <Box flexDirection="column">
                  <Text bold color="yellow">Debug Info</Text>
                  <Text dimColor>Entity: {navigation.state.selectedEntity}</Text>
                  <Text dimColor>API URL: {apiUrl}</Text>
                  <Text dimColor>Mode: {mode || 'auto'}</Text>
                  <Text dimColor>Page Size: {pageSize}</Text>
                  {recordId && <Text dimColor>Record ID: {recordId}</Text>}
                </Box>
              </Box>
            )}
            <Box>
              <Text dimColor>Press Esc to go back to entity list</Text>
            </Box>
          </Box>
        )}

        {navigation.state.view === 'detail' && (
          <Box flexDirection="column" padding={2}>
            <Box marginBottom={1}>
              <Text bold color="cyan">
                Detail: {navigation.state.selectedEntity}
              </Text>
            </Box>
            <Box marginBottom={2}>
              <Text color="yellow">Detail view coming in Issue 5 (DetailView Component)</Text>
            </Box>
            <Box>
              <Text dimColor>Press Esc to go back to table</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer / Status Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        {navigation.state.view === 'entity-list' && (
          <Text dimColor>
            ↑/↓: Navigate  •  Enter: Select  •  q: Quit
          </Text>
        )}
        {navigation.state.view === 'table' && (
          <Text dimColor>
            Esc: Back to entities  •  q: Quit
          </Text>
        )}
        {navigation.state.view === 'detail' && (
          <Text dimColor>
            Esc: Back to table  •  q: Quit
          </Text>
        )}
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
