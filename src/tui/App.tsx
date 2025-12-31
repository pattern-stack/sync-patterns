/**
 * TUI Explorer - Main App Component
 *
 * Root component for the interactive terminal UI
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNavigation } from './hooks/useNavigation.js'
import { EntityList } from './components/EntityList.js'
import Header from './components/Header.js'
import StatusBar from './components/StatusBar.js'
import HelpOverlay from './components/HelpOverlay.js'
import EntityTableView from './components/EntityTableView.js'
import DetailView from './components/DetailView.js'
import ConfirmDialog from './components/ConfirmDialog.js'
import ErrorView from './components/ErrorView.js'
import { apiClient, configureApi } from './utils/api-client.js'

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
  generatedDir: string
  authToken?: string
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

function AppContent({ entity, apiUrl, recordId, mode, pageSize, debug, generatedDir, authToken }: AppProps) {
  const { exit } = useApp()
  const navigation = useNavigation(entity ? 'table' : 'entity-list')
  const [showHelp, setShowHelp] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<Error | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<Error | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  // Configure API client
  useEffect(() => {
    configureApi({
      baseUrl: apiUrl,
      authToken: authToken,
    })
  }, [apiUrl, authToken])

  // Fetch detail data when in detail view
  useEffect(() => {
    if (navigation.state.view === 'detail' && navigation.state.selectedEntity && navigation.state.selectedRecordId) {
      const fetchDetail = async () => {
        setDetailLoading(true)
        setDetailError(null)
        setDetailData(null)
        try {
          const data = await apiClient.get<Record<string, unknown>>(
            `/${navigation.state.selectedEntity}/${navigation.state.selectedRecordId}`
          )
          setDetailData(data)
        } catch (err) {
          setDetailError(err instanceof Error ? err : new Error(String(err)))
        } finally {
          setDetailLoading(false)
        }
      }
      fetchDetail()
    }
  }, [navigation.state.view, navigation.state.selectedEntity, navigation.state.selectedRecordId])

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

  // Detail view handlers
  const handleDelete = () => {
    setShowDeleteConfirm(true)
    setDeleteError(null)
    setDeleteSuccess(false)
  }

  const handleNavigateToLinkedRecord = (entityType: string, recordId: string) => {
    navigation.goToDetail(entityType, recordId)
  }

  const handleDeleteConfirm = async () => {
    if (!navigation.state.selectedEntity || !navigation.state.selectedRecordId) return

    setDeleteLoading(true)
    setDeleteError(null)
    setDeleteSuccess(false)

    try {
      await apiClient.delete(
        `/${navigation.state.selectedEntity}/${navigation.state.selectedRecordId}`
      )

      // Show success message briefly
      setDeleteSuccess(true)
      setShowDeleteConfirm(false)

      // Wait a moment to show success, then navigate back
      setTimeout(() => {
        navigation.goBack()
        setDeleteSuccess(false)
      }, 800)
    } catch (err) {
      setDeleteError(err instanceof Error ? err : new Error(String(err)))
      setDeleteLoading(false)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
    setDeleteError(null)
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
          <EntityList
            onSelect={handleEntitySelect}
            onBack={handleEntityListBack}
            generatedDir={generatedDir}
          />
        )}

        {navigation.state.view === 'table' && navigation.state.selectedEntity && (
          <EntityTableView
            key={navigation.state.selectedEntity}
            entityName={navigation.state.selectedEntity}
            apiUrl={apiUrl}
            authToken={authToken}
            pageSize={pageSize}
            onSelect={(row) => navigation.goToDetail(navigation.state.selectedEntity!, String(row.id || ''))}
            onBack={() => navigation.goBack()}
          />
        )}

        {navigation.state.view === 'detail' && navigation.state.selectedEntity && (
          <Box flexDirection="column" position="relative">
            {/* Delete success message overlay */}
            {deleteSuccess && (
              <Box
                position="absolute"
                width="100%"
                height="100%"
                justifyContent="center"
                alignItems="center"
              >
                <Box
                  borderStyle="single"
                  borderColor="green"
                  padding={1}
                >
                  <Text bold color="green">
                    Successfully deleted {navigation.state.selectedEntity}
                  </Text>
                </Box>
              </Box>
            )}

            {/* Delete error display */}
            {deleteError && !showDeleteConfirm && (
              <Box marginBottom={1}>
                <ErrorView
                  error={deleteError}
                  context={`deleting ${navigation.state.selectedEntity}`}
                  showRetry={false}
                  entityName={navigation.state.selectedEntity}
                />
              </Box>
            )}

            {/* Confirm dialog overlay */}
            {showDeleteConfirm && detailData && (
              <Box
                position="absolute"
                width="100%"
                height="100%"
                justifyContent="center"
                alignItems="center"
              >
                <ConfirmDialog
                  action="Delete"
                  itemType={navigation.state.selectedEntity}
                  itemIdentifier={
                    (detailData.name as string) ||
                    (detailData.title as string) ||
                    String(detailData.id || navigation.state.selectedRecordId)
                  }
                  onConfirm={handleDeleteConfirm}
                  onCancel={handleDeleteCancel}
                  loading={deleteLoading}
                />
              </Box>
            )}

            {/* Detail view */}
            <DetailView
              data={detailData || {}}
              entityName={navigation.state.selectedEntity}
              recordId={navigation.state.selectedRecordId}
              loading={detailLoading}
              error={detailError}
              onBack={() => navigation.goBack()}
              onDelete={handleDelete}
              onNavigateToLinkedRecord={handleNavigateToLinkedRecord}
              onUpdate={(updatedData) => setDetailData(updatedData)}
            />
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
