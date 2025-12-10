/**
 * Terminal Capability Detection
 *
 * Detects terminal capabilities (colors, unicode) and provides fallbacks
 */

/**
 * Detect if terminal supports colors
 * Based on environment variables and TTY status
 */
export function supportsColor(): boolean {
  // Check common environment variables
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== '0';
  }

  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // CI environments
  if (process.env.CI && ['TRAVIS', 'CIRCLECI', 'GITLAB_CI'].some(sign => process.env[sign])) {
    return true;
  }

  // Check if stdout is a TTY
  return process.stdout.isTTY;
}

/**
 * Detect if terminal supports unicode
 * Based on locale and environment
 */
export function supportsUnicode(): boolean {
  // Check for explicit unicode support
  if (process.env.TERM_UNICODE !== undefined) {
    return process.env.TERM_UNICODE !== '0';
  }

  // Windows Command Prompt doesn't support unicode well
  if (process.platform === 'win32' && !process.env.WT_SESSION) {
    return false;
  }

  // Check locale
  const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
  return /utf-?8/i.test(locale);
}

/**
 * Terminal capabilities singleton
 */
export const terminalCapabilities = {
  color: supportsColor(),
  unicode: supportsUnicode(),
};

/**
 * Get appropriate symbol based on unicode support
 */
export function getSymbol(unicode: string, ascii: string): string {
  return terminalCapabilities.unicode ? unicode : ascii;
}
