import { addSchema } from '../../utils/serialization/SchemaHelpers'

// Define the simplified schema for FastifyReply
export const schemaCycleInfoResp = {
  type: 'object',
  properties: {
    raw: { type: 'object' }, // RawServer, RawRequest, RawReply
    request: { type: 'object' }, // RouteGeneric
    context: { type: 'object' }, // ContextConfig
    schemaCompiler: { type: 'object' }, // SchemaCompiler
    typeProvider: { type: 'object' }, // TypeProvider
    statusCode: { type: 'number' },
  },
  additionalProperties: true,
  required: ['raw', 'request', 'context', 'schemaCompiler', 'typeProvider'],
}

export function initCycleInfoResp(): void {
  addSchemaDependencies()
  addSchemas()
}

// Add schema dependencies
function addSchemaDependencies(): void {
  // No dependencies for CycleInfoResp in this simplified example
}

// Register schemas
function addSchemas(): void {
  addSchema('CycleInfoResp', schemaCycleInfoResp)
}
