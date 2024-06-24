import { Signature } from '@shardus/crypto-utils'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { verifyPayload } from './ajv/Helpers'

export type CycleInfoResp = {
  raw: { type: 'object' } // RawServer, RawRequest, RawReply
  request: { type: 'object' } // RouteGeneric
  context: { type: 'object' } // ContextConfig
  schemaCompiler: { type: 'object' } // SchemaCompiler
  typeProvider: { type: 'object' } // TypeProvider
  statusCode: { type: 'number' }
}
//TODO: work with response version
export const cCycleInfoRespVersion = 1

export function verifyCycleInfoReq(data: CycleInfoResp): boolean {
  const errors = verifyPayload('CycleInfoResp', data)
  if (errors && errors.length > 0) {
    return false
  }
  return true
}
