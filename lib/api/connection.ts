import { AuthorizedConfig } from '../config'
import { request, IKitAPIError } from './request'
import { Connector, getConnector } from './connector'
import { Authorization } from './authorization'

export interface Connection {
  enabled: boolean,
  connector: Connector,
  authorization?: Authorization
}

export interface ConnectionShell {
  connector: Connector
}

export async function getConnection(config: AuthorizedConfig, connectorSlug: string): Promise<Connection> {
  const {
    connection
  } = await request(config, {
    path: `/connections/${connectorSlug}`
  })

  return connection as Connection
}

export async function getConnectionOrConnector(config: AuthorizedConfig, connectorSlug: string): Promise<Connection | ConnectionShell> {
  try {
    const connection = await getConnection(config, connectorSlug)
    return connection
  } catch (e) {
    if (e instanceof IKitAPIError && (e.statusCode === 404 || e.statusCode === 401)) {
      const connector = await getConnector(config, connectorSlug)
      return { connector }
    }
    throw e
  }
}

export async function createConnection(config: AuthorizedConfig, connectorSlug: string): Promise<Connection> {
  const {
    connection
  } = await request(config, {
    path: `/connections/${connectorSlug}`,
    method: 'POST'
  })

  return connection as Connection
}

export async function removeConnection(config: AuthorizedConfig, connectorSlug: string): Promise<void> {
  await request(config, {
    path: `/connections/${connectorSlug}`,
    method: 'DELETE'
  })
}
