/**
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
  timeout: 10000,
  retries: 3,
  defaultHeaders: {
    'Content-Type': 'application/json'
  }
}