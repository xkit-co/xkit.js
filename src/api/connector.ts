import { IKitConfig, AuthorizedConfig } from '../config'
import { request } from './request'
import { ConnectionOnly } from './connection'

export interface PublicConnector {
  name: string
  slug: string
  short_description: string
  mark_url: string
  about?: string
  description?: string
  supports_multiple_connections: boolean
}

export interface Connector extends PublicConnector {
  connection?: ConnectionOnly
  connections?: ConnectionOnly[]
}

export function connectorPath (slug: string): string {
  return `/connectors/${slug}`
}

export function publicConnectorPath (slug: string): string {
  return `/platform/connectors/${slug}`
}

export async function listConnectors (config: AuthorizedConfig): Promise<Connector[]> {
  const {
    connectors
  } = await request(config, {
    path: '/connectors'
  })

  return connectors as Connector[]
}

export async function listConnectorsPublic (config: IKitConfig): Promise<PublicConnector[]> {
  const {
    connectors
  } = await request(config, {
    path: '/platform/connectors'
  })

  return connectors as PublicConnector[]
}

export async function getConnector (config: AuthorizedConfig, connectorSlug: string): Promise<Connector> {
  const {
    connector
  } = await request(config, {
    path: connectorPath(connectorSlug)
  })

  return connector as Connector
}

export async function getConnectorPublic (config: IKitConfig, connectorSlug: string): Promise<PublicConnector> {
  const {
    connector
  } = await request(config, {
    path: publicConnectorPath(connectorSlug)
  })

  return connector as PublicConnector
}
