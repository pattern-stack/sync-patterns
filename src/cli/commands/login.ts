/**
 * Login Command
 *
 * Authenticate with API and save token for future use
 */

import * as readline from 'readline'
import { saveToken, clearToken, getTokenForUrl } from '../utils/auth-config.js'

export interface LoginOptions {
  apiUrl: string
  apiPrefix?: string
  email?: string
  logout?: boolean
}

/**
 * Build full API URL from base URL and prefix
 */
function buildFullUrl(baseUrl: string, prefix?: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (!prefix) return base
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')
  return `${base}/${cleanPrefix}`
}

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    if (hidden && process.stdin.isTTY) {
      // Hide password input
      process.stdout.write(question)
      const stdin = process.stdin
      stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding('utf8')

      let password = ''
      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode(false)
            stdin.removeListener('data', onData)
            rl.close()
            console.log()
            resolve(password)
            break
          case '\u0003': // Ctrl+C
            stdin.setRawMode(false)
            process.exit(0)
            break
          case '\u007F': // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1)
              process.stdout.write('\b \b')
            }
            break
          default:
            password += char
            process.stdout.write('*')
        }
      }
      stdin.on('data', onData)
    } else {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

interface LoginResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const fullApiUrl = buildFullUrl(options.apiUrl, options.apiPrefix)

  // Handle logout
  if (options.logout) {
    await clearToken(fullApiUrl)
    console.log(`Logged out from ${fullApiUrl}`)
    return
  }

  // Check if already logged in
  const existingToken = await getTokenForUrl(fullApiUrl)
  if (existingToken) {
    console.log(`Already logged in to ${fullApiUrl}`)
    const answer = await prompt('Do you want to re-authenticate? (y/N) ')
    if (answer.toLowerCase() !== 'y') {
      return
    }
  }

  console.log(`\nLogging in to ${fullApiUrl}\n`)

  // Get credentials
  const email = options.email || await prompt('Email: ')
  const password = await prompt('Password: ', true)

  if (!email || !password) {
    console.error('Email and password are required')
    process.exit(1)
  }

  // Call login endpoint
  try {
    const response = await fetch(`${fullApiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = 'Login failed'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.detail || errorJson.message || errorMessage
      } catch {
        if (errorText) errorMessage = errorText
      }
      console.error(`\nError: ${errorMessage}`)
      process.exit(1)
    }

    const data: LoginResponse = await response.json()

    // Save token
    await saveToken(
      fullApiUrl,
      data.access_token,
      data.refresh_token,
      data.expires_in
    )

    console.log('\nLogin successful!')
    console.log(`Token saved for ${fullApiUrl}`)
    console.log('\nYou can now run:')
    console.log(`  sync-patterns explore --api-url ${fullApiUrl}`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch')) {
      console.error(`\nError: Could not connect to ${fullApiUrl}`)
      console.error('Make sure the API server is running.')
    } else {
      console.error('\nError:', error instanceof Error ? error.message : error)
    }
    process.exit(1)
  }
}
