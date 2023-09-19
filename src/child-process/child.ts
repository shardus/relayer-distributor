import * as WebSocket from 'ws'
import { join } from 'path'
import { config } from '../Config'
import DataLogReader from '../log-reader'

const wss = new WebSocket.Server({ noServer: true })

const socketClientMap = new Map<string, any>()

process.on('message', (dataProp: any, socket: any) => {
  if (dataProp.headers) {
    wss.handleUpgrade(dataProp, socket, dataProp.head, (ws: any) => {
      const clientId = dataProp.clientKey
      socketClientMap.set(clientId, ws)
      // Sending Client-ID to Socket Client
      ws.send(
        JSON.stringify({
          type: 'client_init',
          data: clientId,
        })
      )

      // Listening to messages from Socket Client
      ws.on('message', (msg: any) => {
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

      ws.on('close', () => {
        console.log(`❌ Connection with Client (${clientId}) Closed.`)
        process.send!({
          type: 'client_close',
          data: clientId,
        })
      })
    })
  } else {
    console.info('Unexpected Message Received in Child: ', dataProp)
  }
})

const sendDataToAllClients = ({ type, data }: any): void => {
  for (const client of socketClientMap.values()) {
    client.send(
      JSON.stringify({
        type,
        data,
      })
    )
  }
}

const registerDataReaderListeners = (reader: DataLogReader): void => {
  reader.on(`${reader.dataName}-data`, (data: any) => {
    try {
      if (!data.includes('End: Number of entries:')) {
        sendDataToAllClients({
          type: reader.dataName,
          data: JSON.parse(data),
        })
      }
    } catch (e) {
      console.log('Issue with data: ')
      console.log(e)
    }
  })

  reader.on(`${reader.dataName}-end`, (totalEntriesItReads: any, totalEntriesDefinedOnFile: any) => {
    console.info(
      `✔️ Finished reading ${totalEntriesItReads} entries from ${reader.dataName}-${reader.logCounter} log file having ${totalEntriesDefinedOnFile} entries.`
    )
  })

  reader.on('error', (err: any) => {
    console.error(`Error reading log file: ${err}`)
  })
}

;(async (): Promise<void> => {
  try {
    const DATA_LOG_PATH = join(__dirname, config.DATA_LOG_DIR)
    const cycleReader = new DataLogReader(DATA_LOG_PATH, 'CYCLE')
    const receiptReader = new DataLogReader(DATA_LOG_PATH, 'RECEIPT')
    const originalTxReader = new DataLogReader(DATA_LOG_PATH, 'ORIGINAL_TX')
    await Promise.all([receiptReader.init(), cycleReader.init(), originalTxReader.init()])

    registerDataReaderListeners(cycleReader)
    registerDataReaderListeners(receiptReader)
    registerDataReaderListeners(originalTxReader)
  } catch (e) {
    console.error('Error in Child Process: ', e)
    process.exit(1)
  }
})()

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Child Process:', error)
})
