/**
 * Navigation State Management Hook
 *
 * Manages navigation between views (entity list, table, detail)
 */

import { useState, useCallback } from 'react'

export type View = 'entity-list' | 'table' | 'detail'

export interface NavigationState {
  /** Current view */
  view: View
  /** Currently selected entity (when in table or detail view) */
  selectedEntity?: string
  /** Currently selected record ID (when in detail view) */
  selectedRecordId?: string
}

export interface NavigationControls {
  /** Current navigation state */
  state: NavigationState
  /** Navigate to entity list */
  goToEntityList: () => void
  /** Navigate to entity table */
  goToTable: (entityName: string) => void
  /** Navigate to record detail */
  goToDetail: (entityName: string, recordId: string) => void
  /** Go back to previous view */
  goBack: () => void
}

/**
 * Hook for managing navigation state
 */
export function useNavigation(initialView: View = 'entity-list'): NavigationControls {
  const [state, setState] = useState<NavigationState>({
    view: initialView,
  })

  const goToEntityList = useCallback(() => {
    setState({
      view: 'entity-list',
    })
  }, [])

  const goToTable = useCallback((entityName: string) => {
    setState({
      view: 'table',
      selectedEntity: entityName,
    })
  }, [])

  const goToDetail = useCallback((entityName: string, recordId: string) => {
    setState({
      view: 'detail',
      selectedEntity: entityName,
      selectedRecordId: recordId,
    })
  }, [])

  const goBack = useCallback(() => {
    setState(prev => {
      // From detail → table
      if (prev.view === 'detail') {
        return {
          view: 'table',
          selectedEntity: prev.selectedEntity,
        }
      }
      // From table → entity list
      if (prev.view === 'table') {
        return {
          view: 'entity-list',
        }
      }
      // Already at entity list, do nothing
      return prev
    })
  }, [])

  return {
    state,
    goToEntityList,
    goToTable,
    goToDetail,
    goBack,
  }
}
