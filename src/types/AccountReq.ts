import { Signature } from '@shardus/crypto-utils'
import { verifyPayload } from './ajv/Helpers'

export type AccountReq = {
  start?: number
  end?: number
  count?: number
  startCycle?: number
  endCycle?: number
  page?: number
  accountId?: string
  sender: string
  sign: object
}
//TODO: work with request version
export const cCycleInfoReqVersion = 1

export function verifyAccountReq(data: AccountReq): boolean {
  const errors = verifyPayload('AccountReq', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
