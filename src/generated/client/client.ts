/**
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
      timeout: this.config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.defaultHeaders
      }
    })
  }

  
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
    const maxRetries = this.config.retries || 3

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
  }

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

      
      // Inject bearer token if available
      if (this.config.getAuthToken) {
        const token = await this.config.getAuthToken()
        if (token) {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${token}`
          }
        }
      }

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
}