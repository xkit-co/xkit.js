import { AuthorizedConfig } from '../config'
import { Connection } from './connection'
import { request } from './request'

export async function listCRMObjects(
  config: AuthorizedConfig,
  mapping: any
): Promise<unknown> {
  const response = await request(config, {
    path: '/crm_setup',
    method: 'POST',
    body: mapping,
    allow400AsValid: true
  })

  return response
}

export async function listAPIObjects(
  config: AuthorizedConfig,
  connection: Connection
): Promise<unknown> {
  const { api_objects: APIObjects } = await request<{
    api_objects: unknown
  }>(config, {
    path: `/connection/${connection.id}/api_objects`,
    method: 'GET'
  })

  return APIObjects
}

export async function getMapping(
  config: AuthorizedConfig,
  connection: Connection
): Promise<unknown> {
  const { mapping } = await request<{ mapping: unknown }>(config, {
    path: `/connection/${connection.id}/crm_mapping`,
    method: 'GET'
  })

  return mapping
}

export async function saveMapping(
  config: AuthorizedConfig,
  connection: Connection,
  CRMObjects: unknown,
  objectMappings: unknown
): Promise<void> {
  await request(config, {
    path: `/connection/${connection.id}/crm_mapping`,
    method: 'POST',
    body: {
      objects: CRMObjects,
      mapping: objectMappings
    }
  })
}
