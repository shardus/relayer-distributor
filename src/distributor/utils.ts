import * as Logger from '../Logger'
import type { Worker } from 'cluster'
import { config, Subscriber, ClientInterface } from '../Config'

interface ChildMessageInterface {
  type: string
  data: {
    err: string
    pid: number
  }
}

type workerProcessId = number
let subscriberRefreshInterval: NodeJS.Timeout | null = null
export const workerClientMap = new Map<Worker, string[]>()
export const socketClientMap = new Map<string, workerProcessId>()
export const workerProcessMap = new Map<workerProcessId, Worker>()
export const distributorSubscribers: Map<string, Subscriber> = new Map()

export let socketServer: SocketIO.Server

export const showAllProcesses = (): void => {
  const clients: ClientInterface[] = []
  for (const [key, value] of workerClientMap.entries()) {
    clients.push({ Worker_PID: key.process.pid, Client_PubKeys: value })
  }
  console.table(clients, ['Worker_PID', 'Client_PubKeys'])
}

export const registerWorkerMessageListener = (worker: Worker): void => {
  worker.on('message', ({ type, data }: ChildMessageInterface) => {
    switch (type) {
      case 'client_close':
        Logger.mainLogger.debug('❌ Client Connection Terminated with ID: ', data.toString())
        removeSocketClient(data.toString())
        break

      case 'client_connected':
        {
          Logger.mainLogger.debug(`✅ Client (${data}) connected with Worker: ${worker.process.pid}`)
          socketClientMap.set(data.toString(), worker.process.pid)
          const clients = workerClientMap.get(worker)
          clients.push(data.toString())
          workerClientMap.set(worker, clients)
          showAllProcesses()
        }
        break

      case 'client_expired':
        Logger.mainLogger.debug('❌ Client with ID Expired: ', data.toString())
        removeSocketClient(data.toString())
        break
      default:
        if (type) Logger.mainLogger.debug('Unexpected Message Received From Worker: ', { type, data })
    }
  })
}

export const updateConfigAndSubscriberList = (): void => {
  const subscribers: Subscriber[] = config.subscribers
  // Clear the previous subscribers list
  distributorSubscribers.clear()

  // Load the new subscribers list from the config
  for (let i = 0; i < subscribers.length; i++) {
    distributorSubscribers.set(subscribers[i].publicKey, subscribers[i])
  }
  Logger.mainLogger.debug('Subscribers refreshed, count: ', distributorSubscribers.size)
}

export const refreshSubscribers = (): void => {
  if (subscriberRefreshInterval) {
    clearInterval(subscriberRefreshInterval)
  }
  const subscribers: Subscriber[] = config.subscribers
  subscriberRefreshInterval = setInterval(() => {
    for (let i = 0; i < subscribers.length; i++) {
      // Subscribers with expirationTimestamp of 0 are permanent subscribers
      if (subscribers[i].expirationTimestamp !== 0 && subscribers[i].expirationTimestamp < Date.now()) {
        Logger.mainLogger.debug(`❌ Removing Expired Subscriber: ${subscribers[i].publicKey}`)
        const childProcess = getWorkerForClient(subscribers[i].publicKey)
        childProcess?.send({ type: 'remove_subscriber', data: subscribers[i].publicKey })
        subscribers.splice(i, 1)
      }
    }
  }, 30_000)
}

const removeSocketClient = (clientId: string): void => {
  console.log('Removing Client: ', clientId, socketClientMap.has(clientId))
  socketClientMap.delete(clientId)
  for (const [workerProcess, clients] of workerClientMap.entries()) {
    const index = clients.findIndex((id) => id === clientId)
    if (index > -1) {
      clients.splice(index, 1)
      workerClientMap.set(workerProcess, clients)
      console.log(`Client (${clientId}) disconnected from Child Process (${workerProcess.process.pid})`)
      showAllProcesses()
      return
    }
  }
}

export const getWorkerForClient = (clientId: string): Worker | undefined => {
  const workerProcessId = socketClientMap.get(clientId)
  if (!workerProcessId)
    throw new Error(`Inside: ${process.pid} Child process associated with Client: ${clientId} not found.`)
  const workerProcess = workerProcessMap.get(workerProcessId)
  if (!workerProcess) throw new Error(`Child process with PID: ${workerProcessId} not found.`)
  return workerProcess
}
