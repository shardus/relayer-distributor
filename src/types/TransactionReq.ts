import { Signature } from '@shardus/crypto-utils'
import { verifyPayload } from './ajv/Helpers'

export type TransactionReq = {
  start?: number
  end?: number
  count?: number
  startCycle?: number
  endCycle?: number
  page?: number
  txId?: string
  appReceiptId?: string
  sender: string
  sign: object
}
//TODO: work with request version
export const cCycleInfoReqVersion = 1

export function verifyTransactionReq(data: TransactionReq): boolean {
  const errors = verifyPayload('TransactionReq', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
