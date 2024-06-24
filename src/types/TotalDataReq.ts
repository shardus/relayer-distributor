import { Signature } from '@shardus/crypto-utils'
import { verifyPayload } from './ajv/Helpers'

export type TotalDataReq = {
  sender: string
  sign: object
}
//TODO: work with request version
export const cCycleInfoReqVersion = 1

export function verifyTotalDataReq(data: TotalDataReq): boolean {
  const errors = verifyPayload('TotalDataReq', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
