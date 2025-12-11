/**
 * API Client Types
 *
 * Configuration and utility types for the generated API client
 */

export interface APIClientConfig {
  baseUrl: string
  timeout?: number
  defaultHeaders?: Record<string, string>
  retries?: number
  getAuthToken?: () => Promise<string | null> | string | null
  onRequest?: (config: any) => any
  onRequestError?: (error: any) => void
  onResponse?: (response: any) => any
  onResponseError?: (error: any) => Promise<any> | any
  onError?: (error: APIError) => void
}

export interface RequestOptions {
  params?: Record<string, any>
  data?: any
  headers?: Record<string, string>
  config?: any
  signal?: AbortSignal
  [key: string]: any
}

export interface APIError {
  message: string
  status?: number
  statusText?: string
  data?: any
  config: {
    url?: string
    method?: string
    headers?: any
  }
}