import { join } from 'path'
import { config } from '../Config'
const childPath = join(__dirname, 'child')
import { fork, ChildProcess } from 'child_process'
import { Socket } from 'net'

const { MAX_CLIENTS_PER_CHILD } = config

interface ClientRequestDataInterface {
  header: object
  socket: Socket
}

interface ChildMessageInterface {
  type: string
  data: {
    err: string
    pid: number
  }
}

type childProcessId = number

export const childProcessMap = new Map<childProcessId, ChildProcess>()
export const childClientMap = new Map<ChildProcess, string[]>()
export const socketClientMap = new Map<string, childProcessId>()

interface ClientInterface {
  Process_ID: number
  Socket_IDs: string[]
}

export const showAllProcesses = (): void => {
  const clients: ClientInterface[] = []
  for (const [key, value] of childClientMap.entries()) {
    clients.push({ Process_ID: key.pid, Socket_IDs: value })
  }
  console.table(clients, ['Process_ID', 'Socket_IDs'])
}

const spinUpChildProcess = (clientKey: string, clientRequestData: ClientRequestDataInterface): void => {
  try {
    const child = fork(childPath)
    child.send({ ...clientRequestData.header }, clientRequestData.socket)
    childProcessMap.set(child.pid!, child)
    childClientMap.set(child, [clientKey])
    socketClientMap.set(clientKey, child.pid!)
    registerChildMessageListener(child)
  } catch (e) {
    throw new Error(`Error in spinUpChildProcess(): ${e}`)
  }
}

export const assignChildProcessToClient = (
  clientKey: string,
  clientRequestData: ClientRequestDataInterface
): void => {
  const numberofActiveChildProcesses = childProcessMap.size
  if (numberofActiveChildProcesses === 0) {
    spinUpChildProcess(clientKey, clientRequestData)
    return
  }

  const childProcessId = socketClientMap.get(clientKey)
  if (childProcessId) {
    const childProcess = childProcessMap.get(childProcessId)
    childProcess?.send({ ...clientRequestData.header }, clientRequestData.socket)
    return
  }

  // Checking if any running child process has less than MAX_CLIENTS_PER_CHILD clients
  for (const childProcess of childProcessMap.values()) {
    const clients = childClientMap.get(childProcess)

    if (clients!.length! < MAX_CLIENTS_PER_CHILD) {
      childProcess.send({ ...clientRequestData.header }, clientRequestData.socket)
      clients?.push(clientKey)
      childClientMap.set(childProcess, clients!)
      return
    }
  }

  // If no child process has less than MAX_CLIENTS_PER_CHILD clients, then create a new child process
  spinUpChildProcess(clientKey, clientRequestData)
}

const removeSocketClient = (clientId: string): void => {
  socketClientMap.delete(clientId)
  for (const [childProcess, clients] of childClientMap.entries()) {
    const index = clients.findIndex((id) => id === clientId)
    if (index > -1) {
      clients.splice(index, 1)
      childClientMap.set(childProcess, clients)
      console.log(`Client (${clientId}) disconnected from Child Process (${childProcess.pid})`)
      showAllProcesses()
      // Check if the child process has no clients, then terminate it
      if (clients.length === 0) terminateProcess(childProcess.pid!)
      return
    }
  }
}

const registerChildMessageListener = (child: ChildProcess): void => {
  child.on('message', ({ type, data }: ChildMessageInterface) => {
    if (type === 'client_close') {
      console.log('Client Connection Termination Event Received, ID: ', data)
      removeSocketClient(data.pid.toString())
    }
    if (type === 'child_close') {
      console.log('Terminating Child Process due to error: ', data.err)
      terminateProcess(data.pid)
    }
  })
}

export const getChildProcessForClient = (clientId: string): ChildProcess | undefined => {
  const childProcessId = socketClientMap.get(clientId)
  if (!childProcessId) throw new Error(`Child process associated with Client: ${clientId} not found.`)
  const childProcess = childProcessMap.get(childProcessId)
  if (!childProcess) throw new Error(`Child process with PID: ${childProcessId} not found.`)
  return childProcess
}

export const getChildProcess = (pid: number): ChildProcess | undefined => {
  const child = childProcessMap.get(pid)
  if (!child) throw new Error(`Child process with PID: ${pid} not found.`)
  return child
}

const terminateProcess = (pid: number): void => {
  try {
    const childProcess = getChildProcess(pid)
    if (childProcess?.kill()) {
      childProcessMap.delete(pid)
      childClientMap.delete(childProcess!)
      console.log(`❌ Child process with PID: ${pid} Terminated.`)
    }
    showAllProcesses()
    if (childProcessMap.size === 0) console.log(`--> No Active child processes <-`)
  } catch (e) {
    console.error('Error in terminateProcess():', e)
    return
  }
}
