/**
 * BroadcastClient Tests
 *
 * Tests for the WebSocket broadcast client.
 * Tests connection state transitions, subscribe/unsubscribe,
 * message dispatch, and reconnection logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  BroadcastClient,
  initBroadcast,
  getBroadcastClient,
  type BroadcastEvent,
  type ConnectionState,
} from '../../runtime/broadcast.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  private sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
  }

  send(data: string): void {
    this.sentMessages.push(data)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  getSentMessages(): string[] {
    return this.sentMessages
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: BroadcastEvent): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  simulateError(): void {
    this.onerror?.()
  }
}

// Store mock WebSocket instances
let mockWebSocketInstances: MockWebSocket[] = []

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  mockWebSocketInstances = []
  globalThis.WebSocket = vi.fn((url: string) => {
    const ws = new MockWebSocket(url)
    mockWebSocketInstances.push(ws)
    return ws
  }) as unknown as typeof WebSocket

  // Add static properties
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).OPEN = MockWebSocket.OPEN
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CONNECTING = MockWebSocket.CONNECTING
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CLOSING = MockWebSocket.CLOSING
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CLOSED = MockWebSocket.CLOSED

  vi.useFakeTimers()
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('BroadcastClient', () => {
  describe('connection and disconnection', () => {
    it('starts in disconnected state', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      expect(client.state).toBe('disconnected')
    })

    it('transitions to connecting when connect() is called', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()
      expect(client.state).toBe('connecting')
    })

    it('transitions to connected when WebSocket opens', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      expect(client.state).toBe('connected')
    })

    it('transitions to disconnected when disconnect() is called', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      client.disconnect()
      expect(client.state).toBe('disconnected')
    })

    it('does not create new WebSocket if already open', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      client.connect()

      expect(mockWebSocketInstances).toHaveLength(1)
    })

    it('does not create new WebSocket if currently connecting', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()
      client.connect()

      expect(mockWebSocketInstances).toHaveLength(1)
    })
  })

  describe('subscription management', () => {
    it('sends subscribe message when subscribing to new channel', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      client.subscribe('order', () => {})

      const messages = ws.getSentMessages()
      expect(messages).toContain(JSON.stringify({ subscribe: ['order'] }))
    })

    it('does not send subscribe for existing channel', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      client.subscribe('order', () => {})
      client.subscribe('order', () => {})

      const messages = ws.getSentMessages()
      const subscribeMessages = messages.filter((m) => m.includes('subscribe'))
      expect(subscribeMessages).toHaveLength(1)
    })

    it('sends unsubscribe when last handler is removed', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const unsubscribe = client.subscribe('order', () => {})
      unsubscribe()

      const messages = ws.getSentMessages()
      expect(messages).toContain(JSON.stringify({ unsubscribe: ['order'] }))
    })

    it('does not send unsubscribe when other handlers remain', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const unsubscribe1 = client.subscribe('order', () => {})
      client.subscribe('order', () => {})

      unsubscribe1()

      const messages = ws.getSentMessages()
      const unsubscribeMessages = messages.filter((m) => m.includes('unsubscribe'))
      expect(unsubscribeMessages).toHaveLength(0)
    })

    it('resubscribes to all channels on reconnect', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast', {
        reconnectDelay: 100,
      })
      client.connect()

      const ws1 = mockWebSocketInstances[0]
      ws1.simulateOpen()

      client.subscribe('order', () => {})
      client.subscribe('contact', () => {})

      // Simulate disconnect and reconnect
      ws1.simulateClose()
      vi.advanceTimersByTime(100)

      const ws2 = mockWebSocketInstances[1]
      ws2.simulateOpen()

      const messages = ws2.getSentMessages()
      const parsed = JSON.parse(messages[0])
      expect(parsed.subscribe).toEqual(expect.arrayContaining(['order', 'contact']))
    })

    it('allows subscribing before connection is established', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')

      // Subscribe before connecting
      const handler = vi.fn()
      client.subscribe('order', handler)

      // Now connect
      client.connect()
      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      // Should have sent subscribe on connect
      const messages = ws.getSentMessages()
      expect(messages).toContain(JSON.stringify({ subscribe: ['order'] }))
    })
  })

  describe('message parsing', () => {
    it('dispatches messages to subscribed handlers', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const events: BroadcastEvent[] = []
      client.subscribe('order', (event) => events.push(event))

      const testEvent: BroadcastEvent = {
        channel: 'order',
        event: 'created',
        payload: { entity_id: '123' },
      }
      ws.simulateMessage(testEvent)

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual(testEvent)
    })

    it('dispatches to multiple handlers on same channel', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const events1: BroadcastEvent[] = []
      const events2: BroadcastEvent[] = []

      client.subscribe('order', (event) => events1.push(event))
      client.subscribe('order', (event) => events2.push(event))

      const testEvent: BroadcastEvent = {
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '456' },
      }
      ws.simulateMessage(testEvent)

      expect(events1).toHaveLength(1)
      expect(events2).toHaveLength(1)
    })

    it('only dispatches to handlers on matching channel', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const orderEvents: BroadcastEvent[] = []
      const contactEvents: BroadcastEvent[] = []

      client.subscribe('order', (event) => orderEvents.push(event))
      client.subscribe('contact', (event) => contactEvents.push(event))

      const testEvent: BroadcastEvent = {
        channel: 'order',
        event: 'deleted',
        payload: { entity_id: '789' },
      }
      ws.simulateMessage(testEvent)

      expect(orderEvents).toHaveLength(1)
      expect(contactEvents).toHaveLength(0)
    })

    it('ignores malformed messages', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const events: BroadcastEvent[] = []
      client.subscribe('order', (event) => events.push(event))

      // Simulate malformed message
      ws.onmessage?.({ data: 'not valid json' })

      expect(events).toHaveLength(0)
    })

    it('handles messages with empty payload', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      const events: BroadcastEvent[] = []
      client.subscribe('order', (event) => events.push(event))

      const testEvent: BroadcastEvent = {
        channel: 'order',
        event: 'ping',
        payload: {},
      }
      ws.simulateMessage(testEvent)

      expect(events).toHaveLength(1)
      expect(events[0].payload).toEqual({})
    })
  })

  describe('reconnection logic', () => {
    it('transitions to reconnecting when WebSocket closes', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()
      ws.simulateClose()

      expect(client.state).toBe('reconnecting')
    })

    it('uses exponential backoff for reconnection', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast', {
        reconnectDelay: 100,
        maxReconnectAttempts: 5,
      })
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateClose()

      // First attempt after 100ms (100 * 2^0)
      vi.advanceTimersByTime(99)
      expect(mockWebSocketInstances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(mockWebSocketInstances).toHaveLength(2)

      mockWebSocketInstances[1].simulateClose()

      // Second attempt after 200ms (100 * 2^1)
      vi.advanceTimersByTime(199)
      expect(mockWebSocketInstances).toHaveLength(2)
      vi.advanceTimersByTime(1)
      expect(mockWebSocketInstances).toHaveLength(3)

      mockWebSocketInstances[2].simulateClose()

      // Third attempt after 400ms (100 * 2^2)
      vi.advanceTimersByTime(399)
      expect(mockWebSocketInstances).toHaveLength(3)
      vi.advanceTimersByTime(1)
      expect(mockWebSocketInstances).toHaveLength(4)
    })

    it('transitions to disconnected after max reconnect attempts', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast', {
        maxReconnectAttempts: 2,
        reconnectDelay: 100,
      })
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateClose()

      // First reconnect attempt
      vi.advanceTimersByTime(100)
      expect(client.state).toBe('connecting')
      mockWebSocketInstances[1].simulateClose()

      // Second reconnect attempt
      vi.advanceTimersByTime(200)
      expect(client.state).toBe('connecting')
      mockWebSocketInstances[2].simulateClose()

      // Should be disconnected after max attempts
      expect(client.state).toBe('disconnected')
    })

    it('resets reconnect attempts on successful connection', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast', {
        reconnectDelay: 100,
        maxReconnectAttempts: 5,
      })
      client.connect()

      const ws1 = mockWebSocketInstances[0]
      ws1.simulateClose()

      // First reconnect
      vi.advanceTimersByTime(100)
      mockWebSocketInstances[1].simulateOpen()

      // Disconnect again
      mockWebSocketInstances[1].simulateClose()

      // Should start from 100ms again (not 200ms)
      vi.advanceTimersByTime(99)
      expect(mockWebSocketInstances).toHaveLength(2)
      vi.advanceTimersByTime(1)
      expect(mockWebSocketInstances).toHaveLength(3)
    })

    it('cancels pending reconnect on disconnect', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast', {
        reconnectDelay: 100,
      })
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateClose()

      // Disconnect before reconnect timer fires
      client.disconnect()

      vi.advanceTimersByTime(200)

      // Should not have created new WebSocket
      expect(mockWebSocketInstances).toHaveLength(1)
    })

    it('handles WebSocket error by closing', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()
      ws.simulateError()

      // Error should trigger close and reconnection
      expect(client.state).toBe('reconnecting')
    })
  })

  describe('state change listeners', () => {
    it('notifies listeners of state changes', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      const states: ConnectionState[] = []

      client.onStateChange((state) => states.push(state))
      client.connect()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      expect(states).toEqual(['connecting', 'connected'])
    })

    it('allows unsubscribing from state changes', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      const states: ConnectionState[] = []

      const unsubscribe = client.onStateChange((state) => states.push(state))
      client.connect()

      unsubscribe()

      const ws = mockWebSocketInstances[0]
      ws.simulateOpen()

      expect(states).toEqual(['connecting'])
    })

    it('supports multiple state listeners', () => {
      const client = new BroadcastClient('ws://localhost:8000/ws/broadcast')
      const states1: ConnectionState[] = []
      const states2: ConnectionState[] = []

      client.onStateChange((state) => states1.push(state))
      client.onStateChange((state) => states2.push(state))

      client.connect()

      expect(states1).toEqual(['connecting'])
      expect(states2).toEqual(['connecting'])
    })
  })
})

describe('Singleton API', () => {
  it('initBroadcast creates and returns client', () => {
    const client = initBroadcast('ws://localhost:8000/ws/broadcast')

    expect(client).toBeInstanceOf(BroadcastClient)
    expect(client.state).toBe('connecting')
  })

  it('getBroadcastClient returns the initialized client', () => {
    const client1 = initBroadcast('ws://localhost:8000/ws/broadcast')
    const client2 = getBroadcastClient()

    expect(client1).toBe(client2)
  })

  it('initBroadcast disconnects previous client', () => {
    const client1 = initBroadcast('ws://localhost:8000/ws/broadcast')
    mockWebSocketInstances[0].simulateOpen()

    expect(client1.state).toBe('connected')

    const client2 = initBroadcast('ws://localhost:8000/ws/broadcast')

    expect(client1.state).toBe('disconnected')
    expect(client2).not.toBe(client1)
  })

  it('initBroadcast accepts options', () => {
    initBroadcast('ws://localhost:8000/ws/broadcast', {
      maxReconnectAttempts: 3,
      reconnectDelay: 500,
    })

    // Verify options are applied by testing reconnect behavior
    mockWebSocketInstances[0].simulateClose()

    // Should wait 500ms for first reconnect (not default 1000ms)
    vi.advanceTimersByTime(499)
    expect(mockWebSocketInstances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(mockWebSocketInstances).toHaveLength(2)
  })
})
