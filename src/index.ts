import type { Plugin } from 'vite'
import type { LogLevel } from './utils'
import { transformStyledSyntax } from './ts-transformer'
import { setConfig, setLogLevel } from './utils'
import { transformVueSFC } from './vue-transformer'

/**
 * Plugin options
 */
export interface PluginOptions {
  /**
   * Enable debug mode
   * @default false
   */
  debug?: boolean

  /**
   * Log level
   * @default 'error'
   */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none'

  /**
   * Enable type caching
   * @default true
   */
  enableCache?: boolean

  /**
   * Other configuration options
   */
  [key: string]: any
}

/**
 * Vue Styled Components TypeScript Syntax Plugin
 * @param options Plugin configuration options
 */
export default function typescriptSyntaxPlugin(options: PluginOptions = {}): Plugin {
  const {
    debug = false,
    logLevel = 'error',
    enableCache = true,
    ...otherOptions
  } = options

  // Initialize configuration
  setConfig({
    debug,
    enableCache,
    strictTypeChecking: true,
    optimizeAstTransform: true,
    enablePerfTracking: debug,
    logLevel: logLevel as LogLevel,
    maxCacheItems: 100,
  })

  // Set log level
  setLogLevel(logLevel as LogLevel)

  // Return Vite plugin configuration
  return {
    name: 'vue-styled-components:typescript-syntax',
    enforce: 'pre',

    transform(code, id) {
      // Process Vue single file components
      if (id.endsWith('.vue')) {
        return transformVueSFC(code, id)
      }

      // Process TypeScript files
      if (id.endsWith('.ts') || id.endsWith('.tsx')) {
        return transformStyledSyntax(code, id)
      }

      return null
    },
  }
}
