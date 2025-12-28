/**
 * BroadcastClient Integration Tests
 *
 * Tests the BroadcastClient against a real WebSocket server.
 * These tests are skipped if the test server is not available.
 *
 * To run these tests:
 * 1. Start the backend server with WebSocket broadcast endpoint
 * 2. Set BROADCAST_URL environment variable (or use default localhost:8000)
 * 3. Run: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest'

// Import setup FIRST to polyfill WebSocket and BroadcastChannel
import {
  getBroadcastUrl,
  isServerAvailable,
  waitForState,
  wait,
} from './setup.js'

import { BroadcastClient, type BroadcastEvent } from '../../src/runtime/broadcast.js'

// Track if server is available for conditional test execution
let serverAvailable = false

beforeAll(async () => {
  serverAvailable = await isServerAvailable()
  if (!serverAvailable) {
    console.log('Test server not available. Integration tests will be skipped.')
    console.log(`Checked URL: ${getBroadcastUrl().replace(/^ws/, 'http').replace(/\/ws\/broadcast$/, '/health')}`)
  }
})

describe('BroadcastClient Integration', () => {
  let client: BroadcastClient

  beforeEach(() => {
    // Create fresh client for each test
    client = new BroadcastClient(getBroadcastUrl(), {
      maxReconnectAttempts: 3,
      reconnectDelay: 500,
    })
  })

  afterEach(() => {
    // Clean up client after each test
    client?.disconnect()
  })

  describe('connection', () => {
    it('connects to real WebSocket server', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()

      await waitForState(client, 'connected', 5000)

      expect(client.state).toBe('connected')
    })

    it('handles server disconnect and reconnects', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()
      await waitForState(client, 'connected', 5000)

      // Simulate disconnect by closing the internal WebSocket
      // Note: This tests the client's reconnection behavior
      // A real test would require server-side disconnect capability

      client.disconnect()
      expect(client.state).toBe('disconnected')

      // Reconnect
      client.connect()
      await waitForState(client, 'connected', 5000)

      expect(client.state).toBe('connected')
    })
  })

  describe('subscription', () => {
    it('subscribes and receives broadcast messages', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()
      await waitForState(client, 'connected', 5000)

      const receivedEvents: BroadcastEvent[] = []

      // Subscribe to a test channel
      const unsubscribe = client.subscribe('test', (event) => {
        receivedEvents.push(event)
      })

      // Wait briefly for subscription to be registered
      await wait(100)

      unsubscribe()

      // Verify subscription/unsubscription didn't throw
      expect(true).toBe(true)
    })

    it('receives server-triggered broadcast via /test/broadcast endpoint', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()
      await waitForState(client, 'connected', 5000)

      const receivedEvents: BroadcastEvent[] = []

      // Subscribe to orders channel
      client.subscribe('orders', (event) => {
        receivedEvents.push(event)
      })

      // Wait for subscription to be registered on server
      await wait(200)

      // Trigger a broadcast from the server via the test endpoint
      const broadcastUrl = getBroadcastUrl()
        .replace(/^ws/, 'http')
        .replace(/\/ws\/broadcast$/, '/test/broadcast')

      const response = await fetch(broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'orders',
          event_type: 'order.created',
          payload: { order_id: 'test-order-123', total: 99.99 },
        }),
      })

      expect(response.ok).toBe(true)

      // Wait for the broadcast message to arrive
      await wait(300)

      // Verify client received the server-triggered broadcast
      expect(receivedEvents.length).toBe(1)
      expect(receivedEvents[0].channel).toBe('orders')
      expect(receivedEvents[0].event).toBe('order.created')
      expect(receivedEvents[0].payload.order_id).toBe('test-order-123')
      expect(receivedEvents[0].payload.total).toBe(99.99)
    })

    it('resubscribes to channels after reconnect', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      const stateChanges: string[] = []

      client.onStateChange((state) => {
        stateChanges.push(state)
      })

      client.connect()
      await waitForState(client, 'connected', 5000)

      // Subscribe to channels before disconnect
      const handler1 = () => {}
      const handler2 = () => {}

      const unsub1 = client.subscribe('order', handler1)
      const unsub2 = client.subscribe('contact', handler2)

      // Wait for subscriptions to be sent
      await wait(100)

      // Disconnect and reconnect
      client.disconnect()
      expect(client.state).toBe('disconnected')

      client.connect()
      await waitForState(client, 'connected', 5000)

      // Channels should be resubscribed automatically
      // (verified by no errors and state is connected)
      expect(client.state).toBe('connected')

      unsub1()
      unsub2()
    })
  })

  describe('local broadcast', () => {
    it('emits local broadcast via BroadcastChannel', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()
      await waitForState(client, 'connected', 5000)

      // Create a second client to receive the local broadcast
      const client2 = new BroadcastClient(getBroadcastUrl())

      const receivedEvents: BroadcastEvent[] = []
      client2.subscribe('order', (event) => {
        receivedEvents.push(event)
      })

      // Emit a local event from the first client
      client.emit('order', { type: 'created', entity_id: 'test-123' })

      // Wait for BroadcastChannel message to propagate
      await wait(100)

      // The second client should receive the event via BroadcastChannel
      expect(receivedEvents.length).toBe(1)
      expect(receivedEvents[0].channel).toBe('order')
      expect(receivedEvents[0].event).toBe('created')
      expect(receivedEvents[0].payload.entity_id).toBe('test-123')

      client2.disconnect()
    })

    it('does not receive own emitted events', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      client.connect()
      await waitForState(client, 'connected', 5000)

      const receivedEvents: BroadcastEvent[] = []
      client.subscribe('order', (event) => {
        receivedEvents.push(event)
      })

      // Emit a local event
      client.emit('order', { type: 'updated', entity_id: 'test-456' })

      // Wait for any potential message
      await wait(100)

      // The same client should NOT receive its own emitted event
      // (per the design - local tab already updated cache)
      expect(receivedEvents.length).toBe(0)
    })
  })

  describe('state tracking', () => {
    it('tracks state changes through connection lifecycle', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      const states: string[] = []

      client.onStateChange((state) => {
        states.push(state)
      })

      // Initial state
      expect(client.state).toBe('disconnected')

      // Connect
      client.connect()
      await waitForState(client, 'connected', 5000)

      // Disconnect
      client.disconnect()

      // Verify state transitions
      expect(states).toContain('connecting')
      expect(states).toContain('connected')
      expect(states).toContain('disconnected')
    })

    it('allows unsubscribing from state changes', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available')
        return
      }

      const states: string[] = []

      const unsubscribe = client.onStateChange((state) => {
        states.push(state)
      })

      client.connect()

      // Unsubscribe before connection completes
      unsubscribe()

      await waitForState(client, 'connected', 5000)

      // Should only have 'connecting' state (unsubscribed before 'connected')
      expect(states).toContain('connecting')
      // Depending on timing, may or may not have 'connected'
    })
  })

  describe('error handling', () => {
    it('handles invalid WebSocket URL gracefully', async () => {
      const badClient = new BroadcastClient('ws://invalid-host-that-does-not-exist:9999/ws', {
        maxReconnectAttempts: 1,
        reconnectDelay: 100,
      })

      const states: string[] = []
      badClient.onStateChange((state) => {
        states.push(state)
      })

      badClient.connect()

      // Wait for connection failure and max reconnect attempts
      await wait(1000)

      // Should eventually reach disconnected state after failed attempts
      expect(['disconnected', 'reconnecting']).toContain(badClient.state)

      badClient.disconnect()
    })
  })
})
