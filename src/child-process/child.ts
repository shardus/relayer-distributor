import * as WebSocket from 'ws'
const wss = new WebSocket.Server({ noServer: true })

const socketClientMap = new Map<string, any>()

process.on('message', (dataProp: any, socket: any) => {
  if (dataProp.type === 'receipt' && dataProp.data) {
    sendDataToAllClients(dataProp.data)
  } else {
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
        console.log('\nMSG RECEIVED by CHILD')
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
  }
})

const sendDataToAllClients = (data: any): void => {
  for (const client of socketClientMap.values()) {
    client.send(
      JSON.stringify({
        type: 'receipt',
        data,
      })
    )
  }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Child Process:', error)
})
