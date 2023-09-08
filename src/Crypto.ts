import * as core from '@shardus/crypto-utils'
import { SignedObject } from '@shardus/crypto-utils'

import { getDistributorInfo, getDistributorSecretKey } from './distributor'

// Crypto initialization fns

export function setCryptoHashKey(hashkey: string): any {
  core.init(hashkey)
}

export const hashObj = core.hashObj

// Asymmetric Encyption Sign/Verify API
export type SignedMessage = SignedObject

export function sign<T>(obj: T): T & SignedObject {
  const objCopy = JSON.parse(core.stringify(obj))
  core.signObj(objCopy, getDistributorSecretKey(), getDistributorInfo().publicKey)
  return objCopy
}

export function verify(obj: SignedObject): boolean {
  return core.verifyObj(obj)
}
