import { Signature } from '@shardus/crypto-utils'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { verifyPayload } from './ajv/Helpers'

export type CycleInfoReq = {
  start?: number
  end?: number
  count?: number
  sender: string
  sign: object
}
//TODO: work with request version
export const cCycleInfoReqVersion = 1

export function verifyCycleInfoReq(data: CycleInfoReq): boolean {
  const errors = verifyPayload('CycleInfoReq', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
