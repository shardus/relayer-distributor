import * as WebSocket from 'ws'
import * as Crypto from '../utils/Crypto'
import { join } from 'path'
import { config, overrideDefaultConfig } from '../Config'
import DataLogReader from '../log-reader'
import { IncomingMessage } from 'http'

const FILE = join(process.cwd(), 'distributor-config.json')
overrideDefaultConfig(FILE, process.env, process.argv)
Crypto.setCryptoHashKey(config.DISTRIBUTOR_HASH_KEY)

enum SocketCloseCodes {
  NEW_CONNECTION_CODE = 1000,
  SUBSCRIBER_EXPIRATION_CODE,
}

const NEW_CONNECTION_CODE = 3000

const wss = new WebSocket.Server({ noServer: true })

const socketClientMap = new Map<string, WebSocket.WebSocket>()

//interface for dataProp
interface DataPropInterface {
  headers?: Record<string, string>
  socket: WebSocket
  head?: Buffer
  clientKey?: string
  type?: string
  data?: string
}

export const handleSocketRequest = (dataProp: DataPropInterface): void => {
  if (dataProp.headers) {
    wss.handleUpgrade(dataProp, dataProp.socket, dataProp.head, (ws: WebSocket.WebSocket) => {
      const clientId = dataProp.clientKey
      if (socketClientMap.has(clientId)) {
        socketClientMap.get(clientId).close(1000)
        socketClientMap.delete(clientId)
      }
      socketClientMap.set(clientId, ws)
      registerParentProcessListener()
      // Sending Client-ID to Parent Process for managing subscribers
      process.send!({
        type: 'client_connected',
        data: clientId,
      })

      ws.on('close', (code) => {
        switch (code) {
          case SocketCloseCodes.NEW_CONNECTION_CODE:
            console.log(`❌ Closing previous connection with Client (${clientId})`)
            process.send!({
              type: 'client_close',
              data: clientId,
            })
            break
          case SocketCloseCodes.SUBSCRIBER_EXPIRATION_CODE:
            console.log(`❌ Expired Subscriber (${clientId}) Closed.`)
            process.send!({
              type: 'client_expired',
              data: clientId,
            })
            break
          default:
            process.send!({
              type: 'client_close',
              data: clientId,
            })
            console.log(`❌ Connection with Client (${clientId}) Closed.`)
        }
        if (socketClientMap.has(clientId)) socketClientMap.delete(clientId)
      })
    })
  } else {
    if (dataProp.type === 'remove_subscriber') {
      const clientId = dataProp.data
      socketClientMap.get(clientId).close(1)
      console.log(`❌ Expired Subscription -> Client (${clientId}) Removed.`)
    } else console.info('Unexpected Message Received in Child: ', dataProp)
  }
}

const registerParentProcessListener = (): void => {
  process.on('message', (dataProp: DataPropInterface, socket: IncomingMessage) => {
    if (dataProp.type === 'remove_subscriber') {
      const clientId = dataProp.data
      socketClientMap.get(clientId).close()
      console.log(`❌ Expired Subscription -> Client (${clientId}) Removed.`)
    } else console.info('Unexpected Message Received in Child: ', dataProp)
  })
}
const sendDataToAllClients = ({ signedData }: { signedData: Record<string, unknown> }): void => {
  for (const client of socketClientMap.values()) {
    client.send(
      JSON.stringify({
        ...signedData,
      })
    )
  }
}

const registerDataReaderListeners = (reader: DataLogReader): void => {
  reader.on(`${reader.dataName}-data`, (logData: unknown) => {
    try {
      const data: {
        cycle?: unknown
        receipt?: unknown
        originalTx?: unknown
      } = {}
      switch (reader.dataName) {
        case 'cycle':
          data.cycle = logData
          break
        case 'receipt':
          data.receipt = logData
          break
        case 'originalTx':
          data.originalTx = logData
          break
      }
      sendDataToAllClients({
        signedData: Crypto.sign(data, config.DISTRIBUTOR_SECRET_KEY, config.DISTRIBUTOR_PUBLIC_KEY),
      })
    } catch (e) {
      console.log('Issue with Log-reader data: ')
      console.log('->> LOG DATA: ', logData)
      console.log(e)
    }
  })

  reader.on(`${reader.dataName}-end`, (totalEntriesItReads: number, totalEntriesDefinedOnFile: number) => {
    console.info(
      `✔️ Finished reading ${totalEntriesItReads} entries from ${reader.dataName}-${reader.logCounter} log file having ${totalEntriesDefinedOnFile} entries.`
    )
  })

  reader.on('error', (err: Error) => {
    console.error(`Error reading log file: ${err}`)
  })
}

;(async (): Promise<void> => {
  try {
    const DATA_LOG_PATH = config.DATA_LOG_DIR
    const cycleReader = new DataLogReader(DATA_LOG_PATH, 'cycle')
    const receiptReader = new DataLogReader(DATA_LOG_PATH, 'receipt')
    const originalTxReader = new DataLogReader(DATA_LOG_PATH, 'originalTx')
    await Promise.all([receiptReader.init(), cycleReader.init(), originalTxReader.init()])
    registerDataReaderListeners(cycleReader)
    registerDataReaderListeners(receiptReader)
    registerDataReaderListeners(originalTxReader)
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(
        '❌ Path to the data-logs directory does not exist. Please check the path in the config file.\n Current Path: ',
        config.DATA_LOG_DIR
      )
      process.exit(0)
    } else {
      console.error('Error in Child Process: ', e.message, e.code)
    }
  }
})()

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Child Process:', error)
})
