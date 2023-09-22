import { join } from 'path'
import * as url from 'url'
import * as utils from './utils'
import fastify, { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import { overrideDefaultConfig, config, Subscriber } from './Config'
import * as http from 'http'
import * as dbstore from './dbstore'
import * as Logger from './Logger'

import { registerRoutes, validateRequestData } from './api'
import { assignChildProcessToClient, showAllProcesses, getChildProcessForClient } from './child-process'

let httpServer: http.Server

export const distributorSubscribers: Map<string, Subscriber> = new Map()

// Override default config params from config file, env vars, and cli args
const file = join(process.cwd(), 'distributor-config.json')
const env = process.env
const args = process.argv

export let socketServer: SocketIO.Server

async function start(): Promise<void> {
  overrideDefaultConfig(file, env, args)

  // Set crypto hash keys from config
  const hashKey = config.DISTRIBUTOR_HASH_KEY
  utils.setHashKey(hashKey)
  utils.initLogger()

  await dbstore.initializeDB(config)

  // Refresh the subscribers
  refreshSubscribers()

  const serverFactory = (handler): any => {
    httpServer = http.createServer((req, res) => {
      handler(req, res)
    })

    return httpServer
  }

  const fastifyServer = fastify({ serverFactory })
  await fastifyServer.register(fastifyCors)
  await fastifyServer.register(fastifyRateLimit, {
    global: true,
    max: config.RATE_LIMIT,
    timeWindow: 10,
    allowList: ['127.0.0.1', '0.0.0.0'], // Excludes local IPs from rate limits
  })

  // Handles incoming upgrade requests from clients (to upgrade to a Socket connection)
  httpServer.on('upgrade', (req: http.IncomingMessage, socket: any, head: Buffer) => {
    const queryObject = url.parse(req.url!, true).query
    const decodedData = decodeURIComponent(queryObject.data as string)
    const clientData = JSON.parse(decodedData)

    const auth = validateRequestData(clientData, {
      collectorInfo: 'o',
      sender: 's',
      sign: 'o',
    })
    if (auth.success) {
      const clientKey = clientData.sender ?? undefined
      if (!clientKey)
        throw new Error(`No client/public key found in upgrade request from Client @ ${req.headers.host}`)

      console.log('\n Assigning Child Process to Client...')

      assignChildProcessToClient(clientKey, {
        header: { headers: req.headers, method: req.method, head, clientKey },
        socket,
      })
      showAllProcesses()
    } else console.log(`Unauthorized Client Request from ${req.headers.host}, Reason: ${auth.error}`)
  })

  // Register API routes
  registerRoutes(fastifyServer as FastifyInstance<http.Server, http.IncomingMessage, http.ServerResponse>)

  // Start server and bind to port on all interfaces
  fastifyServer.ready(() => {
    httpServer.listen(config.DISTRIBUTOR_PORT, () => {
      console.log(`Distributor-Server listening on port ${config.DISTRIBUTOR_PORT}!`)
      Logger.mainLogger.debug('Listening', config.DISTRIBUTOR_PORT)
      Logger.mainLogger.debug('Distributor has started.')
      addSigListeners()
    })

    httpServer.on('error', (err) => {
      Logger.mainLogger.error('Distributor failed to start.', err)
      process.exit(1)
    })
  })
}

const addSigListeners = (): void => {
  process.on('SIGUSR1', async () => {
    Logger.mainLogger.debug('DETECTED SIGUSR1 SIGNAL')
    // Reload the distributor-config.json
    overrideDefaultConfig(file, env, args)
    Logger.mainLogger.debug('Config reloaded', config)
    // Refresh the subscribers
    refreshSubscribers()
  })
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in Distributor: ', error)
  })
  Logger.mainLogger.debug('Registered signal listeners.')
}

const refreshSubscribers = (): void => {
  const subscribers: Subscriber[] = config.subscribers
  for (let i = 0; i < subscribers.length; i++) {
    distributorSubscribers.set(subscribers[i].publicKey, subscribers[i])
  }
  Logger.mainLogger.debug('Subscribers refreshed', distributorSubscribers)
  setInterval(() => {
    console.log('Checking for expired subscribers...')
    for (let i = 0; i < subscribers.length; i++) {
      // Subscribers with expirationTimestamp of 0 are permanent subscribers
      if (subscribers[i].expirationTimestamp !== 0 && subscribers[i].expirationTimestamp < Date.now()) {
        Logger.mainLogger.debug(`❌ Removing Expired Subscriber: ${subscribers[i].publicKey}`)
        const childProcess = getChildProcessForClient(subscribers[i].publicKey)
        childProcess?.send({ type: 'remove_subscriber', data: subscribers[i].publicKey })
        subscribers.splice(i, 1)
      }
    }
  }, 60_000)
}

start()
