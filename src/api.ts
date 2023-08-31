import { FastifyInstance, FastifyRequest } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { config } from './Config'
import * as Logger from './Logger'
import * as Crypto from './Crypto'
import * as Utils from './utils/Utils'
import * as CycleDB from './dbstore/cycles'
import * as AccountDB from './dbstore/accounts'
import * as TransactionDB from './dbstore/transactions'
import * as ReceiptDB from './dbstore/receipts'
import * as OriginalTxDB from './dbstore/originalTxsData'

const TXID_LENGTH = 64

export function registerRoutes(server: FastifyInstance<Server, IncomingMessage, ServerResponse>) {
  type CycleInfoRequest = FastifyRequest<{
    Querystring: { start: string; end: string; count: string }
  }>

  server.get('/cycleinfo', async (_request: CycleInfoRequest, reply) => {
    let { start, end, count } = _request.query
    let cycleInfo = []
    if (count) {
      let cycleCount = parseInt(count)
      if (!(cycleCount > 0 && cycleCount <= 100)) {
        reply.send(Crypto.sign({ success: false, error: `Invalid cycle count ${count}` }))
        return
      }
      cycleInfo = await CycleDB.queryLatestCycleRecords(cycleCount)
    } else if (start || end) {
      let from = parseInt(start)
      let to = parseInt(end)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        Logger.mainLogger.error(`Invalid start and end counters`)
        reply.send(Crypto.sign({ success: false, error: `Invalid start and end counters` }))
        return
      }
      // Limit the number of cycles to 100
      let cycleCount = to - from
      if (cycleCount > 100) {
        Logger.mainLogger.error(`Exceed maximum limit of 100 cycles`)
        reply.send(Crypto.sign({ success: false, error: `Exceed maximum limit of 100 cycles` }))
        return
      }
      cycleInfo = await CycleDB.queryCycleRecordsBetween(from, to)
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
    Querystring: {
      start: string
      end: string
      startCycle: string
      endCycle: string
      type: string
      page: string
      txId: string
      txIdList: string
    }
  }>

  server.get('/originalTx', async (_request: ReceiptRequest, reply) => {
    let err = Utils.validateTypes(_request.query, {
      start: 's?',
      end: 's?',
      startCycle: 's?',
      endCycle: 's?',
      type: 's?',
      page: 's?',
      txId: 's?',
      txIdList: 's?',
    })
    if (err) {
      reply.send(Crypto.sign({ success: false, error: err }))
      return
    }
    let { start, end, startCycle, endCycle, type, page, txId, txIdList } = _request.query
    let originalTxs: any = []
    if (txId) {
      if (txId.length !== TXID_LENGTH) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txId ${txId}`,
          })
        )
        return
      }
      originalTxs = await OriginalTxDB.queryOriginalTxDataByTxId(txId)
    } else if (txIdList) {
      let txIdListArr = []
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
    } else if (start && end) {
      let from = parseInt(start)
      let to = parseInt(end)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 original transactions`,
          })
        )
        return
      }
      originalTxs = await OriginalTxDB.queryOriginalTxsData(from, count)
    } else if (startCycle && endCycle) {
      let from = parseInt(startCycle)
      let to = parseInt(endCycle)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid startCycle and endCycle counters`,
          })
        )
        return
      }
      let count = to - from
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
        let limit = 100
        if (page) {
          skip = parseInt(page) - 1
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

  server.get('/receipt', async (_request: ReceiptRequest, reply) => {
    let err = Utils.validateTypes(_request.query, {
      start: 's?',
      end: 's?',
      startCycle: 's?',
      endCycle: 's?',
      type: 's?',
      page: 's?',
      txId: 's?',
      txIdList: 's?',
    })
    if (err) {
      reply.send(Crypto.sign({ success: false, error: err }))
      return
    }
    let { start, end, startCycle, endCycle, type, page, txId, txIdList } = _request.query
    let receipts = []
    if (txId) {
      if (txId.length !== TXID_LENGTH) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid txId ${txId}`,
          })
        )
        return
      }
      receipts = await ReceiptDB.queryReceiptByReceiptId(txId)
    } else if (txIdList) {
      let txIdListArr = []
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
        const receipt = await ReceiptDB.queryReceiptByReceiptId(txId)
        if (receipt) receipts.push(receipt)
      }
    } else if (start && end) {
      let from = parseInt(start)
      let to = parseInt(end)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 receipts`,
          })
        )
        return
      }
      receipts = await ReceiptDB.queryReceipts(from, count)
    } else if (startCycle && endCycle) {
      let from = parseInt(startCycle)
      let to = parseInt(endCycle)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid startCycle and endCycle counters`,
          })
        )
        return
      }
      let count = to - from
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
        receipts = await ReceiptDB.queryReceiptCountByCycles(from, to)
      } else if (type === 'count') {
        receipts = await ReceiptDB.queryReceiptCountBetweenCycles(from, to)
      } else {
        let skip = 0
        let limit = 100
        if (page) {
          skip = parseInt(page) - 1
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
    Querystring: {
      start: string
      end: string
      startCycle: string
      endCycle: string
      type: string
      page: string
      accountId: string
    }
  }>

  server.get('/account', async (_request: AccountRequest, reply) => {
    let err = Utils.validateTypes(_request.query, {
      start: 's?',
      end: 's?',
      startCycle: 's?',
      endCycle: 's?',
      page: 's?',
      address: 's?',
      accountId: 's?',
    })
    if (err) {
      reply.send(Crypto.sign({ success: false, error: err }))
      return
    }
    let accounts = []
    let totalAccounts = 0
    let res
    let { start, end, startCycle, endCycle, page, accountId } = _request.query
    if (start && end) {
      let from = parseInt(start)
      let to = parseInt(end)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 accounts`,
          })
        )
        return
      }
      accounts = await AccountDB.queryAccounts(from, count)
      res = Crypto.sign({
        accounts,
      })
    } else if (startCycle && endCycle) {
      let from = parseInt(startCycle)
      let to = parseInt(endCycle)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
      if (count > 100) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 100 cycles to query accounts Count`,
          })
        )
        return
      }
      totalAccounts = await AccountDB.queryAccountCountBetweenCycles(from, to)
      if (page) {
        let offset = parseInt(page)
        if (offset < 0) {
          reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
          return
        }
        let skip = 0
        let limit = 10000 // query 10000 accounts
        if (offset > 0) {
          skip = offset * 10000
        }
        accounts = await AccountDB.queryAccountsBetweenCycles(skip, limit, from, to)
      }
      res = Crypto.sign({
        accounts,
        totalAccounts,
      })
    } else if (accountId) {
      accounts = await AccountDB.queryAccountByAccountId(accountId)
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
    Querystring: {
      start: string
      end: string
      startCycle: string
      endCycle: string
      txId: string
      page: string
      accountId: string
    }
  }>

  server.get('/transaction', async (_request: TransactionRequest, reply) => {
    let err = Utils.validateTypes(_request.query, {
      start: 's?',
      end: 's?',
      txId: 's?',
      accountId: 's?',
      startCycle: 's?',
      endCycle: 's?',
      page: 's?',
    })
    if (err) {
      reply.send(Crypto.sign({ success: false, error: err }))
      return
    }
    let { start, end, txId, accountId, startCycle, endCycle, page } = _request.query
    let transactions = []
    let totalTransactions = 0
    let res
    if (start && end) {
      let from = parseInt(start)
      let to = parseInt(end)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
      if (count > 10000) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Exceed maximum limit of 10000 transactions`,
          })
        )
        return
      }
      transactions = await TransactionDB.queryTransactions(from, count)
      res = Crypto.sign({
        transactions,
      })
    } else if (startCycle && endCycle) {
      let from = parseInt(startCycle)
      let to = parseInt(endCycle)
      if (!(from >= 0 && to >= from) || Number.isNaN(from) || Number.isNaN(to)) {
        reply.send(
          Crypto.sign({
            success: false,
            error: `Invalid start and end counters`,
          })
        )
        return
      }
      let count = to - from
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
        let offset = parseInt(page)
        if (offset < 0) {
          reply.send(Crypto.sign({ success: false, error: `Invalid page number` }))
          return
        }
        let skip = 0
        let limit = 10000 // query 10000 transactions
        if (offset > 0) {
          skip = offset * 10000
        }
        transactions = await TransactionDB.queryTransactionsBetweenCycles(skip, limit, from, to)
      }
      res = Crypto.sign({
        transactions,
        totalTransactions,
      })
    } else if (txId) {
      transactions = await TransactionDB.queryTransactionByTxId(txId)
      res = Crypto.sign({
        transactions,
      })
    } else if (accountId) {
      transactions = await TransactionDB.queryTransactionByAccountId(accountId)
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

  server.get('/totalData', async (_request, reply) => {
    const totalCycles = await CycleDB.queryCyleCount()
    const totalAccounts = await AccountDB.queryAccountCount()
    const totalTransactions = await TransactionDB.queryTransactionCount()
    const totalReceipts = await ReceiptDB.queryReceiptCount()
    const totalOriginalTxs = await OriginalTxDB.queryOriginalTxDataCount()
    reply.send({
      totalCycles,
      totalAccounts,
      totalTransactions,
      totalReceipts,
      totalOriginalTxs,
    })
  })

  // Debug Config Endpoint
  server.get(
    '/config',
    // {
    //   preHandler: async (_request, reply) => {
    //     isDebugMiddleware(_request, reply)
    //   },
    // },
    (_request, reply) => {
      const res = Crypto.sign(config)
      reply.send(res)
    }
  )
}
