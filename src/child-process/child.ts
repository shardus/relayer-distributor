import * as WebSocket from 'ws'
import * as Crypto from '../utils/Crypto'
import { join } from 'path'
import { config, overrideDefaultConfig } from '../Config'
import DataLogReader from '../log-reader'
import { IncomingMessage } from 'http'
import {P2P} from '@shardus/types'

const FILE = join(process.cwd(), 'distributor-config.json')
overrideDefaultConfig(FILE, process.env, process.argv)
Crypto.setCryptoHashKey(config.DISTRIBUTOR_HASH_KEY)

const NEW_CONNECTION_CODE = 3000

const wss = new WebSocket.Server({ noServer: true })

const socketClientMap = new Map<string, WebSocket.WebSocket>()

//interface for dataProp
interface DataPropInterface {
  headers?: Record<string, string>
  head?: Buffer
  clientKey?: string
  type?: string
  data?: string
}

process.on('message', (dataProp: DataPropInterface, socket: IncomingMessage) => {
  if (dataProp.headers) {
    wss.handleUpgrade(dataProp, socket, dataProp.head, (ws: WebSocket.WebSocket) => {
      const clientId = dataProp.clientKey
      if (socketClientMap.has(clientId)) {
        socketClientMap.get(clientId).close(NEW_CONNECTION_CODE, 'New Connection Established')
      }
      socketClientMap.set(clientId, ws)
      // Sending Client-ID to Socket Client
      ws.send(
        JSON.stringify({
          type: 'client_init',
          data: clientId,
        })
      )

      // Listening to messages from Socket Client
      ws.on('message', (msg: WebSocket.Data) => {
        const clientMsg = JSON.parse(msg.toString('utf8'))
        if (clientMsg.type && clientMsg.data) {
          switch (clientMsg.type) {
            case 'client_init':
              {
                if (clientMsg.data === 'CONNECTED') {
                  console.log(`✅Client (${clientId}) Connected with Child Process ${process.pid}`)
                }
              }
              break
            default:
              {
                console.warn('Unknown Message Type Received from Client: ', clientMsg)
              }
              break
          }
        } else console.log('Basic Client Msg: ', msg.toString('utf8'))
      })

      ws.on('close', (code) => {
        if (code === NEW_CONNECTION_CODE) {
          console.log(`❌ Closing previous connection with Client (${clientId})`)
          return
        }
        socketClientMap.delete(clientId)
        console.log(`❌ Connection with Client (${clientId}) Closed.`)
        process.send!({
          type: 'client_close',
          data: clientId,
        })
      })
    })
  } else {
    if (dataProp.type === 'remove_subscriber') {
      const clientId = dataProp.data
      socketClientMap.get(clientId).close()
      console.log(`❌ Expired Subscription -> Client (${clientId}) Removed.`)
    } else console.info('Unexpected Message Received in Child: ', dataProp)
  }
})

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
        cycle?: P2P.CycleCreatorTypes.CycleRecord
        receipt?: any
        originalTx?: any
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

  reader.on(`${reader.dataName}-end`, (totalEntriesItReads: any, totalEntriesDefinedOnFile: any) => {
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
      // Terminate the Child Process
      process.send!({
        type: 'child_close',
        data: { err: 'Invalid Path to the data-logs directory', pid: process.pid },
      })
    } else {
      console.error('Error in Child Process: ', e.message, e.code)
    }
  }
})()

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Child Process:', error)
})
