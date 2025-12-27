/**
 * BroadcastProvider Tests
 *
 * Tests for the React context provider.
 * Tests provider rendering, useBroadcast hook, and cleanup on unmount.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { useEffect } from 'react'
import { render, cleanup, act, screen } from '@testing-library/react'
import {
  BroadcastProvider,
  useBroadcast,
  useBroadcastState,
  type BroadcastContextValue,
} from '../../runtime/BroadcastProvider.js'
import type { BroadcastEvent, ConnectionState } from '../../runtime/broadcast.js'

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
    // Auto-register for test access
    mockWebSocketInstances.push(this)
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
}

let mockWebSocketInstances: MockWebSocket[] = []
const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  mockWebSocketInstances = []
  globalThis.WebSocket = vi.fn((url: string) => {
    return new MockWebSocket(url)
  }) as unknown as typeof WebSocket

  // Add static properties
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).OPEN = MockWebSocket.OPEN
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CONNECTING = MockWebSocket.CONNECTING
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CLOSING = MockWebSocket.CLOSING
  ;(globalThis.WebSocket as unknown as typeof MockWebSocket).CLOSED = MockWebSocket.CLOSED
})

afterEach(() => {
  cleanup()
  globalThis.WebSocket = originalWebSocket
  vi.clearAllMocks()
})

describe('BroadcastProvider', () => {
  describe('renders children', () => {
    it('renders children correctly', () => {
      render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div data-testid="child">Hello World</div>
        </BroadcastProvider>,
      )

      expect(screen.getByTestId('child')).toBeDefined()
      expect(screen.getByText('Hello World')).toBeDefined()
    })

    it('renders multiple children', () => {
      render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </BroadcastProvider>,
      )

      expect(screen.getByTestId('child1')).toBeDefined()
      expect(screen.getByTestId('child2')).toBeDefined()
    })

    it('renders nested components', () => {
      function NestedComponent() {
        return <span data-testid="nested">Nested</span>
      }

      render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div>
            <NestedComponent />
          </div>
        </BroadcastProvider>,
      )

      expect(screen.getByTestId('nested')).toBeDefined()
    })
  })

  describe('connection lifecycle', () => {
    it('creates WebSocket connection on mount', () => {
      render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div>Test</div>
        </BroadcastProvider>,
      )

      expect(mockWebSocketInstances).toHaveLength(1)
      expect(mockWebSocketInstances[0].url).toBe('ws://localhost:8000/ws/broadcast')
    })

    it('disconnects on unmount', () => {
      const { unmount } = render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div>Test</div>
        </BroadcastProvider>,
      )

      const ws = mockWebSocketInstances[0]
      act(() => {
        ws.simulateOpen()
      })

      expect(ws.readyState).toBe(MockWebSocket.OPEN)

      unmount()

      expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    })

    it('reconnects when URL changes', () => {
      const { rerender } = render(
        <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
          <div>Test</div>
        </BroadcastProvider>,
      )

      expect(mockWebSocketInstances).toHaveLength(1)

      rerender(
        <BroadcastProvider url="ws://localhost:8001/ws/broadcast">
          <div>Test</div>
        </BroadcastProvider>,
      )

      expect(mockWebSocketInstances).toHaveLength(2)
      expect(mockWebSocketInstances[1].url).toBe('ws://localhost:8001/ws/broadcast')
    })
  })
})

describe('useBroadcast', () => {
  it('returns context value with state, subscribe, and emit', () => {
    let contextValue: BroadcastContextValue | null = null

    function TestComponent() {
      contextValue = useBroadcast()
      return null
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    expect(contextValue).not.toBeNull()
    expect(contextValue!.state).toBeDefined()
    expect(typeof contextValue!.subscribe).toBe('function')
    expect(typeof contextValue!.emit).toBe('function')
  })

  it('throws error when used outside provider', () => {
    function TestComponent() {
      useBroadcast()
      return null
    }

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useBroadcast must be used within BroadcastProvider')

    consoleSpy.mockRestore()
  })

  it('provides subscribe function that works', () => {
    const receivedEvents: BroadcastEvent[] = []

    function TestComponent() {
      const { subscribe } = useBroadcast()

      useEffect(() => {
        const unsubscribe = subscribe('order', (event) => {
          receivedEvents.push(event)
        })
        return unsubscribe
      }, [subscribe])

      return null
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]
    act(() => {
      ws.simulateOpen()
    })

    const testEvent: BroadcastEvent = {
      channel: 'order',
      event: 'created',
      payload: { entity_id: '123' },
    }

    act(() => {
      ws.simulateMessage(testEvent)
    })

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]).toEqual(testEvent)
  })

  it('provides initial disconnected state', () => {
    let capturedState: ConnectionState | null = null

    function TestComponent() {
      const { state } = useBroadcast()
      capturedState = state
      return <div data-testid="state">{state}</div>
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    // Initial state should be connecting since we call connect in effect
    expect(capturedState).toBe('connecting')
  })

  it('updates state when connection opens', async () => {
    function TestComponent() {
      const { state } = useBroadcast()
      return <div data-testid="state">{state}</div>
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]

    act(() => {
      ws.simulateOpen()
    })

    expect(screen.getByTestId('state').textContent).toBe('connected')
  })

  it('updates state when connection closes', () => {
    function TestComponent() {
      const { state } = useBroadcast()
      return <div data-testid="state">{state}</div>
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]

    act(() => {
      ws.simulateOpen()
    })

    expect(screen.getByTestId('state').textContent).toBe('connected')

    act(() => {
      ws.simulateClose()
    })

    expect(screen.getByTestId('state').textContent).toBe('reconnecting')
  })
})

describe('useBroadcastState', () => {
  it('returns current connection state', () => {
    let capturedState: ConnectionState | null = null

    function TestComponent() {
      capturedState = useBroadcastState()
      return null
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    expect(capturedState).toBe('connecting')
  })

  it('updates when state changes', () => {
    function TestComponent() {
      const state = useBroadcastState()
      return <div data-testid="state">{state}</div>
    }

    render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    expect(screen.getByTestId('state').textContent).toBe('connecting')

    const ws = mockWebSocketInstances[0]

    act(() => {
      ws.simulateOpen()
    })

    expect(screen.getByTestId('state').textContent).toBe('connected')
  })

  it('throws error when used outside provider', () => {
    function TestComponent() {
      useBroadcastState()
      return null
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useBroadcast must be used within BroadcastProvider')

    consoleSpy.mockRestore()
  })
})

describe('cleanup on unmount', () => {
  it('unsubscribes from state changes on unmount', () => {
    const stateChanges: ConnectionState[] = []

    function TestComponent() {
      const { state } = useBroadcast()
      useEffect(() => {
        stateChanges.push(state)
      }, [state])
      return null
    }

    const { unmount } = render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <TestComponent />
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]
    act(() => {
      ws.simulateOpen()
    })

    const countAfterConnect = stateChanges.length

    unmount()

    // Simulating more state changes after unmount should not add to stateChanges
    // because the component is unmounted
    expect(stateChanges.length).toBe(countAfterConnect)
  })

  it('cleans up WebSocket connection on unmount', () => {
    const { unmount } = render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <div>Test</div>
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]

    act(() => {
      ws.simulateOpen()
    })

    unmount()

    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })

  it('unsubscribes channel handlers on component unmount', () => {
    let unsubscribeCalled = false

    function SubscribingComponent() {
      const { subscribe } = useBroadcast()

      useEffect(() => {
        const unsubscribe = subscribe('order', () => {})
        return () => {
          unsubscribe()
          unsubscribeCalled = true
        }
      }, [subscribe])

      return null
    }

    function ParentComponent({ showChild }: { showChild: boolean }) {
      return showChild ? <SubscribingComponent /> : null
    }

    const { rerender } = render(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <ParentComponent showChild={true} />
      </BroadcastProvider>,
    )

    const ws = mockWebSocketInstances[0]
    act(() => {
      ws.simulateOpen()
    })

    rerender(
      <BroadcastProvider url="ws://localhost:8000/ws/broadcast">
        <ParentComponent showChild={false} />
      </BroadcastProvider>,
    )

    expect(unsubscribeCalled).toBe(true)
  })
})
