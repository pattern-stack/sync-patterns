/**
 * Linked Record Cache
 *
 * Simple in-memory cache for linked records to avoid re-fetching
 * the same records multiple times in a single session.
 */

export interface LinkedRecord {
  /** Entity type (plural, e.g., "accounts") */
  entityType: string
  /** Record ID */
  id: string
  /** Display name/title of the record */
  displayName: string
  /** Full record data (for future use) */
  data: Record<string, unknown>
  /** Timestamp when cached */
  cachedAt: number
}

export interface LinkedRecordCacheEntry {
  record?: LinkedRecord
  error?: Error
  loading: boolean
}

/**
 * Global cache for linked records
 * Key format: "{entityType}:{id}"
 */
const cache = new Map<string, LinkedRecordCacheEntry>()

/**
 * Cache TTL in milliseconds (5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000

/**
 * Build cache key from entity type and ID
 */
function buildKey(entityType: string, id: string): string {
  return `${entityType}:${id}`
}

/**
 * Check if a cache entry is still valid
 */
function isValid(entry: LinkedRecordCacheEntry): boolean {
  if (!entry.record) return false
  const age = Date.now() - entry.record.cachedAt
  return age < CACHE_TTL
}

/**
 * Get a linked record from cache
 * Returns undefined if not in cache or expired
 */
export function getCachedRecord(entityType: string, id: string): LinkedRecordCacheEntry | undefined {
  const key = buildKey(entityType, id)
  const entry = cache.get(key)

  if (!entry) return undefined

  // If loading, return the loading state
  if (entry.loading) return entry

  // If error, return the error
  if (entry.error) return entry

  // Check if still valid
  if (entry.record && isValid(entry)) {
    return entry
  }

  // Expired, remove from cache
  cache.delete(key)
  return undefined
}

/**
 * Set a linked record in cache
 */
export function setCachedRecord(entityType: string, id: string, record: LinkedRecord): void {
  const key = buildKey(entityType, id)
  cache.set(key, {
    record: {
      ...record,
      cachedAt: Date.now(),
    },
    loading: false,
  })
}

/**
 * Set a loading state for a linked record
 */
export function setLoadingRecord(entityType: string, id: string): void {
  const key = buildKey(entityType, id)
  cache.set(key, {
    loading: true,
  })
}

/**
 * Set an error for a linked record
 */
export function setErrorRecord(entityType: string, id: string, error: Error): void {
  const key = buildKey(entityType, id)
  cache.set(key, {
    error,
    loading: false,
  })
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * Clear expired entries from cache
 */
export function cleanupCache(): void {
  const now = Date.now()

  for (const [key, entry] of cache.entries()) {
    if (entry.record) {
      const age = now - entry.record.cachedAt
      if (age >= CACHE_TTL) {
        cache.delete(key)
      }
    }
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
  }
}
