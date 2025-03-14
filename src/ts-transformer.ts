import type { TransformResult } from './types/types'
import { transformCore } from './utils'

/**
 * Transform styled component syntax
 *
 * @param code Original code
 * @param id File ID
 * @returns Transform result, or null if no changes
 */
export function transformStyledSyntax(code: string, id: string): TransformResult | null {
  // Use common transform core function to process
  return transformCore({
    code,
    id,
    timerLabel: 'transformStyledSyntax',
  })
}
