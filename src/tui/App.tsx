/**
 * TUI Explorer - Main App Component
 *
 * Root component for the interactive terminal UI
 */

import React, { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNavigation } from './hooks/useNavigation.js'
import { EntityList } from './components/EntityList.js'
import Header from './components/Header.js'
import StatusBar from './components/StatusBar.js'
import HelpOverlay from './components/HelpOverlay.js'

// Import generated views
// If views don't exist yet, we'll gracefully handle in the component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tableViews: Record<string, React.ComponentType<any>> | undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detailViews: Record<string, React.ComponentType<any>> | undefined

try {
  // @ts-expect-error - views may not exist yet during initial build
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const viewsModule = require('../generated/views/index.js')
  tableViews = viewsModule.tableViews
  detailViews = viewsModule.detailViews
} catch {
  // Views not generated yet - will render empty state
}

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

function AppContent({ entity, apiUrl, mode, pageSize }: AppProps) {
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

        {navigation.state.view === 'table' && navigation.state.selectedEntity && (() => {
          const TableView = tableViews?.[navigation.state.selectedEntity!]

          if (TableView) {
            // Use generated view component
            return (
              <TableView
                onSelect={(row) => navigation.goToDetail(navigation.state.selectedEntity!, String(row.id || ''))}
                onBack={() => navigation.goBack()}
                pageSize={pageSize}
              />
            )
          }

          // Fallback to empty DataTable if view not generated
          return (
            <Box flexDirection="column" padding={2}>
              <Text color="yellow">
                No generated view for {navigation.state.selectedEntity}
              </Text>
              <Text dimColor>
                Run: sync-patterns generate &lt;spec&gt; --output src/generated --entities
              </Text>
              <Box marginTop={1}>
                <Text dimColor>Press Esc to go back</Text>
              </Box>
            </Box>
          )
        })()}

        {navigation.state.view === 'detail' && navigation.state.selectedEntity && navigation.state.selectedRecordId && (() => {
          const DetailViewComponent = detailViews?.[navigation.state.selectedEntity!]

          if (DetailViewComponent) {
            // Use generated view component
            return (
              <DetailViewComponent
                id={navigation.state.selectedRecordId}
                onBack={() => navigation.goBack()}
              />
            )
          }

          // Fallback to empty detail view if not generated
          return (
            <Box flexDirection="column" padding={2}>
              <Text color="yellow">
                No generated detail view for {navigation.state.selectedEntity}
              </Text>
              <Text dimColor>
                Run: sync-patterns generate &lt;spec&gt; --output src/generated --entities
              </Text>
              <Box marginTop={1}>
                <Text dimColor>Press b or Esc to go back</Text>
              </Box>
            </Box>
          )
        })()}
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
