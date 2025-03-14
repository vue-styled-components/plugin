import type { TransformResult } from './types/types'
import { endTimer, ErrorType, handleError, startTimer, transformCore } from './utils'

/**
 * Transform styled components in Vue SFC
 *
 * @param code Original code
 * @param id File ID
 * @returns Transform result, or null if no changes
 */
export function transformVueSFC(code: string, id: string): TransformResult | null {
  // Start overall transformation timer
  startTimer('transformVueSFC')

  try {
    // Only process Vue files
    if (!id.endsWith('.vue')) {
      endTimer('transformVueSFC')
      return null
    }

    // Extract script section
    startTimer('extractScript')
    const scriptMatch = /<script\s+(?:\S.*?)??lang=["']ts["'].*?>([\s\S]*?)<\/script>/i.exec(code)
    endTimer('extractScript')

    if (!scriptMatch || !scriptMatch[1]) {
      endTimer('transformVueSFC')
      return null
    }

    const scriptContent = scriptMatch[1]
    const scriptStart = scriptMatch.index + scriptMatch[0].indexOf(scriptContent)

    // Process extracted script content using the transform core
    try {
      return transformCore({
        code: scriptContent,
        id,
        timerLabel: 'transformVueSFC',
        contentStart: scriptStart,
        logPrefix: 'Vue SFC',
      })
    }
    catch (err) {
      // Handle internal errors
      handleError(
        ErrorType.AST_TRANSFORM_ERROR,
        `Vue SFC transformation failed: ${id}`,
        err,
      )
      endTimer('transformVueSFC')
      return null
    }
  }
  catch (err) {
    // Handle external errors
    handleError(
      ErrorType.AST_TRANSFORM_ERROR,
      `Vue SFC processing failed: ${id}`,
      err,
    )

    // End timer even when error occurs
    endTimer('transformVueSFC')
    return null
  }
}
