/**
 * Unified error handling module
 * Provides error types, logging and reporting functionality
 */

export enum ErrorType {
  TYPE_PARSE_ERROR = 'type-parse-error',
  AST_TRANSFORM_ERROR = 'ast-transform-error',
  CONTEXT_ERROR = 'context-error',
  STYLED_COMPONENT_ERROR = 'styled-component-error',
}

// Error log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  NONE = 'none',
}

// Current log level
let currentLogLevel: LogLevel = LogLevel.ERROR

// Error collector
const errorCollector: Array<{
  type: ErrorType
  message: string
  timestamp: number
  details?: any
}> = []

/**
 * Set log level
 * @param level Target log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level
}

/**
 * Get current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel
}

/**
 * Handle and log errors
 * @param type Error type
 * @param message Error message
 * @param details Error details (optional)
 */
export function handleError(type: ErrorType, message: string, details?: any): void {
  if (currentLogLevel === LogLevel.NONE) {
    return
  }

  const errorInfo = {
    type,
    message,
    timestamp: Date.now(),
    details,
  }

  // Add to error collector
  errorCollector.push(errorInfo)

  // Log error based on log level
  if (currentLogLevel === LogLevel.ERROR || currentLogLevel === LogLevel.WARN) {
    console.error(`[${type}] ${message}`)

    if (details && currentLogLevel === LogLevel.ERROR) {
      console.error('Error details:', details)
    }
  }
}

/**
 * Log warning information
 * @param message Warning message
 * @param details Details (optional)
 */
export function logWarning(message: string, details?: any): void {
  if (currentLogLevel === LogLevel.NONE
    || currentLogLevel === LogLevel.ERROR) {
    return
  }

  console.warn(`[WARNING] ${message}`)

  if (details && (currentLogLevel === LogLevel.DEBUG || currentLogLevel === LogLevel.INFO)) {
    console.warn('Details:', details)
  }
}

/**
 * Log informational message
 * @param message Log message
 * @param details Details (optional)
 */
export function logInfo(message: string, details?: any): void {
  if (currentLogLevel !== LogLevel.INFO
    && currentLogLevel !== LogLevel.DEBUG) {
    return
  }

  console.info(`[INFO] ${message}`)

  if (details && currentLogLevel === LogLevel.DEBUG) {
    console.info('Details:', details)
  }
}

/**
 * Log debug information
 * @param message Debug message
 * @param details Details (optional)
 */
export function logDebug(message: string, details?: any): void {
  if (currentLogLevel !== LogLevel.DEBUG) {
    return
  }

  console.debug(`[DEBUG] ${message}`)

  if (details) {
    console.debug('Details:', details)
  }
}

/**
 * Get collected error information
 */
export function getCollectedErrors(): Array<{
  type: ErrorType
  message: string
  timestamp: number
  details?: any
}> {
  return [...errorCollector]
}

/**
 * Clear collected error information
 */
export function clearErrors(): void {
  errorCollector.length = 0
}
