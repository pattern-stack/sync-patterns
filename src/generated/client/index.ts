/**
 * Generated API Client
 *
 * Auto-generated from OpenAPI specification
 *
 * Configuration:
 *   - Set VITE_API_URL environment variable for API URL
 *   - Default fallback: 
 *   - Auth token key: auth_token
 */

/// <reference types="vite/client" />

export * from './client'
export * from './methods'
export * from './types'
export * from './config'

// Import createAPIClient explicitly for use below (export * doesn't hoist)
import { createAPIClient } from './config'

// Environment variable for API URL (works with Vite, Next.js, CRA, etc.)
// Vite uses import.meta.env, Next.js/CRA use process.env (bundler replaces at build time)
function getApiUrl(): string {
  // Vite environment
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  // Fallback URL
  return ''
}

const API_URL = getApiUrl()

// Singleton instance for convenient usage
export const apiClient = createAPIClient({
  baseUrl: API_URL,
  timeout: 10000,
  defaultHeaders: {
    'Content-Type': 'application/json'
  },
  // Read auth token from localStorage
  getAuthToken: () => {
    return localStorage.getItem('auth_token')
  }
})