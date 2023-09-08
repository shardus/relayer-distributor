import { childProcessMap } from '../child-process'
import * as socketClient from 'socket.io-client'
import * as fs from 'fs'

const data: any = []

const socket = socketClient.connect('http://45.79.18.209:4447', {
  reconnection: true,
  reconnectionAttempts: 10,
})

console.log('Syncing....')

socket.on('connect', () => console.log('Connected to distributor sender'))
socket.on('disconnect', () => console.log('Disconnected from distributor sender'))
socket.on('error', (err) => console.log(`Error from distributor sender: ${err}`))
socket.on('/data/receipt', txDataHandler)

function txDataHandler(newData: any): void {
  console.log('Receipt Data: ')
  data.push(newData)
  childProcessMap.forEach((child) => {
    console.log('Sending Receipt -> CP: ')
    child.send({ type: 'receipt', data: newData })
  })
}

process.on('SIGINT', () => {
  console.log('DATA SYNC KILLED!')
  fs.writeFileSync('receipt.json', JSON.stringify(data), 'utf8')
  process.exit(0)
})
