/**
 * Example: Broadcast Integration with Generated Hooks
 *
 * This file demonstrates how to use the sync-patterns broadcast
 * system with TanStack Query for real-time, optimistic updates.
 *
 * Key concepts:
 * 1. BroadcastProvider at the app root for WebSocket connection
 * 2. useBroadcastInvalidation for automatic cache refresh
 * 3. Optimistic mutations for instant UI feedback
 * 4. Connection state monitoring for offline awareness
 */

import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BroadcastProvider,
  useBroadcastState,
  useBroadcastInvalidation,
} from '@pattern-stack/sync-patterns/runtime'
import { useState, useEffect } from 'react'

// =============================================================================
// Types (typically generated from OpenAPI spec)
// =============================================================================

interface Order {
  id: string
  customer_name: string
  status: 'draft' | 'pending' | 'preparing' | 'ready' | 'completed'
  items: OrderItem[]
  created_at: string
  updated_at: string
}

interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
}

interface OrderItemCreate {
  name: string
  quantity: number
  price: number
}

// =============================================================================
// API Client (typically generated)
// =============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const orderApi = {
  list: async (): Promise<Order[]> => {
    const res = await fetch(`${API_BASE}/orders`)
    if (!res.ok) throw new Error('Failed to fetch orders')
    return res.json()
  },

  get: async (id: string): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders/${id}`)
    if (!res.ok) throw new Error('Failed to fetch order')
    return res.json()
  },

  addItem: async (orderId: string, item: OrderItemCreate): Promise<OrderItem> => {
    const res = await fetch(`${API_BASE}/orders/${orderId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    if (!res.ok) throw new Error('Failed to add item')
    return res.json()
  },

  update: async (id: string, data: Partial<Order>): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update order')
    return res.json()
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/orders/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete order')
  },
}

// =============================================================================
// Query Hooks with Broadcast Integration
// =============================================================================

interface UseOrdersOptions {
  /** Enable auto-refresh on broadcast events (default: true) */
  autoRefresh?: boolean
}

/**
 * Hook to fetch all orders with automatic broadcast invalidation.
 *
 * When any client creates, updates, or deletes an order, all connected
 * clients will automatically refetch their order list.
 */
export function useOrders(options: UseOrdersOptions = {}) {
  const { autoRefresh = true } = options

  // Subscribe to broadcast for cache invalidation
  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders'],
    enabled: autoRefresh,
  })

  return useQuery({
    queryKey: ['orders'],
    queryFn: () => orderApi.list(),
  })
}

/**
 * Hook to fetch a single order with automatic broadcast invalidation.
 */
export function useOrder(id: string, options: UseOrdersOptions = {}) {
  const { autoRefresh = true } = options

  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders', id],
    enabled: autoRefresh,
  })

  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => orderApi.get(id),
    enabled: !!id,
  })
}

// =============================================================================
// Mutation Hooks with Optimistic Updates
// =============================================================================

/**
 * Hook to add an item to an order with optimistic updates.
 *
 * The UI updates immediately when the user adds an item. If the API
 * call fails, the change is rolled back and an error is shown.
 */
export function useAddOrderItem(orderId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (item: OrderItemCreate) => orderApi.addItem(orderId, item),

    // Optimistic update - runs BEFORE API call
    onMutate: async (newItem) => {
      // Cancel in-flight fetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['orders', orderId] })

      // Snapshot current state for potential rollback
      const previousOrder = queryClient.getQueryData<Order>(['orders', orderId])

      // Optimistically add the item
      queryClient.setQueryData<Order>(['orders', orderId], (old) => {
        if (!old) return old
        return {
          ...old,
          items: [
            ...old.items,
            {
              ...newItem,
              id: crypto.randomUUID(), // Temporary ID
              created_at: new Date().toISOString(),
            } as OrderItem,
          ],
          updated_at: new Date().toISOString(),
        }
      })

      // Return context with previous state for rollback
      return { previousOrder }
    },

    // Rollback on error
    onError: (_err, _newItem, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(['orders', orderId], context.previousOrder)
      }
    },

    // Always refetch after mutation to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
    },
  })
}

/**
 * Hook to update an order with optimistic updates.
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Order> }) =>
      orderApi.update(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['orders', id] })

      const previousOrder = queryClient.getQueryData<Order>(['orders', id])

      queryClient.setQueryData<Order>(['orders', id], (old) => {
        if (!old) return old
        return { ...old, ...data, updated_at: new Date().toISOString() }
      })

      return { previousOrder }
    },

    onError: (_err, { id }, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(['orders', id], context.previousOrder)
      }
    },

    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'], exact: true })
    },
  })
}

/**
 * Hook to delete an order with optimistic updates.
 */
export function useDeleteOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => orderApi.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })

      const previousOrders = queryClient.getQueryData<Order[]>(['orders'])

      // Optimistically remove from list
      queryClient.setQueryData<Order[]>(['orders'], (old) =>
        old?.filter((o) => o.id !== id)
      )

      // Remove individual query cache
      queryClient.removeQueries({ queryKey: ['orders', id] })

      return { previousOrders }
    },

    onError: (_err, _id, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['orders'], context.previousOrders)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

// =============================================================================
// UI Components
// =============================================================================

/**
 * Connection status indicator.
 * Shows a banner when WebSocket connection is lost.
 */
