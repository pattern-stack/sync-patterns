/**
 * Broadcast Provider
 *
 * React context provider for the broadcast client.
 * Manages WebSocket connection lifecycle and provides
 * subscription API to child components.
 *
 * @example
 * ```tsx
 * // App setup
 * import { QueryClientProvider } from '@tanstack/react-query'
 * import { BroadcastProvider } from '@pattern-stack/sync-patterns/runtime'
 *
 * function App() {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       <BroadcastProvider url={import.meta.env.VITE_BROADCAST_URL}>
 *         <RouterProvider router={router} />
 *       </BroadcastProvider>
 *     </QueryClientProvider>
 *   )
 * }
 * ```
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  initBroadcast,
  getBroadcastClient,
  type ConnectionState,
  type BroadcastEvent,
  type BroadcastHandler,
} from './broadcast.js'

/**
 * Payload for emitting broadcast events
 */
export interface BroadcastEmitPayload {
  type: string
  entity_id?: string
  [key: string]: unknown
}

/**
 * Context value provided by BroadcastProvider
 */
export interface BroadcastContextValue {
  /** Current connection state */
  state: ConnectionState
  /** Subscribe to a broadcast channel */
  subscribe: (channel: string, handler: BroadcastHandler) => () => void
  /** Emit an event to other tabs (local broadcast) */
  emit: (channel: string, payload: BroadcastEmitPayload) => void
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null)

/**
 * Props for BroadcastProvider
 */
export interface BroadcastProviderProps {
  /** WebSocket URL (e.g., 'ws://localhost:8000/ws/broadcast') */
  url: string
  /** React children */
  children: ReactNode
}

/**
 * Provider component for broadcast functionality.
 *
 * Initializes the WebSocket connection and provides
 * subscription API to child components via context.
 *
 * @example
 * ```tsx
 * <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
 *   <App />
 * </BroadcastProvider>
 * ```
 */
export function BroadcastProvider({ url, children }: BroadcastProviderProps) {
  const [state, setState] = useState<ConnectionState>('disconnected')

  useEffect(() => {
    const client = initBroadcast(url)
    const unsubscribe = client.onStateChange(setState)
    setState(client.state)

    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [url])

  const subscribe = (channel: string, handler: (event: BroadcastEvent) => void) => {
    return getBroadcastClient().subscribe(channel, handler)
  }

  const emit = (channel: string, payload: BroadcastEmitPayload) => {
    return getBroadcastClient().emit(channel, payload)
  }

  return (
    <BroadcastContext.Provider value={{ state, subscribe, emit }}>{children}</BroadcastContext.Provider>
  )
}

/**
 * Hook to access the broadcast context.
 *
 * @throws Error if used outside of BroadcastProvider
 * @returns Broadcast context value with state, subscribe, and emit functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, subscribe, emit } = useBroadcast()
 *
 *   // Subscribe to events
 *   useEffect(() => {
 *     const unsubscribe = subscribe('order', (event) => {
 *       console.log('Order event:', event)
 *     })
 *     return unsubscribe
 *   }, [subscribe])
 *
 *   // Emit events to other tabs
 *   const handleCreate = (order) => {
 *     emit('order', { type: 'created', entity_id: order.id })
 *   }
 *
 *   return <div>Connection: {state}</div>
 * }
 * ```
 */
export function useBroadcast(): BroadcastContextValue {
  const context = useContext(BroadcastContext)
  if (!context) {
    throw new Error('useBroadcast must be used within BroadcastProvider')
  }
  return context
}

/**
 * Convenience hook to get just the connection state.
 *
 * @returns Current connection state
 *
 * @example
 * ```tsx
 * function ConnectionStatus() {
 *   const state = useBroadcastState()
 *
 *   if (state === 'connected') return null
 *
 *   return (
 *     <Banner variant={state === 'reconnecting' ? 'warning' : 'error'}>
 *       {state === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
 *     </Banner>
 *   )
 * }
 * ```
 */
export function useBroadcastState(): ConnectionState {
  return useBroadcast().state
}

// Re-export types for convenience
export type { BroadcastEvent, BroadcastHandler, ConnectionState }
