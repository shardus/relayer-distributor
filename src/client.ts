import * as fs from 'fs'
import * as WebSocket from 'ws'
const SERVER_URL = 'ws://localhost:6000'
const RECONNECT_INTERVAL_MS = 10_000

let reconnecting = false
let ws: WebSocket | null = null
let SOCKET_ID = ''

const dataStore: any = []

const connectWebSocket = (): void => {
  try {
    ws = new WebSocket(SERVER_URL)

    ws.onopen = (): void => {
      console.log('✅ Successfully connected to the Server!')
      reconnecting = false
    }

    // Listening to messages from the server (child process)
    ws.on('message', (message: any) => {
      console.log(`Received message on client from server`)

      if (JSON.parse(message)) {
        const { type, data } = JSON.parse(message)
        if (type === 'client_init') {
          SOCKET_ID = data
          ws!.send(
            JSON.stringify({
              type: 'client_init',
              data: 'CONNECTED',
            })
          )
        } else if (type === 'receipt') {
          console.log('✅ Receipt Received from Child: ', dataStore.push(data))
        } else console.log('Message from server: ', message)
      }
      console.log('>>> Socket-ID: ', SOCKET_ID)
    })

    ws.onerror = (error): void => {
      console.error('WebSocket error:', error.message)
      reconnecting = false
    }

    // Listening to close event from the child process
    ws.onclose = (): void => {
      console.log('❌ Connection with Server Terminated!.')
      if (!reconnecting) attemptReconnection()
    }
  } catch (e) {
    console.error('Error in connecting to the server:', e)
    attemptReconnection()
  }
}

const attemptReconnection = (): void => {
  console.log(`Attempting to Re-Connect in ${RECONNECT_INTERVAL_MS / 1000}s...`)
  reconnecting = true
  setTimeout(connectWebSocket, RECONNECT_INTERVAL_MS)
}

connectWebSocket()

process.on('SIGINT', () => {
  fs.writeFileSync(
    `client-${SOCKET_ID.slice(0, 3).includes('/') ? SOCKET_ID.slice(3, 7) : '???'}-data.json`,
    JSON.stringify(dataStore),
    'utf8'
  )
  console.log('Received SIGINT signal. Closing all connections gracefully...')
  ws?.close()
  process.exit(0)
})
