import * as log4js from 'log4js'
import { existsSync, mkdirSync } from 'fs'
import * as log4jsExtend from 'log4js-extend'
import { Console } from 'console'
import { PassThrough } from 'stream'
import { join } from 'path'
import { RollingFileStream } from 'streamroller'
import { normalize, resolve } from 'path'

interface Logger {
  baseDir: string
  config: LogsConfiguration
  logDir: string
  log4Conf: unknown
}

export interface LogsConfiguration {
  saveConsoleOutput?: boolean
  dir?: string
  files?: {
    main?: string
    fatal?: string
    net?: string
    app?: string
  }
  options?: {
    appenders?: {
      out?: {
        type?: string
      }
      main?: {
        type?: string
        maxLogSize?: number
        backups?: number
      }
      fatal?: {
        type?: string
        maxLogSize?: number
        backups?: number
      }
      errorFile?: {
        type?: string
        maxLogSize?: number
        backups?: number
      }
      errors?: {
        type?: string
        maxLogSize?: number
        backups?: number
      }
    }
  }
  categories?: {
    default?: {
      appenders?: string[]
      level?: string
    }
    main?: {
      appenders?: string[]
      level?: string
    }
    out?: {
      appenders?: string[]
      level?: string
    }
    fatal?: {
      appenders?: string[]
      level?: string
    }
  }
}

class Logger {
  constructor(baseDir: string, config: LogsConfiguration) {
    this.baseDir = baseDir
    this.config = config
    this.logDir = ''
    this.log4Conf = null
    this._setupLogs()
  }

  // Checks if the configuration has the required components
  _checkValidConfig(): void {
    const config = this.config
    if (!config.dir) throw Error('Fatal Error: Log directory not defined.')
    if (!config.files || typeof config.files !== 'object')
      throw Error('Fatal Error: Valid log file locations not provided.')
  }

  // Add filenames to each appender of type 'file'
  _addFileNamesToAppenders(): void {
    const conf = this.log4Conf as { appenders: { appenders: Record<string, unknown> } }
    for (const key in conf.appenders) {
      // ignoring due to not coming from user input or exxternal source therefore unlikely this would lead to a prototype pollution attack
      // eslint-disable-next-line security/detect-object-injection
      const appender = conf.appenders[key]
      if (appender.type !== 'file') continue
      appender.filename = `${this.logDir}/${key}.log`
    }
  }

  _configureLogs(): log4js.Log4js {
    return log4js.configure(this.log4Conf as log4js.Configuration)
  }

  // Get the specified logger
  getLogger(logger: string): log4js.Logger {
    return log4js.getLogger(logger)
  }

  // Setup the logs with the provided configuration using the base directory provided for relative paths
  _setupLogs(): void {
    const baseDir = this.baseDir
    const config = this.config

    if (!baseDir) throw Error('Fatal Error: Base directory not defined.')
    if (!config) throw Error('Fatal Error: No configuration provided.')
    this._checkValidConfig()

    // Makes specified directory if it doesn't exist
    if (config.dir) {
      // normalize and resolve the path to avoid path traversal attacks
      const allArchiversLogDir = resolve(normalize(`${baseDir}/${config.dir.split('/')[0]}`))
      this.getLogger('main').info('allArchiversLogDir', allArchiversLogDir)
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (!existsSync(allArchiversLogDir)) mkdirSync(allArchiversLogDir)
    }
    // normalize and resolve the path to avoid path traversal attacks
    this.logDir = resolve(normalize(`${baseDir}/${config.dir}`))
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(this.logDir)) mkdirSync(this.logDir)
    // Read the log config from log config file
    this.log4Conf = config.options
    log4jsExtend(log4js)
    this._addFileNamesToAppenders()
    this._configureLogs()
    this.getLogger('main').info('Logger initialized.')
  }

  // Tells this module that the server is shutting down, returns a Promise that resolves when all logs have been written to file, sockets are closed, etc.
  shutdown(): Promise<string> {
    return new Promise((resolve) => {
      log4js.shutdown(() => {
        resolve('done')
      })
    })
  }
}

export let mainLogger: log4js.Logger
export let fatalLogger: log4js.Logger
export let errorLogger: log4js.Logger

export function initLogger(baseDir: string, logsConfig: LogsConfiguration): void {
  const logger = new Logger(baseDir, logsConfig)
  mainLogger = logger.getLogger('main')
  fatalLogger = logger.getLogger('fatal')
  errorLogger = logger.getLogger('errorFile')

  // Start saving console output to file
  startSaving(join(baseDir, logsConfig.dir))
}

export default Logger

export function startSaving(baseDir: string): void {
  // Create a file to save combined stdout and stderr output
  const outFileName = `out.log`
  const stream = new RollingFileStream(join(baseDir, outFileName), 10000000, 10)

  // Create passthroughs that write to stdout, stderr, and the output file
  const outPass = new PassThrough()
  outPass.pipe(process.stdout)
  outPass.pipe(stream)

  const errPass = new PassThrough()
  errPass.pipe(process.stderr)
  errPass.pipe(stream)

  // Monkey patch the global console with a new one that uses our passthroughs
  console = new Console({ stdout: outPass, stderr: errPass }) // eslint-disable-line no-global-assign
}
