import { join } from 'path'
import fastify, { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { overrideDefaultConfig, config, Subscribers } from './Config'
import * as Crypto from './Crypto'
import * as dbstore from './dbstore'
import * as Logger from './Logger'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { registerRoutes } from './api'

export interface DistributorInfo {
  ip: string
  port: number
  publicKey: string
  secretKey: string
}

let distributorInfo: DistributorInfo = {
  ip: '',
  port: -1,
  publicKey: '',
  secretKey: '',
}

export const distributorSubscribers: Map<string, Subscribers> = new Map()

// Override default config params from config file, env vars, and cli args
const file = join(process.cwd(), 'distributor-config.json')
const env = process.env
const args = process.argv
let logDir: string

export let socketServer: SocketIO.Server

async function start() {
  overrideDefaultConfig(file, env, args)

  // Set crypto hash keys from config
  const hashKey = config.DISTRIBUTOR_HASH_KEY
  Crypto.setCryptoHashKey(hashKey)

  let logsConfig
  try {
    logsConfig = JSON.parse(readFileSync(resolve(__dirname, '../distributor-log.json'), 'utf8'))
  } catch (err) {
    console.log('Failed to parse distributor log file:', err)
  }
  logDir = `${config.DISTRIBUTOR_LOGS}`
  const baseDir = '.'
  logsConfig.dir = logDir
  Logger.initLogger(baseDir, logsConfig)

  // Set distributor info from config
  distributorInfo.ip = config.DISTRIBUTOR_IP
  distributorInfo.port = config.DISTRIBUTOR_PORT
  distributorInfo.publicKey = config.DISTRIBUTOR_PUBLIC_KEY
  distributorInfo.secretKey = config.DISTRIBUTOR_SECRET_KEY

  await dbstore.initializeDB(config)

  // Start the server
  const server: FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({
    logger: false,
  })

  await server.register(fastifyCors)
  await server.register(fastifyRateLimit, {
    global: true,
    max: config.RATE_LIMIT,
    timeWindow: 10,
    allowList: ['127.0.0.1', '0.0.0.0'], // Excludes local IPs from rate limits
  })

  // Socket server instance
  socketServer = require('socket.io')(server.server)
  socketServer.on('connection', (socket: SocketIO.Socket) => {
    Logger.mainLogger.debug('Collector has connected')
  })

  // Refresh the subscribers
  refreshSubscribers()

  // Register routes
  registerRoutes(server)

  // Start server and bind to port on all interfaces
  server.listen(
    {
      port: config.DISTRIBUTOR_PORT,
      host: '0.0.0.0',
    },
    (err, _address) => {
      Logger.mainLogger.debug('Listening', config.DISTRIBUTOR_PORT)
      if (err) {
        server.log.error(err)
        process.exit(1)
      }
      Logger.mainLogger.debug('Distributor has started.')
      addSigListeners()
    }
  )
}

export function getDistributorInfo(): DistributorInfo {
  const sanitizedDistributorInfo = { ...distributorInfo }
  delete sanitizedDistributorInfo.secretKey
  return sanitizedDistributorInfo
}

export function getDistributorSecretKey(): string {
  return distributorInfo.secretKey
}

const addSigListeners = () => {
  process.on('SIGUSR1', async () => {
    Logger.mainLogger.debug('DETECTED SIGUSR1 SIGNAL')
    // Reload the distributor-config.json
    overrideDefaultConfig(file, env, args)
    Logger.mainLogger.debug('Config reloaded', config)
    // Refresh the subscribers
    refreshSubscribers()
  })
  Logger.mainLogger.debug('Registerd signal listeners.')
}

const refreshSubscribers = () => {
  const subscribers: Subscribers[] = config.subscribers
  for (let i = 0; i < subscribers.length; i++) {
    distributorSubscribers.set(subscribers[i].publicKey, subscribers[i])
  }
  Logger.mainLogger.debug('Subscribers refreshed', distributorSubscribers)
}

start()
