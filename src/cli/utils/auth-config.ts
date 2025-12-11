/**
 * Auth Config Storage
 *
 * Stores auth tokens in ~/.sync-patterns/auth.json
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface AuthConfig {
  apiUrl: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

export interface StoredConfig {
  // Keyed by API URL
  [apiUrl: string]: Omit<AuthConfig, 'apiUrl'>
}

const CONFIG_DIR = join(homedir(), '.sync-patterns')
const AUTH_FILE = join(CONFIG_DIR, 'auth.json')

async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
  } catch {
    // Directory exists
  }
}

export async function loadAuthConfig(): Promise<StoredConfig> {
  try {
    const content = await fs.readFile(AUTH_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export async function saveAuthConfig(config: StoredConfig): Promise<void> {
  await ensureConfigDir()
  await fs.writeFile(AUTH_FILE, JSON.stringify(config, null, 2), 'utf-8')
  // Set restrictive permissions (owner read/write only)
  await fs.chmod(AUTH_FILE, 0o600)
}

export async function getTokenForUrl(apiUrl: string): Promise<string | null> {
  const config = await loadAuthConfig()
  // Normalize URL (remove trailing slash)
  const normalizedUrl = apiUrl.replace(/\/+$/, '')

  const auth = config[normalizedUrl]
  if (!auth) return null

  // Check if expired (with 60s buffer)
  if (auth.expiresAt && Date.now() > (auth.expiresAt - 60000)) {
    return null
  }

  return auth.accessToken
}

export async function saveToken(
  apiUrl: string,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number
): Promise<void> {
  const config = await loadAuthConfig()
  const normalizedUrl = apiUrl.replace(/\/+$/, '')

  config[normalizedUrl] = {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : undefined,
  }

  await saveAuthConfig(config)
}

export async function clearToken(apiUrl: string): Promise<void> {
  const config = await loadAuthConfig()
  const normalizedUrl = apiUrl.replace(/\/+$/, '')
  delete config[normalizedUrl]
  await saveAuthConfig(config)
}

export async function clearAllTokens(): Promise<void> {
  await saveAuthConfig({})
}

export { AUTH_FILE, CONFIG_DIR }
