/**
 * useBroadcastInvalidation Hook Tests
 *
 * Tests for the TanStack Query cache invalidation hook.
 * Tests query invalidation on broadcast events, entity_id specific
 * invalidation, and enabled flag behavior.
 *
 * These tests mock the React hooks to test the hook logic directly
 * without requiring a DOM environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import type { BroadcastEvent, BroadcastHandler } from '../../src/runtime/broadcast.js'

// Track effect callbacks for testing
let effectCallback: (() => void | (() => void)) | null = null
let effectCleanup: (() => void) | null = null
let effectDeps: unknown[] | null = null

// Mock React hooks
vi.mock('react', () => ({
  useEffect: vi.fn((callback: () => void | (() => void), deps?: unknown[]) => {
    effectCallback = callback
    effectDeps = deps ?? null
    const cleanup = callback()
    effectCleanup = cleanup ?? null
  }),
  useRef: vi.fn((initialValue: unknown) => ({
    current: initialValue,
  })),
}))

// Mock QueryClient
const mockInvalidateQueries = vi.fn()
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => mockQueryClient),
}))

// Track broadcast subscriptions
let subscribeHandler: BroadcastHandler | null = null
let subscribedChannel: string | null = null
const mockSubscribe = vi.fn((channel: string, handler: BroadcastHandler) => {
  subscribedChannel = channel
  subscribeHandler = handler
  return () => {
    subscribedChannel = null
    subscribeHandler = null
  }
})

vi.mock('../../src/runtime/BroadcastProvider.js', () => ({
  useBroadcast: vi.fn(() => ({
    state: 'connected' as const,
    subscribe: mockSubscribe,
  })),
}))

// Helper to simulate broadcast events
function simulateBroadcast(event: BroadcastEvent): void {
  if (subscribeHandler && subscribedChannel === event.channel) {
    subscribeHandler(event)
  }
}

// Helper to get subscribed channel
function getSubscribedChannel(): string | null {
  return subscribedChannel
}

// Reset mock state
function resetMocks(): void {
  subscribedChannel = null
  subscribeHandler = null
  effectCallback = null
  effectCleanup = null
  effectDeps = null
  mockInvalidateQueries.mockClear()
  mockSubscribe.mockClear()
}

// Simulate re-running effect (for enabled/channel changes)
function rerenderEffect(): void {
  // Call cleanup first
  if (effectCleanup) {
    effectCleanup()
  }
  // Then re-run effect
  if (effectCallback) {
    const cleanup = effectCallback()
    effectCleanup = cleanup ?? null
  }
}

describe('useBroadcastInvalidation', () => {
  // Import dynamically to pick up mocks
  let useBroadcastInvalidation: typeof import('../../src/runtime/useBroadcastInvalidation.js').useBroadcastInvalidation

  beforeEach(async () => {
    resetMocks()
    // Re-import to get fresh module with mocks
    const module = await import('../../src/runtime/useBroadcastInvalidation.js')
    useBroadcastInvalidation = module.useBroadcastInvalidation
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('subscription', () => {
    it('subscribes to the specified channel', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      expect(getSubscribedChannel()).toBe('order')
    })

    it('calls subscribe with correct channel', () => {
      useBroadcastInvalidation({
        channel: 'contact',
        queryKeyPrefix: ['contacts'],
      })

      expect(mockSubscribe).toHaveBeenCalledWith('contact', expect.any(Function))
    })

    it('unsubscribes on cleanup', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      expect(getSubscribedChannel()).toBe('order')

      // Simulate unmount/cleanup
      if (effectCleanup) {
        effectCleanup()
      }

      expect(getSubscribedChannel()).toBeNull()
    })

    it('does not subscribe when enabled=false', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
        enabled: false,
      })

      expect(mockSubscribe).not.toHaveBeenCalled()
      expect(getSubscribedChannel()).toBeNull()
    })
  })

  describe('query invalidation on broadcast', () => {
    it('invalidates queries when broadcast event received', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: {},
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders'],
      })
    })

    it('invalidates specific entity query when entity_id provided', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '123' },
      })

      // Should invalidate both the specific entity and the list
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', '123'],
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders'],
        exact: true,
      })
    })

    it('uses provided queryKeyPrefix for entity-specific invalidation', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders', 'active'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '456' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', 'active', '456'],
      })
    })

    it('invalidates list query with exact match when entity_id provided', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '789' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders'],
        exact: true,
      })
    })
  })

  describe('enabled flag', () => {
    it('does not invalidate when enabled=false', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
        enabled: false,
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: {},
      })

      expect(mockInvalidateQueries).not.toHaveBeenCalled()
    })

    it('enabled defaults to true', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      // Should have subscribed (enabled=true is default)
      expect(mockSubscribe).toHaveBeenCalled()
    })
  })

  describe('useEffect dependencies', () => {
    it('includes channel in effect dependencies', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      expect(effectDeps).toContain('order')
    })

    it('includes enabled in effect dependencies', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
        enabled: true,
      })

      expect(effectDeps).toContain(true)
    })
  })

  describe('multiple events', () => {
    it('handles multiple broadcast events', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: { entity_id: '1' },
      })

      simulateBroadcast({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '2' },
      })

      simulateBroadcast({
        channel: 'order',
        event: 'deleted',
        payload: { entity_id: '3' },
      })

      // Each event should trigger invalidation (entity + list for each with entity_id)
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(6)
    })

    it('invalidates correctly for each entity', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: { entity_id: 'abc' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', 'abc'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: 'xyz' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', 'xyz'],
      })
    })
  })

  describe('channel filtering', () => {
    it('only responds to subscribed channel', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      // This should not trigger invalidation (different channel)
      simulateBroadcast({
        channel: 'contact',
        event: 'created',
        payload: {},
      })

      expect(mockInvalidateQueries).not.toHaveBeenCalled()
    })
  })

  describe('payload variations', () => {
    it('handles payload without entity_id', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'bulk_update',
        payload: { count: 5 },
      })

      // Should only invalidate prefix (no entity_id)
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(1)
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders'],
      })
    })

    it('handles empty payload', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'refresh',
        payload: {},
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders'],
      })
    })
  })

  describe('queryKeyPrefix array handling', () => {
    it('handles single element prefix', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: { entity_id: '1' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', '1'],
      })
    })

    it('handles multi-element prefix', () => {
      useBroadcastInvalidation({
        channel: 'order',
        queryKeyPrefix: ['orders', 'v2', 'active'],
      })

      simulateBroadcast({
        channel: 'order',
        event: 'created',
        payload: { entity_id: '1' },
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['orders', 'v2', 'active', '1'],
      })
    })
  })
})
