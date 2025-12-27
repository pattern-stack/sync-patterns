/**
 * Broadcast Invalidation Hook
 *
 * Automatically invalidate TanStack Query cache when broadcast events arrive.
 * This enables cross-client synchronization without manual refetch logic.
 *
 * @example
 * ```tsx
 * function OrderList() {
 *   // Invalidate all order queries when any order event occurs
 *   useBroadcastInvalidation({
 *     channel: 'order',
 *     queryKeyPrefix: ['orders'],
 *   })
 *
 *   const { data: orders } = useOrders()
 *   return <OrderTable orders={orders} />
 * }
 * ```
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useBroadcast } from './BroadcastProvider.js'
import type { BroadcastEvent } from './broadcast.js'

/**
 * Options for useBroadcastInvalidation hook
 */
export interface UseBroadcastInvalidationOptions {
  /**
   * Channel to subscribe to (e.g., 'order', 'contact')
   */
  channel: string

  /**
   * Query key prefix to invalidate (e.g., ['orders'])
   *
   * When an event arrives:
   * - If event has entity_id: invalidates [...prefix, entity_id]
   * - Otherwise: invalidates all queries matching prefix
   */
  queryKeyPrefix: readonly string[]

  /**
   * Whether invalidation is enabled (default: true)
   *
   * Set to false to disable auto-refresh, useful for:
   * - Edit forms where you don't want data to change while editing
   * - Modal dialogs with unsaved changes
   *
   * @example
   * ```tsx
   * function OrderEditForm({ id }: { id: string }) {
   *   const [isEditing, setIsEditing] = useState(false)
   *
   *   // Disable auto-refresh while editing
   *   useBroadcastInvalidation({
   *     channel: 'order',
   *     queryKeyPrefix: ['orders', id],
   *     enabled: !isEditing,
   *   })
   *
   *   // ...
   * }
   * ```
   */
  enabled?: boolean
}

/**
 * Automatically invalidate TanStack Query cache when broadcast events arrive.
 *
 * This hook subscribes to a broadcast channel and invalidates the relevant
 * TanStack Query cache entries when events are received. This enables
 * cross-client synchronization - when one client makes a change, all other
 * clients automatically refetch the updated data.
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * // Basic usage - invalidate all order queries on any order event
 * useBroadcastInvalidation({
 *   channel: 'order',
 *   queryKeyPrefix: ['orders'],
 * })
 * ```
 *
 * @example
 * ```tsx
 * // Disable for edit forms
 * useBroadcastInvalidation({
 *   channel: 'order',
 *   queryKeyPrefix: ['orders'],
 *   enabled: !isEditing,  // Won't invalidate while editing
 * })
 * ```
 *
 * @example
 * ```tsx
 * // Specific entity
 * useBroadcastInvalidation({
 *   channel: 'order',
 *   queryKeyPrefix: ['orders', orderId],
 * })
 * ```
 */
export function useBroadcastInvalidation(options: UseBroadcastInvalidationOptions): void {
  const { channel, queryKeyPrefix, enabled = true } = options
  const queryClient = useQueryClient()
  const { subscribe } = useBroadcast()

  // Use ref to avoid recreating the handler on every render
  const queryKeyPrefixRef = useRef(queryKeyPrefix)
  queryKeyPrefixRef.current = queryKeyPrefix

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribe(channel, (event: BroadcastEvent) => {
      const prefix = queryKeyPrefixRef.current

      if (event.payload.entity_id) {
        // Invalidate specific entity query
        queryClient.invalidateQueries({
          queryKey: [...prefix, event.payload.entity_id],
        })
        // Also invalidate the list query (prefix without entity_id)
        // since the entity might appear in list views
        queryClient.invalidateQueries({
          queryKey: prefix,
          exact: true,
        })
      } else {
        // Invalidate all queries with this prefix
        queryClient.invalidateQueries({
          queryKey: prefix,
        })
      }
    })

    return unsubscribe
  }, [channel, enabled, queryClient, subscribe])
}
