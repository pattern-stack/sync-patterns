/**
 * TUI API Client Utility
 *
 * Lightweight API client for the TUI that mirrors the generated API client structure.
 * This allows the TUI to work before code generation while using the same patterns.
 *
 * When generated code is available, this could be replaced with dynamic imports
 * of the generated client, but for now it provides a consistent interface.
 */

interface ApiConfig {
  baseUrl: string
  authToken?: string
}

let config: ApiConfig = {
  baseUrl: '',
  authToken: undefined,
}

/**
 * Configure the API client
 */
export function configureApi(newConfig: Partial<ApiConfig>): void {
  config = { ...config, ...newConfig }
}

/**
 * Get current API configuration
 */
export function getApiConfig(): ApiConfig {
  return { ...config }
}

/**
 * Build headers with auth
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.authToken) {
    headers['Authorization'] = `Bearer ${config.authToken}`
  }

  return headers
}

/**
 * Handle response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText)
    throw new Error(`API Error ${response.status}: ${error}`)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  // Try to parse JSON
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return await response.json()
  }

  // Fallback to text
  return (await response.text()) as unknown as T
}

/**
 * Build query string from params
 */
function buildQueryString(params?: Record<string, string | number | boolean>): string {
  if (!params || Object.keys(params).length === 0) {
    return ''
  }

  const query = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return query ? `?${query}` : ''
}

/**
 * API client with HTTP methods
 */
export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const queryString = buildQueryString(params)
    const response = await fetch(`${config.baseUrl}${path}${queryString}`, {
      method: 'GET',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  },
}
