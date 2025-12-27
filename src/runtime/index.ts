/**
 * Runtime Module
 *
 * Real-time broadcast infrastructure for cache invalidation.
 *
 * This module provides:
 * - WebSocket client for connecting to backend broadcast endpoint
 * - React context provider for managing connection lifecycle
 * - TanStack Query integration for automatic cache invalidation
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
 *
 * @example
 * ```tsx
 * // Component usage
 * import { useBroadcastInvalidation, useBroadcastState } from '@pattern-stack/sync-patterns/runtime'
 *
 * function OrderList() {
 *   // Auto-refresh when order events arrive
 *   useBroadcastInvalidation({
 *     channel: 'order',
 *     queryKeyPrefix: ['orders'],
 *   })
 *
 *   const state = useBroadcastState()
 *   const { data: orders } = useOrders()
 *
 *   return (
 *     <>
 *       {state !== 'connected' && <ConnectionBanner state={state} />}
 *       <OrderTable orders={orders} />
 *     </>
 *   )
 * }
 * ```
 */

// Broadcast client
export {
  BroadcastClient,
  initBroadcast,
  getBroadcastClient,
  type BroadcastEvent,
  type BroadcastHandler,
  type ConnectionState,
  type BroadcastClientOptions,
} from './broadcast.js'

// React provider and hooks
export {
  BroadcastProvider,
  useBroadcast,
  useBroadcastState,
  type BroadcastContextValue,
  type BroadcastProviderProps,
  type BroadcastEmitPayload,
} from './BroadcastProvider.js'

// Query invalidation hook
export {
  useBroadcastInvalidation,
  type UseBroadcastInvalidationOptions,
} from './useBroadcastInvalidation.js'
