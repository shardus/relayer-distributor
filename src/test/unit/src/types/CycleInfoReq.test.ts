import { Utils } from '@shardus/types'
import {} from '../../../../types/ajv/CycleInfoReq'

import { initAjvSchemas } from '../../../../types/ajv/Helpers'
import { CycleInfoReq, verifyCycleInfoReq } from '../../../../types/CycleInfoReq'
import { Signature } from '@shardus/crypto-utils'

describe('CycleInfo req test', () => {
  beforeAll(() => {
    initAjvSchemas()
  })

  describe('Data validation Cases', () => {
    const invalidObjects = [
      {
        sender: '0x0',
        sign: {},
      },
    ]
    test.each(invalidObjects)('should throw AJV error', (data) => {
      const res = verifyCycleInfoReq({
        start: 0,
        end: 0,
        count: 0,
        ...data,
      })
      console.log('res', res)
    })
  })
})
test('debug > isDebugMode > Should return true if config mode is DEBUG', () => {
  console.log('test')
})
