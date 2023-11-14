import * as core from '@shardus/crypto-utils'
import { SignedObject } from '@shardus/crypto-utils'

import { getDistributorInfo, getDistributorSecretKey } from './index'
// Crypto initialization fns

export function setCryptoHashKey(hashkey: string): void {
  core.init(hashkey)
}

export const hashObj = core.hashObj

// Asymmetric Encyption Sign/Verify API
export type SignedMessage = SignedObject

export function sign<T>(obj: T, sk?: string, pk?: string): T & SignedObject {
  const objCopy = JSON.parse(core.stringify(obj))
  core.signObj(objCopy, sk || getDistributorSecretKey(), pk || getDistributorInfo().publicKey)
  return objCopy
}

export function verify(obj: SignedObject): boolean {
  return core.verifyObj(obj)
}
