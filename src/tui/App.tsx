/**
 * TUI Explorer - Main App Component
 *
 * Root component for the interactive terminal UI
 */

import React, { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNavigation } from './hooks/useNavigation'
import { EntityList } from './components/EntityList'
import Header from './components/Header'
import StatusBar from './components/StatusBar'
import HelpOverlay from './components/HelpOverlay'

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
  const [showHelp, setShowHelp] = useState(false)

  // Handle global keyboard input
  useInput((input, key) => {
    // If help is showing, let HelpOverlay handle input
    if (showHelp) {
      return
    }

    // Quit on 'q' from any view or Ctrl+C
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }

    // Navigate back on Esc
    if (key.escape) {
      if (navigation.state.view === 'table' || navigation.state.view === 'detail') {
        navigation.goBack()
      } else if (navigation.state.view === 'entity-list') {
        exit()
      }
    }

    // Help on '?'
    if (input === '?') {
      setShowHelp(true)
    }
  })

  // Entity list handlers
  const handleEntitySelect = (entityName: string) => {
    navigation.goToTable(entityName)
  }

  const handleEntityListBack = () => {
    exit()
  }

  // Show help overlay if active
  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1} justifyContent="center" alignItems="center">
        <HelpOverlay onClose={() => setShowHelp(false)} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Header
        entityName={navigation.state.selectedEntity}
        mode={mode}
        apiUrl={apiUrl}
        view={navigation.state.view}
      />

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
      <StatusBar
        view={navigation.state.view}
        currentPage={undefined}
        totalPages={undefined}
        isLoading={false}
      />
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