function ConnectionStatus() {
  const state = useBroadcastState()

  if (state === 'connected') return null

  const variant = state === 'reconnecting' ? 'warning' : 'error'
  const message = state === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'

  return (
    <div
      className={`fixed top-0 left-0 right-0 p-2 text-center text-white ${
        variant === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
      }`}
    >
      {message}
    </div>
  )
}

/**
 * Kitchen Display - auto-refreshes when orders change.
 * Perfect for screens that should always show the latest data.
 */
function KitchenDisplay() {
  const { data: orders, isLoading, error } = useOrders()

  if (isLoading) return <div className="p-4">Loading orders...</div>
  if (error) return <div className="p-4 text-red-500">Error loading orders</div>

  const activeOrders = orders?.filter((o) =>
    ['pending', 'preparing'].includes(o.status)
  )

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Kitchen Display</h1>
      <div className="grid grid-cols-3 gap-4">
        {activeOrders?.map((order) => (
          <div
            key={order.id}
            className={`p-4 rounded-lg shadow ${
              order.status === 'preparing' ? 'bg-yellow-100' : 'bg-white'
            }`}
          >
            <h2 className="font-bold">{order.customer_name}</h2>
            <p className="text-sm text-gray-500">#{order.id.slice(0, 8)}</p>
            <ul className="mt-2">
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.quantity}x {item.name}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-sm uppercase font-medium text-blue-600">
              {order.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Order Entry - optimistic mutations for instant feedback.
 * Perfect for POS systems where speed matters.
 */
function OrderEntry({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId)
  const addItem = useAddOrderItem(orderId)

  const menuItems: OrderItemCreate[] = [
    { name: 'Burger', quantity: 1, price: 12.99 },
    { name: 'Fries', quantity: 1, price: 4.99 },
    { name: 'Soda', quantity: 1, price: 2.99 },
    { name: 'Salad', quantity: 1, price: 8.99 },
  ]

  const handleAddItem = (item: OrderItemCreate) => {
    addItem.mutate(item, {
      onError: () => {
        // Show error toast in real app
        console.error('Failed to add item')
      },
    })
  }

  if (isLoading) return <div className="p-4">Loading...</div>

  const total = order?.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  ) ?? 0

  return (
    <div className="p-4 flex gap-8">
      {/* Menu Grid */}
      <div className="flex-1">
        <h2 className="text-xl font-bold mb-4">Menu</h2>
        <div className="grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => handleAddItem(item)}
              disabled={addItem.isPending}
              className="p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <div className="font-bold">{item.name}</div>
              <div>${item.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Order Summary */}
      <div className="w-80 bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Order #{orderId.slice(0, 8)}</h2>

        {/* Show saving indicator during optimistic update */}
        {addItem.isPending && (
          <div className="mb-2 text-sm text-blue-600">Saving...</div>
        )}

        <ul className="divide-y">
          {order?.items.map((item) => (
            <li key={item.id} className="py-2 flex justify-between">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-4 border-t font-bold flex justify-between">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Order Edit Form - auto-refresh disabled while editing.
 * Prevents data from changing while user is making edits.
 */
function OrderEditForm({ id }: { id: string }) {
  // Disable auto-refresh while editing to prevent form data from changing
  const { data: order, isLoading } = useOrder(id, { autoRefresh: false })
  const [draft, setDraft] = useState<Partial<Order> | null>(null)
  const updateOrder = useUpdateOrder()

  // Initialize draft from fetched order
  useEffect(() => {
    if (order && !draft) {
      setDraft({
        customer_name: order.customer_name,
        status: order.status,
      })
    }
  }, [order, draft])

  const handleSave = () => {
    if (!draft) return

    updateOrder.mutate(
      { id, data: draft },
      {
        onSuccess: () => {
          // Navigate away or show success message
          console.log('Order updated successfully')
        },
        onError: () => {
          console.error('Failed to update order')
        },
      }
    )
  }

  if (isLoading) return <div className="p-4">Loading...</div>

  return (
    <div className="p-4 max-w-md">
      <h1 className="text-2xl font-bold mb-4">Edit Order</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Customer Name</label>
          <input
            type="text"
            value={draft?.customer_name ?? ''}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, customer_name: e.target.value }))
            }
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            value={draft?.status ?? ''}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                status: e.target.value as Order['status'],
              }))
            }
            className="w-full p-2 border rounded"
          >
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={updateOrder.isPending}
          className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {updateOrder.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// App Root with Providers
// =============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

/**
 * Example App demonstrating broadcast integration.
 *
 * Key setup:
 * 1. QueryClientProvider for TanStack Query
 * 2. BroadcastProvider for WebSocket connection
 * 3. ConnectionStatus for offline awareness
 */
export default function App() {
  const [activeOrderId] = useState('example-order-id')

  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastProvider url={import.meta.env.VITE_BROADCAST_URL}>
        <ConnectionStatus />

        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow p-4 mb-4">
            <h1 className="text-xl font-bold">Broadcast Integration Example</h1>
          </nav>

          <div className="container mx-auto">
            {/* Different components demonstrating different patterns */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-2 px-4">
                Kitchen Display (Auto-refresh enabled)
              </h2>
              <KitchenDisplay />
            </div>

            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-2 px-4">
                Order Entry (Optimistic updates)
              </h2>
              <OrderEntry orderId={activeOrderId} />
            </div>

            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-2 px-4">
                Edit Form (Auto-refresh disabled)
              </h2>
              <OrderEditForm id={activeOrderId} />
            </div>
          </div>
        </div>
      </BroadcastProvider>
    </QueryClientProvider>
  )
}
