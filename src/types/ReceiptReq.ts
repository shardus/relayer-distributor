import { Signature } from '@shardus/crypto-utils'
import { verifyPayload } from './ajv/Helpers'

export type ReceiptReq = {
  start?: number
  end?: number
  count?: number
  startCycle?: number
  endCycle?: number
  type?: string
  page?: number
  txId?: string
  txIdList?: string
  sender: string
  sign: object
}
//TODO: work with request version
export const cCycleInfoReqVersion = 1

export function verifyReceiptReq(data: ReceiptReq): boolean {
  const errors = verifyPayload('ReceiptReq', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
