/**
 * API Client Generator
 *
 * Creates a type-safe API client with interceptors and error handling
 * based on parsed OpenAPI specifications.
 *
 * Migrated from frontend-patterns to sync-patterns
 */

import type { ParsedOpenAPI, ParsedEndpoint, ParsedParameter } from './parser'
import { toClientMethodName, generateFallbackName, toCamelCase } from './naming'

export interface ClientGeneratorOptions {
  clientType?: 'axios' | 'fetch'
  baseUrl?: string
  apiUrlEnvVar?: string
  includeAuth?: boolean
  authType?: 'bearer' | 'apiKey' | 'basic'
  authTokenKey?: string
  timeout?: number
  retries?: number
  includeInterceptors?: boolean
}

export interface GeneratedClient {
  client: string
  methods: string
  types: string
  config: string
  index: string
}

export class APIClientGenerator {
  private options: Required<ClientGeneratorOptions>

  constructor(options: Partial<ClientGeneratorOptions> = {}) {
    this.options = {
      clientType: options.clientType || 'axios',
      baseUrl: options.baseUrl || '',
      apiUrlEnvVar: options.apiUrlEnvVar || 'VITE_API_URL',
      includeAuth: options.includeAuth !== false,
      authType: options.authType || 'bearer',
      authTokenKey: options.authTokenKey || 'auth_token',
      timeout: options.timeout || 10000,
      retries: options.retries || 3,
      includeInterceptors: options.includeInterceptors !== false,
    }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedClient {
    return {
      client: this.generateClientSetup(),
      methods: this.generateApiMethods(parsedAPI.endpoints),
      types: this.generateClientTypes(),
      config: this.generateConfiguration(),
      index: this.generateIndexFile(),
    }
  }

  private generateClientSetup(): string {
    if (this.options.clientType === 'axios') {
      return this.generateAxiosClient()
    } else {
      return this.generateFetchClient()
    }
  }

  private generateAxiosClient(): string {
    return `/**
 * Axios API Client
 *
 * Auto-generated API client with interceptors and error handling
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { APIClientConfig, RequestOptions, APIError } from './types'

export class APIClient {
  private client: AxiosInstance
  private config: APIClientConfig

  constructor(config: APIClientConfig) {
    this.config = config
    this.client = this.createAxiosInstance()
    this.setupInterceptors()
  }

  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout || ${this.options.timeout},
      headers: {
        'Content-Type': 'application/json',
        ...this.config.defaultHeaders
      }
    })
  }

  ${this.options.includeInterceptors ? this.generateAxiosInterceptors() : ''}

  private async makeRequest<T>(
    method: string,
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    try {
      const config: AxiosRequestConfig = {
        method: method as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options',
        url,
        ...options.config
      }

      if (options.params) {
        config.params = options.params
      }

      if (options.data) {
        config.data = options.data
      }

      if (options.headers) {
        config.headers = { ...config.headers, ...options.headers }
      }

      ${this.options.includeAuth ? this.generateAuthInjection() : ''}

      const response: AxiosResponse<T> = await this.client.request(config)
      return response.data
    } catch (error) {
      throw this.handleError(error as AxiosError)
    }
  }

  private handleError(error: AxiosError): APIError {
    const apiError: APIError = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        headers: error.config?.headers
      }
    }

    if (this.config.onError) {
      this.config.onError(apiError)
    }

    return apiError
  }

  public get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('GET', url, options)
  }

  public post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('POST', url, { ...options, data })
  }

  public put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PUT', url, { ...options, data })
  }

  public patch<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PATCH', url, { ...options, data })
  }

  public delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('DELETE', url, options)
  }
}`
  }

  private generateFetchClient(): string {
    return `/**
 * Fetch API Client
 *
 * Auto-generated API client using native fetch with error handling
 */

import { APIClientConfig, RequestOptions, APIError } from './types'

export class APIClient {
  private config: APIClientConfig

  constructor(config: APIClientConfig) {
    this.config = config
  }

  private async makeRequest<T>(
    method: string,
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    try {
      const fullUrl = this.buildUrl(url, options.params)

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.defaultHeaders,
          ...options.headers
        },
        signal: options.signal
      }

      if (options.data && method !== 'GET') {
        fetchOptions.body = JSON.stringify(options.data)
      }

      ${this.options.includeAuth ? this.generateFetchAuthInjection() : ''}

      const response = await fetch(fullUrl, fetchOptions)

      if (!response.ok) {
        throw await this.createErrorFromResponse(response)
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      }

      return await response.text() as any
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        throw error
      }
      throw this.createGenericError(error as Error)
    }
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(path, this.config.baseUrl)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    return url.toString()
  }

  private async createErrorFromResponse(response: Response): Promise<APIError> {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = await response.text()
    }

    const error: APIError = {
      message: (data && typeof data === 'object' && 'message' in data ? (data as Record<string, unknown>).message : undefined) as string || response.statusText || 'Request failed',
      status: response.status,
      statusText: response.statusText,
      data,
      config: {
        url: response.url,
        method: 'Unknown'
      }
    }

    if (this.config.onError) {
      this.config.onError(error)
    }

    return error
  }

  private createGenericError(error: Error): APIError {
    const apiError: APIError = {
      message: error.message,
      config: {}
    }

    if (this.config.onError) {
      this.config.onError(apiError)
    }

    return apiError
  }

  public get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('GET', url, options)
  }

  public post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('POST', url, { ...options, data })
  }

  public put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PUT', url, { ...options, data })
  }

  public patch<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PATCH', url, { ...options, data })
  }

  public delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('DELETE', url, options)
  }
}`
  }

  private generateAxiosInterceptors(): string {
    return `
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.config.onRequest) {
          return this.config.onRequest(config) || config
        }
        return config
      },
      (error) => {
        if (this.config.onRequestError) {
          this.config.onRequestError(error)
        }
        return Promise.reject(error)
      }
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        if (this.config.onResponse) {
          return this.config.onResponse(response) || response
        }
        return response
      },
      async (error) => {
        if (this.config.onResponseError) {
          const result = await this.config.onResponseError(error)
          if (result) {
            return result
          }
        }

        // Auto-retry logic
        if (this.shouldRetry(error)) {
          return this.retryRequest(error.config)
        }

        return Promise.reject(error)
      }
    )
  }

  private shouldRetry(error: AxiosError): boolean {
    const retryCount = (error.config as any)?._retryCount || 0
    const maxRetries = this.config.retries || ${this.options.retries}

    return (
      retryCount < maxRetries &&
      (!error.response || error.response.status >= 500) &&
      error.code !== 'ECONNABORTED'
    )
  }

  private async retryRequest(config: AxiosRequestConfig & { _retryCount?: number }): Promise<AxiosResponse> {
    config._retryCount = (config._retryCount || 0) + 1

    // Exponential backoff
    const delay = Math.pow(2, config._retryCount) * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    return this.client.request(config)
  }`
  }

  private generateAuthInjection(): string {
    switch (this.options.authType) {
      case 'bearer':
        return `
      // Inject bearer token if available
      if (this.config.getAuthToken) {
        const token = await this.config.getAuthToken()
        if (token) {
          config.headers = {
            ...config.headers,
            Authorization: \`Bearer \${token}\`
          }
        }
      }`
      case 'apiKey':
        return `
      // Inject API key if available
      if (this.config.getApiKey) {
        const apiKey = await this.config.getApiKey()
        if (apiKey) {
          if (this.config.apiKeyHeader) {
            config.headers = {
              ...config.headers,
              [this.config.apiKeyHeader]: apiKey
            }
          } else {
            config.params = { ...config.params, api_key: apiKey }
          }
        }
      }`
      case 'basic':
        return `
      // Inject basic auth if available
      if (this.config.getBasicAuth) {
        const auth = await this.config.getBasicAuth()
        if (auth) {
          const encoded = btoa(\`\${auth.username}:\${auth.password}\`)
          config.headers = {
            ...config.headers,
            Authorization: \`Basic \${encoded}\`
          }
        }
      }`
      default:
        return ''
    }
  }

  private generateFetchAuthInjection(): string {
    switch (this.options.authType) {
      case 'bearer':
        return `
      // Inject bearer token if available
      if (this.config.getAuthToken) {
        const token = await this.config.getAuthToken()
        if (token) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            Authorization: \`Bearer \${token}\`
          }
        }
      }`
      case 'apiKey':
        return `
      // Inject API key if available
      if (this.config.getApiKey) {
        const apiKey = await this.config.getApiKey()
        if (apiKey && this.config.apiKeyHeader) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            [this.config.apiKeyHeader]: apiKey
          }
        }
      }`
      default:
        return ''
    }
  }

  private generateApiMethods(endpoints: ParsedEndpoint[]): string {
    const methods: string[] = []

    methods.push(this.generateFileHeader('API Methods'))
    methods.push('')
    methods.push("import { APIClient } from './client'")
    methods.push("import { RequestOptions } from './types'")
    methods.push('')

    methods.push('export class APIService {')
    methods.push('  constructor(private client: APIClient) {}')
    methods.push('')

    // Group endpoints by tags or path prefix
    const groupedEndpoints = this.groupEndpoints(endpoints)

    for (const [group, groupEndpoints] of Object.entries(groupedEndpoints)) {
      methods.push(`  // ${group} methods`)

      for (const endpoint of groupEndpoints) {
        const method = this.generateEndpointMethod(endpoint)
        methods.push(method)
        methods.push('')
      }
    }

    methods.push('}')

    return methods.join('\n')
  }

  private generateEndpointMethod(endpoint: ParsedEndpoint): string {
    const methodName = this.getMethodName(endpoint)
    const pathWithParams = this.generatePathWithParams(endpoint)
    const httpMethod = endpoint.method.toLowerCase()

    const lines: string[] = []

    // Generate JSDoc
    lines.push('  /**')
    if (endpoint.summary) {
      lines.push(`   * ${endpoint.summary}`)
    }
    if (endpoint.description) {
      lines.push(`   * ${endpoint.description}`)
    }
    lines.push(`   * @param options Request options`)
    lines.push('   */')

    // Generate method signature
    const hasPathParams = endpoint.parameters.some((p) => p.in === 'path')
    const hasQueryParams = endpoint.parameters.some((p) => p.in === 'query')
    const hasBody = endpoint.requestBody !== undefined

    let params = 'options: RequestOptions = {}'
    if (hasPathParams) {
      const pathParams = endpoint.parameters
        .filter((p) => p.in === 'path')
        .map((p) => `${p.name}: ${this.getParameterType(p)}`)
        .join(', ')
      params = `${pathParams}, ${params}`
    }

    const responseType = this.getResponseType(endpoint)

    lines.push(`  async ${methodName}(${params}): Promise<${responseType}> {`)

    // Generate method body
    const urlConstruction = hasPathParams
      ? `const url = \`${pathWithParams}\``
      : `const url = '${endpoint.path}'`

    lines.push(`    ${urlConstruction}`)

    if (hasQueryParams) {
      lines.push('    const queryParams = {')
      endpoint.parameters
        .filter((p) => p.in === 'query')
        .forEach((p) => {
          lines.push(`      ${p.name}: options.${p.name},`)
        })
      lines.push('    }')
      lines.push('    options.params = { ...queryParams, ...options.params }')
    }

    if (hasBody) {
      lines.push(
        `    return this.client.${httpMethod}<${responseType}>(url, options.data, options)`,
      )
    } else {
      lines.push(
        `    return this.client.${httpMethod}<${responseType}>(url, options)`,
      )
    }

    lines.push('  }')

    return lines.join('\n')
  }

  private generateClientTypes(): string {
    const authTypes = this.generateAuthTypes()

    return `/**
 * API Client Types
 *
 * Configuration and utility types for the generated API client
 */

export interface APIClientConfig {
  baseUrl: string
  timeout?: number
  defaultHeaders?: Record<string, string>
  retries?: number
  ${this.options.includeAuth ? authTypes : ''}
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
}`
  }

  private generateAuthTypes(): string {
    switch (this.options.authType) {
      case 'bearer':
        return 'getAuthToken?: () => Promise<string | null> | string | null'
      case 'apiKey':
        return `getApiKey?: () => Promise<string | null> | string | null
  apiKeyHeader?: string`
      case 'basic':
        return 'getBasicAuth?: () => Promise<{ username: string; password: string } | null> | { username: string; password: string } | null'
      default:
        return ''
    }
  }

  private generateConfiguration(): string {
    return `/**
 * API Client Configuration
 *
 * Default configuration and factory functions
 */

import { APIClient } from './client'
import { APIService } from './methods'
import { APIClientConfig } from './types'

export function createAPIClient(config: APIClientConfig): APIService {
  const client = new APIClient(config)
  return new APIService(client)
}

export const defaultConfig: Partial<APIClientConfig> = {
  timeout: ${this.options.timeout},
  retries: ${this.options.retries},
  defaultHeaders: {
    'Content-Type': 'application/json'
  }
}`
  }

  private generateIndexFile(): string {
    const envVar = this.options.apiUrlEnvVar
    // OpenAPI paths already include full path (e.g., /api/v1/...), so default to empty
    const fallbackUrl = this.options.baseUrl ?? ''
    const authTokenKey = this.options.authTokenKey

    const authConfig = this.options.includeAuth && this.options.authType === 'bearer'
      ? `
  // Read auth token from localStorage
  getAuthToken: () => {
    return localStorage.getItem('${authTokenKey}')
  }`
      : ''

    return `/**
 * Generated API Client
 *
 * Auto-generated from OpenAPI specification
 *
 * Configuration:
 *   - Set ${envVar} environment variable for API URL
 *   - Default fallback: ${fallbackUrl}
 *   - Auth token key: ${authTokenKey}
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
  if (typeof import.meta !== 'undefined' && import.meta.env?.${envVar}) {
    return import.meta.env.${envVar}
  }
  // Fallback URL
  return '${fallbackUrl}'
}

const API_URL = getApiUrl()

// Singleton instance for convenient usage
export const apiClient = createAPIClient({
  baseUrl: API_URL,
  timeout: ${this.options.timeout},
  defaultHeaders: {
    'Content-Type': 'application/json'
  },${authConfig}
})`
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually
 */`
  }

  private getMethodName(endpoint: ParsedEndpoint): string {
    // Use shared naming utility for consistent names across client and hooks
    if (endpoint.operationId) {
      return toClientMethodName(endpoint.operationId)
    }

    // Fallback for APIs without operationIds
    const fallbackName = generateFallbackName(endpoint)
    return toCamelCase(fallbackName)
  }

  private generatePathWithParams(endpoint: ParsedEndpoint): string {
    return endpoint.path.replace(/{([^}]+)}/g, '${$1}')
  }

  private getParameterType(param: ParsedParameter): string {
    switch (param.schema.type) {
      case 'string':
        return 'string'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'boolean'
      default:
        return 'any'
    }
  }

  private getResponseType(endpoint: ParsedEndpoint): string {
    // Find success response (2xx)
    const successResponse = endpoint.responses.find(
      (r) => r.statusCode.startsWith('2') || r.statusCode === 'default',
    )

    if (!successResponse?.content) {
      return 'void'
    }

    const jsonContent = successResponse.content['application/json']
    if (!jsonContent) {
      return 'any'
    }

    // This would need to be enhanced to generate proper type references
    return 'any'
  }

  private groupEndpoints(endpoints: ParsedEndpoint[]): Record<string, ParsedEndpoint[]> {
    const groups: Record<string, ParsedEndpoint[]> = {}

    for (const endpoint of endpoints) {
      const group = endpoint.tags?.[0] || 'default'
      if (!groups[group]) {
        groups[group] = []
      }
      groups[group].push(endpoint)
    }

    return groups
  }
}

// Factory function
export function generateAPIClient(
  parsedAPI: ParsedOpenAPI,
  options?: ClientGeneratorOptions,
): GeneratedClient {
  const generator = new APIClientGenerator(options)
  return generator.generate(parsedAPI)
}
