/**
 * Integration Test Setup
 *
 * Provides WebSocket and BroadcastChannel polyfills for Node.js
 * and helper utilities for testing the BroadcastClient against
 * a real WebSocket server.
 */

import * as ws from 'ws'

// Polyfill WebSocket for Node.js
if (typeof globalThis.WebSocket === 'undefined') {
  // ws package is compatible with browser WebSocket API
  globalThis.WebSocket = ws.WebSocket as unknown as typeof WebSocket
}

// Mock BroadcastChannel for Node.js (not available in Node)
if (typeof globalThis.BroadcastChannel === 'undefined') {
  class MockBroadcastChannel {
    name: string
    onmessage: ((event: MessageEvent) => void) | null = null

    constructor(name: string) {
      this.name = name
      MockBroadcastChannel.instances.push(this)
    }

    postMessage(message: unknown): void {
      // Dispatch to other instances with same name (simulating cross-tab)
      MockBroadcastChannel.instances
        .filter((instance) => instance !== this && instance.name === this.name)
        .forEach((instance) => {
          instance.onmessage?.({ data: message } as MessageEvent)
        })
    }

    close(): void {
      const index = MockBroadcastChannel.instances.indexOf(this)
      if (index > -1) {
        MockBroadcastChannel.instances.splice(index, 1)
      }
    }

    static instances: MockBroadcastChannel[] = []

    static clear(): void {
      MockBroadcastChannel.instances = []
    }
  }

  globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel
}

/**
 * Get the broadcast server URL from environment or default
 */
export function getBroadcastUrl(): string {
  return process.env.BROADCAST_URL || 'ws://localhost:8000/ws/broadcast'
}

/**
 * Get the health check URL derived from broadcast URL
 */
export function getHealthUrl(): string {
  const wsUrl = getBroadcastUrl()
  // Convert ws:// to http:// and /ws/broadcast to /health
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws\/broadcast$/, '/health')
}

/**
 * Check if the test server is available
 */
export async function isServerAvailable(): Promise<boolean> {
  try {
    const healthUrl = getHealthUrl()
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Connection state type
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

/**
 * Wait for a BroadcastClient to reach a specific state
 *
 * @param client - The BroadcastClient instance
 * @param targetState - The state to wait for
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @returns Promise that resolves when state is reached, rejects on timeout
 */
export function waitForState(
  client: { state: ConnectionState; onStateChange: (listener: (state: ConnectionState) => void) => () => void },
  targetState: ConnectionState,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already in target state
    if (client.state === targetState) {
      resolve()
      return
    }

    const timeoutId = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timeout waiting for state '${targetState}', current state is '${client.state}'`))
    }, timeout)

    const unsubscribe = client.onStateChange((state) => {
      if (state === targetState) {
        clearTimeout(timeoutId)
        unsubscribe()
        resolve()
      }
    })
  })
}

/**
 * Wait for a specified duration
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
