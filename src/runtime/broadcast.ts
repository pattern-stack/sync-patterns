/**
 * Broadcast Client
 *
 * WebSocket client for real-time cache invalidation.
 * Connects to backend-patterns WebSocket broadcast endpoint
 * and dispatches events to subscribed handlers.
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Automatic resubscription on reconnect
 * - Connection state tracking
 * - Singleton pattern via initBroadcast()/getBroadcastClient()
 * - Local broadcast for multi-tab sync using BroadcastChannel API
 */

/**
 * Event received from the broadcast WebSocket
 */
export interface BroadcastEvent {
  /** Channel name (e.g., 'order', 'contact') */
  channel: string
  /** Event type (e.g., 'created', 'updated', 'deleted') */
  event: string
  /** Event payload */
  payload: {
    /** Entity ID if the event is for a specific entity */
    entity_id?: string
    [key: string]: unknown
  }
}

/**
 * Handler function for broadcast events
 */
export type BroadcastHandler = (event: BroadcastEvent) => void

/**
 * Connection state of the broadcast client
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

/**
 * State change listener function
 */
type StateChangeListener = (state: ConnectionState) => void

/**
 * Configuration options for the broadcast client
 */
export interface BroadcastClientOptions {
  /** Maximum number of reconnection attempts (default: 10) */
  maxReconnectAttempts?: number
  /** Initial reconnect delay in milliseconds (default: 1000) */
  reconnectDelay?: number
}

const DEFAULT_OPTIONS: Required<BroadcastClientOptions> = {
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
}

/**
 * WebSocket client for real-time broadcast events.
 *
 * @example
 * ```typescript
 * const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
 * client.connect()
 *
 * const unsubscribe = client.subscribe('order', (event) => {
 *   console.log('Order event:', event)
 * })
 *
 * // Later
 * unsubscribe()
 * client.disconnect()
 * ```
 */
export class BroadcastClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<BroadcastHandler>>()
  private stateListeners = new Set<StateChangeListener>()
  private reconnectAttempts = 0
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private _state: ConnectionState = 'disconnected'
  private options: Required<BroadcastClientOptions>
  /** Local BroadcastChannel for multi-tab sync (same browser) */
  private localChannel: BroadcastChannel | null = null

  constructor(
    private url: string,
    options: BroadcastClientOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.initLocalChannel()
  }

  /**
   * Initialize the local BroadcastChannel for multi-tab sync.
   * Uses browser's BroadcastChannel API for instant cross-tab communication.
   */
  private initLocalChannel(): void {
    if (typeof BroadcastChannel === 'undefined') {
      // BroadcastChannel not supported (e.g., SSR, older browsers)
      return
    }

    this.localChannel = new BroadcastChannel('sync-patterns-broadcast')

    this.localChannel.onmessage = (event) => {
      const data = event.data as BroadcastEvent
      // Dispatch to handlers just like WebSocket events
      this.dispatch(data)
    }
  }

  /**
   * Current connection state
   */
  get state(): ConnectionState {
    return this._state
  }

  /**
   * Set connection state and notify listeners
   */
  private setState(state: ConnectionState): void {
    this._state = state
    this.stateListeners.forEach((listener) => listener(state))
  }

  /**
   * Register a listener for connection state changes
   *
   * @param listener - Callback invoked when state changes
   * @returns Cleanup function to remove the listener
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /**
   * Connect to the broadcast WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return
    if (this.ws?.readyState === WebSocket.CONNECTING) return

    this.setState('connecting')
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.setState('connected')
      this.reconnectAttempts = 0

      // Resubscribe to all channels
      const channels = Array.from(this.handlers.keys())
      if (channels.length > 0) {
        this.ws?.send(JSON.stringify({ subscribe: channels }))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as BroadcastEvent
        this.dispatch(data)
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')
    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts)

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, delay)
  }

  /**
   * Subscribe to a broadcast channel
   *
   * @param channel - Channel name (e.g., 'order', 'contact')
   * @param handler - Callback invoked when events arrive on this channel
   * @returns Cleanup function to unsubscribe
   */
  subscribe(channel: string, handler: BroadcastHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set())

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ subscribe: [channel] }))
      }
    }

    const handlers = this.handlers.get(channel)
    if (handlers) {
      handlers.add(handler)
    }

    return () => {
      this.handlers.get(channel)?.delete(handler)

      if (this.handlers.get(channel)?.size === 0) {
        this.handlers.delete(channel)

        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ unsubscribe: [channel] }))
        }
      }
    }
  }

  /**
   * Dispatch an event to all subscribed handlers
   */
  private dispatch(event: BroadcastEvent): void {
    const handlers = this.handlers.get(event.channel)
    handlers?.forEach((handler) => handler(event))
  }

  /**
   * Emit an event locally to other tabs in the same browser.
   * Uses BroadcastChannel API for instant cross-tab communication.
   *
   * This is used for optimistic mutations to sync UI across tabs
   * without waiting for server broadcast.
   *
   * @param channel - Channel name (e.g., 'order', 'contact')
   * @param payload - Event payload with type and optional entity_id
   *
   * @example
   * ```typescript
   * // After creating an order optimistically
   * client.emit('order', { type: 'created', entity_id: newOrder.id })
   *
   * // After updating
   * client.emit('order', { type: 'updated', entity_id: orderId })
   *
   * // After deleting
   * client.emit('order', { type: 'deleted', entity_id: orderId })
   * ```
   */
  emit(channel: string, payload: { type: string; entity_id?: string; [key: string]: unknown }): void {
    const event: BroadcastEvent = {
      channel,
      event: payload.type,
      payload,
    }

    // Broadcast to other tabs via BroadcastChannel
    if (this.localChannel) {
      this.localChannel.postMessage(event)
    }

    // Note: We don't dispatch locally because the mutation hook already
    // updated the cache in this tab. Only other tabs need to be notified.
  }

  /**
   * Disconnect from the broadcast server
   */
  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }

    this.ws?.close()
    this.ws = null

    // Close local channel
    this.localChannel?.close()
    this.localChannel = null

    this.setState('disconnected')
  }
}

// Singleton instance
let client: BroadcastClient | null = null

/**
 * Initialize the broadcast client singleton
 *
 * @param url - WebSocket URL (e.g., 'ws://localhost:8000/ws/broadcast')
 * @param options - Optional configuration
 * @returns The broadcast client instance
 *
 * @example
 * ```typescript
 * // In your app initialization
 * const client = initBroadcast(import.meta.env.VITE_BROADCAST_URL)
 *
 * // Later, anywhere in your app
 * const client = getBroadcastClient()
 * ```
 */
export function initBroadcast(url: string, options?: BroadcastClientOptions): BroadcastClient {
  if (client) {
    client.disconnect()
  }
  client = new BroadcastClient(url, options)
  client.connect()
  return client
}

/**
 * Get the broadcast client singleton
 *
 * @throws Error if initBroadcast() has not been called
 * @returns The broadcast client instance
 */
export function getBroadcastClient(): BroadcastClient {
  if (!client) {
    throw new Error('Broadcast not initialized. Call initBroadcast() first.')
  }
  return client
}
