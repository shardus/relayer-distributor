import * as url from 'url'
import * as net from 'net'
import * as http from 'http'
import * as Logger from '../Logger'

import { config } from '../Config'
import fastifyCors from '@fastify/cors'
import type { Worker } from 'node:cluster'
import { handleSocketRequest } from './child'
import Fastify, { FastifyInstance } from 'fastify'
import fastifyRateLimit from '@fastify/rate-limit'
import { registerRoutes, validateRequestData } from '../api'

interface ClientRequestDataInterface {
  header: object
  socket: net.Socket
}

let httpServer: http.Server
export const workerClientMap = new Map<Worker, string[]>()

const spinUpWorkerProcess = (clientKey: string, clientRequestData: ClientRequestDataInterface): void => {
  try {
    handleSocketRequest({ ...clientRequestData.header, socket: clientRequestData.socket, clientKey })
  } catch (e) {
    throw new Error(`Error in spinUpWorkerProcess(): ${e}`)
  }
}

export const initHttpServer = async (worker: Worker): Promise<void> => {
  const serverFactory = (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): http.Server => {
    httpServer = http.createServer((req, res) => {
      handler(req, res)
    })
    return httpServer
  }

  const fastifyServer = Fastify({ serverFactory })
  await fastifyServer.register(fastifyCors)
  await fastifyServer.register(fastifyRateLimit, {
    global: true,
    max: config.RATE_LIMIT,
    timeWindow: 10,
    allowList: ['127.0.0.1', '0.0.0.0'], // Excludes local IPs from rate limits
  })

  // Register API routes
  registerRoutes(fastifyServer as FastifyInstance<http.Server, http.IncomingMessage, http.ServerResponse>)
  console.log('Inside HTTP Server')
  initSocketServer(httpServer, worker)
  // Start server and bind to port on all interfaces
  fastifyServer.ready(() => {
    httpServer.listen(config.DISTRIBUTOR_PORT, () => {
      console.log(`Distributor-Server (${process.pid}) listening on port ${config.DISTRIBUTOR_PORT}.`)
      Logger.mainLogger.debug(`Worker Process (${process.pid}) Started .`)
      return
    })

    httpServer.on('error', (err) => {
      Logger.mainLogger.error('Distributor failed to start.', err)
      process.exit(1)
    })
  })
}

const initSocketServer = async (httpServer: http.Server, worker: Worker): Promise<void> => {
  // Handles incoming upgrade requests from clients (to upgrade to a Socket connection)
  httpServer.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    console.log(`>>> Received Socket Request @ ${process.pid}`)
    const queryObject = url.parse(req.url!, true).query
    const decodedData = decodeURIComponent(queryObject.data as string)
    const clientData = JSON.parse(decodedData)

    const auth = validateRequestData(clientData, {
      collectorInfo: 'o',
      sender: 's',
      sign: 'o',
    })
    if (auth.success) {
      const clientKey = clientData.sender
      spinUpWorkerProcess(clientKey, {
        header: { headers: req.headers, method: req.method, head, clientKey },
        socket,
      })
    } else {
      Logger.mainLogger.warn(`Unauthorized Client Request from ${req.headers.host}, Reason: ${auth.error}`)

      socket.write('HTTP/1.1 401 Unauthorized\r\n')
      socket.write('Content-Type: text/plain\r\n')
      socket.write('Connection: close\r\n')
      socket.write('Unauthorized: Authentication failed\r\n')

      socket.end() // Close the socket
      return
    }
  })
}
