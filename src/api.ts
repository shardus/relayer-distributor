import { Signature } from '@shardus/crypto-utils'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { config } from './Config'
import * as Logger from './Logger'
import * as Crypto from './utils/Crypto'
import * as Utils from './utils/Utils'
import * as CycleDB from './dbstore/cycles'
import * as AccountDB from './dbstore/accounts'
import * as TransactionDB from './dbstore/transactions'
import * as ReceiptDB from './dbstore/receipts'
import * as OriginalTxDB from './dbstore/originalTxsData'
import { distributorSubscribers } from './distributor'

const TXID_LENGTH = 64

//Types and interfaces for request body
interface RequestBody {
  count: number
  start: number
  end: number
  startCycle?: number
  endCycle?: number
  type?: string
  page?: number
  txId?: string
  txIdList?: string
  sender?: string
  sign: Signature
  collectorInfo?: {
    subscriptionType: string
    timestamp: number
  }
}

export enum TransactionType {
  Receipt = 0, // EVM Receipt
  NodeRewardReceipt = 1,
  StakeReceipt = 2,
  UnstakeReceipt = 3,
  EVM_Internal = 4,
  ERC_20 = 5,
  ERC_721 = 6,
  ERC_1155 = 7,
  InternalTxReceipt = 8,
}

export interface OriginalTxData {
  txId: string
  timestamp: number
  cycle: number
  originalTxData: OriginalTxData | OriginalTxData2
  sign: {
    owner: string
    sig: string
  }
}
export interface OriginalTxData2 {
  txId: string
  txHash: string
  timestamp: number
  cycle: number
  transactionType: TransactionType
}

