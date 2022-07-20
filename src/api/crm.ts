import { AuthorizedConfig } from '../config'
import { Connection } from './connection'
import { request } from './request'

export async function listCRMObjects(
  config: AuthorizedConfig,
  connection: Connection,
  mapping: any
): Promise<unknown> {
  const response = await request(config, {
    path: `/connection/${connection.id}/crm_setup`,
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

export async function getAPIObject(
  config: AuthorizedConfig,
  connection: Connection,
  apiObjectSlug: string
): Promise<unknown> {
  const { api_object: APIObject } = await request<{
    api_object: unknown
  }>(config, {
    path: `/connection/${connection.id}/api_objects/${apiObjectSlug}`,
    method: 'GET'
  })

  return APIObject
}

export async function getMapping(
  config: AuthorizedConfig,
  connection: Connection
): Promise<unknown> {
  const response = await request(config, {
    path: `/connection/${connection.id}/crm_mapping`,
    method: 'GET'
  })

  return response
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
