import { AuthorizedConfig } from '../config'
import { request } from './request'

export interface Connector {
  name: string,
  slug: string,
  short_description: string,
  mark_url: string,
  about?: string,
  description?: string,
  connection?: {
    enabled: boolean
  }
}

export async function listConnectors(config: AuthorizedConfig): Promise<Connector[]> {
  const {
    connectors
  } = await request(config, {
    path: '/connectors'
  })

  return connectors as Connector[]
}

export async function getConnector(config: AuthorizedConfig, connectorSlug: string): Promise<Connector> {
  const {
    connector
  } = await request(config, {
    path: `/connectors/${connectorSlug}`
  })

  return connector as Connector
}
