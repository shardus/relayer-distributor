import { addSchema } from '../../utils/serialization/SchemaHelpers'

// Define the schema for ReceiptRequest
export const schemaTotalDataReq = {
  type: 'object',
  properties: {
    sender: { type: 'string' },
    sign: { owner: 'string', sig: 'string' }, // Adjust the type as per the actual definition of 'sign'
  },
  additionalProperties: false,
  required: ['sender', 'sign'],
}

// Add schema dependencies
export function addSchemaDependencies(): void {
  // No dependencies for ReceiptRequest
}

// Register schemas
export function addSchemas(): void {
  addSchema('TotalDataReq', schemaTotalDataReq)
}
