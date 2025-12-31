/**
 * LoadingView Component
 *
 * Displays a loading spinner with optional message
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { useTheme } from './ThemeProvider.js'

export interface LoadingViewProps {
  /** Loading message to display */
  message?: string
  /** Entity name being loaded (optional) */
  entityName?: string
}

/**
 * Spinner frames for animation
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * LoadingView component
 */
export default function LoadingView({
  message = 'Loading',
  entityName,
}: LoadingViewProps) {
  const theme = useTheme()
  const [frame, setFrame] = useState(0)

  // Animate spinner
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % SPINNER_FRAMES.length)
    }, 80)

    return () => clearInterval(interval)
  }, [])

  const spinnerChar = SPINNER_FRAMES[frame]

  return (
    <Box flexDirection="column" padding={2}>
      <Box>
        <Text>{theme.info(`${spinnerChar} ${message}`)}</Text>
        {entityName && (
          <Text> {theme.info(entityName)}</Text>
        )}
        <Text>{theme.info('...')}</Text>
      </Box>
    </Box>
  )
}