export function registerRoutes(server: FastifyInstance<Server, IncomingMessage, ServerResponse>): void {
  type CycleInfoRequest = FastifyRequest<{
    Body: { start: number; end: number; count: number; sender: string; sign: Signature }
  }>

  server.post('/cycleinfo', async (_request: CycleInfoRequest, reply) => {
    const requestData = _request.body
    const result = validateRequestData(requestData, {
      start: 'n?',
      end: 'n?',
      count: 'n?',
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    const { start, end, count } = _request.body
    let cycleInfo = []
    if (count) {
      if (count <= 0 || Number.isNaN(count)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid count` }))
        return
      }
      if (count > 100) {
        reply.send(Crypto.sign({ success: false, error: `Max count is 100` }))
        return
      }
      cycleInfo = (await CycleDB.queryLatestCycleRecords(count)) || []
    } else if (start || end) {
      const from = start ? start : 0
      const to = end ? end : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        Logger.mainLogger.error(`Invalid start and end counters`)
        reply.send(Crypto.sign({ success: false, error: `Invalid start and end counters` }))
        return
      }
      // Limit the number of cycles to 100
      const cycleCount = to - from
      if (cycleCount > 100) {
        Logger.mainLogger.error(`Exceed maximum limit of 100 cycles`)
        reply.send(Crypto.sign({ success: false, error: `Exceed maximum limit of 100 cycles` }))
        return
      }
      cycleInfo = (await CycleDB.queryCycleRecordsBetween(from, to)) || []
    } else {
      reply.send({
        success: false,
        error: 'not specified which cycle to show',
      })
      return
    }
    const res = Crypto.sign({
      cycleInfo,
    })
    reply.send(res)
  })

  type ReceiptRequest = FastifyRequest<{
    Body: {
      count: number
      start: number
      end: number
      startCycle: number
      endCycle: number
      type: string
      page: number
      txId: string
      txIdList: string
      sender: string
      sign: Signature
    }
  }>

  server.post('/originalTx', async (_request: ReceiptRequest, reply) => {
    const requestData = _request.body
    const result = validateRequestData(requestData, {
      count: 'n?',
      start: 'n?',
      end: 'n?',
      startCycle: 'n?',
      endCycle: 'n?',
      type: 's?',
      page: 'n?',
      txId: 's?',
      txIdList: 's?',
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    const { count, start, end, startCycle, endCycle, type, page, txId, txIdList } = _request.body
    let originalTxs:
      | (OriginalTxDB.OriginalTxData | OriginalTxDB.CycleCount | OriginalTxDB.CycleCount)[]
      | number = []
    if (count) {
      if (count <= 0 || Number.isNaN(count)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid count` }))
        return
      }
      if (count > 100) {
        reply.send(Crypto.sign({ success: false, error: `Max count is 100` }))
        return
      }
      originalTxs = (await OriginalTxDB.queryLatestOriginalTxs(count)) || []
    } else if (txId) {
      if (txId.length !== TXID_LENGTH) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txId ${txId}`,
          })
        )
        return
      }
      originalTxs = [await OriginalTxDB.queryOriginalTxDataByTxId(txId)] || []
    } else if (txIdList) {
      let txIdListArr: string[] = []
      try {
        txIdListArr = JSON.parse(txIdList)
      } catch (e) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txIdList ${txIdList}`,
          })
        )
        return
      }
      for (const txId of txIdListArr) {
        if (typeof txId !== 'string' || txId.length !== TXID_LENGTH) {
          reply.send(
            Crypto.sign({
              success: false,
              error: `Invalid txId ${txId} in the List`,
            })
          )
          return
        }
        const originalTx = await OriginalTxDB.queryOriginalTxDataByTxId(txId)
        if (originalTx) originalTxs.push(originalTx)
      }
    } else if (start || end) {
      const from = start ? start : 0
      const to = end ? end : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 original transactions`,
          })
        )
        return
      }
      originalTxs = await OriginalTxDB.queryOriginalTxsData(from, count + 1)
    } else if (startCycle || endCycle) {
      const from = startCycle ? startCycle : 0
      const to = endCycle ? endCycle : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid startCycle and endCycle counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 1000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 1000 cycles`,
          })
        )
        return
      }
      if (type === 'tally') {
        originalTxs = await OriginalTxDB.queryOriginalTxDataCountByCycles(from, to)
      } else if (type === 'count') {
        originalTxs = await OriginalTxDB.queryOriginalTxDataCount(from, to)
      } else {
        let skip = 0
        const limit = 100
        if (page) {
          if (page < 1 || Number.isNaN(page)) {
            reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
            return
          }
          skip = page - 1
          if (skip > 0) skip = skip * limit
        }
        originalTxs = await OriginalTxDB.queryOriginalTxsData(skip, limit, from, to)
      }
    }
    const res = Crypto.sign({
      originalTxs,
    })
    reply.send(res)
  })

  server.post('/receipt', async (_request: ReceiptRequest, reply) => {
    const requestData = _request.body
    const result = validateRequestData(requestData, {
      count: 'n?',
      start: 'n?',
      end: 'n?',
      startCycle: 'n?',
      endCycle: 'n?',
      type: 's?',
      page: 'n?',
      txId: 's?',
      txIdList: 's?',
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    const { count, start, end, startCycle, endCycle, type, page, txId, txIdList } = _request.body
    let receipts:
      | ReceiptDB.Receipt
      | ReceiptDB.Receipt[]
      | { cycle: number; receipts: number }[]
      | void
      | number = []
    if (count) {
      if (count <= 0 || Number.isNaN(count)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid count` }))
        return
      }
      if (count > 100) {
        reply.send(Crypto.sign({ success: false, error: `Max count is 100` }))
        return
      }
      receipts = (await ReceiptDB.queryLatestReceipts(count)) || []
    } else if (txId) {
      if (txId.length !== TXID_LENGTH) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txId ${txId}`,
          })
        )
        return
      }
      receipts = (await ReceiptDB.queryReceiptByReceiptId(txId)) || []
    } else if (txIdList) {
      let txIdListArr: string[] = []
      try {
        txIdListArr = JSON.parse(txIdList)
      } catch (e) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txIdList ${txIdList}`,
          })
        )
        return
      }
      for (const txId of txIdListArr) {
        if (typeof txId !== 'string' || txId.length !== TXID_LENGTH) {
          reply.send(
            Crypto.sign({
              success: false,
              error: `Invalid txId ${txId} in the List`,
            })
          )
          return
        }
        const receipts: ReceiptDB.Receipt[] = []
        const receipt: void | ReceiptDB.Receipt = await ReceiptDB.queryReceiptByReceiptId(txId)
        if (receipt) receipts.push(receipt)
      }
    } else if (start || end) {
      const from = start ? start : 0
      const to = end ? end : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 receipts`,
          })
        )
        return
      }
      receipts = (await ReceiptDB.queryReceipts(from, count + 1)) || []
    } else if (startCycle || endCycle) {
      const from = startCycle ? startCycle : 0
      const to = endCycle ? endCycle : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid startCycle and endCycle counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 1000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 1000 cycles`,
          })
        )
        return
      }
      if (type === 'tally') {
        receipts = (await ReceiptDB.queryReceiptCountByCycles(from, to)) || []
      } else if (type === 'count') {
        receipts = await ReceiptDB.queryReceiptCountBetweenCycles(from, to)
      } else {
        let skip = 0
        const limit = 100
        if (page) {
          if (page < 1 || Number.isNaN(page)) {
            reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
            return
          }
          skip = page - 1
          if (skip > 0) skip = skip * limit
        }
        receipts = await ReceiptDB.queryReceiptsBetweenCycles(skip, limit, from, to)
      }
    }
    const res = Crypto.sign({
      receipts,
    })
    reply.send(res)
  })

  type AccountRequest = FastifyRequest<{
    Body: {
      count: number
      start: number
      end: number
      startCycle: number
      endCycle: number
      page: number
      accountId: string
      sender: string
      sign: Signature
    }
  }>

  server.post('/account', async (_request: AccountRequest, reply) => {
    const requestData = _request.body
    const result = validateRequestData(requestData, {
      count: 'n?',
      start: 'n?',
      end: 'n?',
      startCycle: 'n?',
      endCycle: 'n?',
      page: 'n?',
      accountId: 's?',
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    let accounts = []
    let totalAccounts = 0
    let res
    const { count, start, end, startCycle, endCycle, page, accountId } = _request.body
    if (count) {
      if (count <= 0 || Number.isNaN(count)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid count` }))
        return
      }
      if (count > 100) {
        reply.send(Crypto.sign({ success: false, error: `Max count is 100` }))
        return
      }
      accounts = (await AccountDB.queryLatestAccounts(count)) || []
    } else if (start || end) {
      const from = start ? start : 0
      const to = end ? end : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 accounts`,
          })
        )
        return
      }
      accounts = (await AccountDB.queryAccounts(from, count + 1)) || []
      res = Crypto.sign({
        accounts,
      })
    } else if (startCycle || endCycle) {
      const from = startCycle ? startCycle : 0
      const to = endCycle ? endCycle : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 100) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 100 cycles to query accounts Count`,
          })
        )
        return
      }
      totalAccounts = (await AccountDB.queryAccountCountBetweenCycles(from, to)) || 0
      if (page) {
        if (page < 1 || Number.isNaN(page)) {
          reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
          return
        }
        let skip = page - 1
        const limit = 10000 // query 10000 accounts
        if (skip > 0) skip = skip * limit
        accounts = (await AccountDB.queryAccountsBetweenCycles(skip, limit, from, to)) || []
        res = Crypto.sign({
          accounts,
          totalAccounts,
        })
      } else {
        res = Crypto.sign({
          totalAccounts,
        })
      }
    } else if (accountId) {
      const account = await AccountDB.queryAccountByAccountId(accountId)
      accounts = account ? [account] : []
      res = Crypto.sign({
        accounts,
      })
    } else {
      reply.send({
        success: false,
        error: 'not specified which account to show',
      })
      return
    }
    reply.send(res)
  })

  type TransactionRequest = FastifyRequest<{
    Body: {
      count: number
      start: number
      end: number
      startCycle: number
      endCycle: number
      txId: string
      page: number
      accountId: string
      sender: string
      sign: Signature
    }
  }>

  server.post('/transaction', async (_request: TransactionRequest, reply) => {
    const requestData = _request.body
    const result = validateRequestData(requestData, {
      count: 'n?',
      start: 'n?',
      end: 'n?',
      txId: 's?',
      accountId: 's?',
      startCycle: 'n?',
      endCycle: 'n?',
      page: 'n?',
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    const { count, start, end, txId, accountId, startCycle, endCycle, page } = _request.body
    let transactions = []
    let totalTransactions = 0
    let res
    if (count) {
      if (count <= 0 || Number.isNaN(count)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid count` }))
        return
      }
      if (count > 100) {
        reply.send(Crypto.sign({ success: false, error: `Max count is 100` }))
        return
      }
      transactions = (await TransactionDB.queryLatestTransactions(count)) || []
    } else if (start || end) {
      const from = start ? start : 0
      const to = end ? end : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 transactions`,
          })
        )
        return
      }
      transactions = (await TransactionDB.queryTransactions(from, count + 1)) || []
      res = Crypto.sign({
        transactions,
      })
    } else if (startCycle || endCycle) {
      const from = startCycle ? startCycle : 0
      const to = endCycle ? endCycle : from + 100
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      const count = to - from
      if (count > 100) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 100 cycles to query transactions Count`,
          })
        )
        return
      }
      totalTransactions = await TransactionDB.queryTransactionCountBetweenCycles(from, to)
      if (page) {
        if (page < 1 || Number.isNaN(page)) {
          reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
          return
        }
        let skip = page - 1
        const limit = 10000 // query 10000 transactions
        if (skip > 0) skip = skip * limit
        transactions = (await TransactionDB.queryTransactionsBetweenCycles(skip, limit, from, to)) || []
        res = Crypto.sign({
          transactions,
          totalTransactions,
        })
      } else {
        res = Crypto.sign({
          totalTransactions,
        })
      }
    } else if (txId) {
      const transaction = await TransactionDB.queryTransactionByTxId(txId)
      transactions = transaction ? [transaction] : []
      res = Crypto.sign({
        transactions,
      })
    } else if (accountId) {
      const transaction = await TransactionDB.queryTransactionByAccountId(accountId)
      transactions = transaction ? [transaction] : []
      res = Crypto.sign({
        transactions,
      })
    } else {
      res = {
        success: false,
        error: 'not specified which account to show',
      }
    }
    reply.send(res)
  })

  server.post('/totalData', async (_request, reply) => {
    const requestData = _request.body as RequestBody
    const result = validateRequestData(requestData, {
      sender: 's',
      sign: 'o',
    })
    if (!result.success) {
      reply.send(Crypto.sign({ success: false, error: result.error }))
      return
    }
    const totalCycles = await CycleDB.queryCyleCount()
    const totalAccounts = await AccountDB.queryAccountCount()
    const totalTransactions = await TransactionDB.queryTransactionCount()
    const totalReceipts = await ReceiptDB.queryReceiptCount()
    const totalOriginalTxs = await OriginalTxDB.queryOriginalTxDataCount()
    reply.send(
      Crypto.sign({ totalCycles, totalAccounts, totalTransactions, totalReceipts, totalOriginalTxs })
    )
  })

  // TODO: Put this endpoint behind the debug middleware
  // Debug Config Endpoint
  server.get(
    '/config',
    // {
    //   preHandler: async (_request, reply) => {
    //     isDebugMiddleware(_request, reply)
    //   },
    // },
    (_request, reply) => {
      const res = Crypto.sign({
        config,
      })
      reply.send(res)
    }
  )
}

export const validateRequestData = (
  data: RequestBody,
  expectedDataType: {
    [key: string]: 'n?' | 's?' | 'o' | 's'
  }
): {
  success: boolean
  error?: string
} => {
  try {
    let err = Utils.validateTypes(data, expectedDataType)
    if (err) {
      Logger.mainLogger.error('Invalid request data ', err)
      return { success: false, error: 'Invalid request data ' + err }
    }
    err = Utils.validateTypes(data.sign, { owner: 's', sig: 's' })
    if (err) {
      Logger.mainLogger.error('Invalid request data signature ', err)
      return { success: false, error: 'Invalid request data signature ' + err }
    }
    if (data.sign.owner !== data.sender) {
      Logger.mainLogger.error('Data sender publicKey and sign owner key does not match')
      return { success: false, error: 'Data sender publicKey and sign owner key does not match' }
    }
    if (config.limitToSubscribersOnly) {
      if (!distributorSubscribers.has(data.sender)) {
        Logger.mainLogger.error('Data request sender is not a subscriber')
        return { success: false, error: 'Data request sender is not a subscriber' }
      }
      const subscriber = distributorSubscribers.get(data.sender)
      if (subscriber?.expirationTimestamp !== 0 && subscriber!.expirationTimestamp > Date.now()) {
        Logger.mainLogger.error('Subscriber subscription expired')
        return { success: false, error: 'Subscriber subscription expired' }
      }
      if (expectedDataType.collectorInfo) {
        err = Utils.validateTypes(data.collectorInfo, { subscriptionType: 's', timestamp: 'n' })
        if (err) {
          Logger.mainLogger.error('Invalid collectorInfo ', err)
          return { success: false, error: 'Invalid collectorInfo ' + err }
        }
        if (data.collectorInfo.subscriptionType !== subscriber.subscriptionType) {
          Logger.mainLogger.error('Invalid subscriptionType')
          return { success: false, error: 'Invalid subscriptionType' }
        }
        // Check if the timestamp is less than 30 seconds of the current time
        const ACCEPTABLE_TIMESTAMP_DIFF = 30000
        if (
          data.collectorInfo.timestamp !== 0 &&
          Date.now() - data.collectorInfo.timestamp > ACCEPTABLE_TIMESTAMP_DIFF
        ) {
          Logger.mainLogger.error('Invalid timestamp')
          return { success: false, error: 'Invalid timestamp' }
        }
      }
    }
    if (!Crypto.verify(data)) {
      Logger.mainLogger.error('Invalid signature', data)
      return { success: false, error: 'Invalid signature' }
    }
    return { success: true }
  } catch (e) {
    Logger.mainLogger.error('Error validating request data', e)
    return { success: false, error: 'Error validating request data' }
  }
}
