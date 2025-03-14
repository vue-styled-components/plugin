import type { TransformResult } from '../types/types'
import * as parser from '@babel/parser'
import MagicString from 'magic-string'
import {
  collectTypesFromAST,
  endTimer,
  hasStyledComponents,
  logDebug,
  resetContext,
  startTimer,
  transformStyledComponents,
  useContext,
} from './'

/**
 * Common transform core function that processes source code and transforms styled component syntax
 *
 * @param options Transform options
 * @returns Transform result, or null if no changes
 */
export function transformCore(options: {
  code: string // Original code
  id: string // File ID
  timerLabel: string // Timer label
  contentStart?: number // Content start position (for SFC offset)
  shouldLog?: boolean // Whether to log
  logPrefix?: string // Log prefix
}): TransformResult | null {
  const {
    code,
    id,
    timerLabel,
    contentStart = 0,
    shouldLog = true,
    logPrefix = '',
  } = options

  // Start overall transformation timer
  startTimer(timerLabel)

  try {
    if (!hasStyledComponents(code)) {
      endTimer(timerLabel)
      return null
    }

    // Use MagicString for precise replacements
    const s = new MagicString(code)

    // Reset and get type context
    resetContext(id)
    useContext(false, id)

    // Parse code timing
    startTimer(`${timerLabel}:parse`)
    // Use Babel to parse code
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        ['decorators', { decoratorsBeforeExport: true }],
      ],
      errorRecovery: true,
    })
    endTimer(`${timerLabel}:parse`)

    // Collect type information timing
    startTimer(`${timerLabel}:collectTypes`)
    // Collect all type information
    collectTypesFromAST(ast, true)
    endTimer(`${timerLabel}:collectTypes`)

    // Transform styled components timing
    startTimer(`${timerLabel}:transform`)
    // Use common function to process styled component transformation
    const { hasChanges, props } = transformStyledComponents(ast, code, s, contentStart)
    endTimer(`${timerLabel}:transform`)

    // If no changes, return null
    if (!hasChanges) {
      endTimer(timerLabel)
      return null
    }

    const result = {
      code: s.toString(),
      map: s.generateMap({ source: id, includeContent: true }),
      props,
    }

    // Log transformation completion
    if (shouldLog) {
      logDebug(`${logPrefix}Transformation complete: ${id}, file size: ${code.length} -> ${result.code.length} bytes`)
    }

    // End overall transformation timer
    endTimer(timerLabel)

    return result
  }
  catch (err) {
    // End timer even when error occurs
    endTimer(timerLabel)
    throw err
  }
}
