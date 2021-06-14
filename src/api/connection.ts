import { AuthorizedConfig, IKitConfig } from '../config'
import { request, IKitAPIError } from './request'
import { Connector, getConnector, getConnectorPublic } from './connector'
import { Authorization, AuthorizationStatus } from './authorization'
import {
  hasOwnProperty,
  logger
} from '../util'

interface IdQuery { id: string }
interface SlugQuery { slug: string }
type ConnectionQuery = IdQuery | SlugQuery
export type LegacyConnectionQuery = string | ConnectionQuery

export interface ConnectionOnly {
  id: string
  enabled: boolean
  authorization?: Authorization
}

export interface Connection extends ConnectionOnly {
  connector: Connector
}

export interface ConnectionShell {
  connector: Connector
}

export enum ConnectionStatus {
  NotInstalled,
  Error,
  Connected
}

function isIdQuery (query: ConnectionQuery): query is IdQuery {
  return typeof query === 'object' && hasOwnProperty(query, 'id')
}

function isSlugQuery (query: ConnectionQuery): query is SlugQuery {
  return typeof query === 'object' && hasOwnProperty(query, 'slug')
}

function isLegacySlugQuery (query: LegacyConnectionQuery): query is string {
  return typeof query === 'string'
}

function convertLegacyQuery (query: LegacyConnectionQuery): ConnectionQuery {
  if (isLegacySlugQuery(query)) {
    logger.warn('Specifying a connection by its connector slug (e.g. "github") is deprecated. Use an object instead (e.g. `{ slug: "github" }`')
    return { slug: query }
  }

  return query
}

export function isConnection (conn: ConnectionOnly | ConnectionShell | undefined): conn is Connection {
  return conn != null && hasOwnProperty(conn, 'enabled') && conn.enabled != null
}

function connectionPath (legacyQuery: LegacyConnectionQuery): string {
  const query = convertLegacyQuery(legacyQuery)

  if (isSlugQuery(query)) {
    return `/connections/${query.slug}`
  }

  if (isIdQuery(query)) {
    return `/connection/${query.id}`
  }

  /* eslint-disable  @typescript-eslint/restrict-template-expressions */
  throw new Error(`Unknown query type for connection: ${query}`)
}

export function connectionStatus (conn: ConnectionOnly | ConnectionShell | undefined): ConnectionStatus {
  if (!isConnection(conn)) {
    return ConnectionStatus.NotInstalled
  }

  if (!conn.enabled) {
    return ConnectionStatus.NotInstalled
  }

  const { authorization } = conn
  if (authorization != null && authorization.status !== AuthorizationStatus.error) {
    return ConnectionStatus.Connected
  }

  return ConnectionStatus.Error
}

export async function getConnection (config: AuthorizedConfig, legacyQuery: LegacyConnectionQuery): Promise<Connection> {
  const {
    connection
  } = await request(config, {
    path: connectionPath(legacyQuery)
  })

  return connection as Connection
}

export async function getConnectionOrConnector (config: AuthorizedConfig, connectorSlug: string): Promise<Connection | ConnectionShell> {
  try {
    const connection = await getConnection(config, { slug: connectorSlug })
    return connection
  } catch (e) {
    if (e instanceof IKitAPIError && e.statusCode === 404) {
      const connector = await getConnector(config, connectorSlug)
      return { connector }
    }
    throw e
  }
}

export async function getConnectionPublic (config: IKitConfig, connectorSlug: string): Promise<ConnectionShell> {
  const connector = await getConnectorPublic(config, connectorSlug)
  return { connector }
}

export async function getConnectionToken (config: AuthorizedConfig, legacyQuery: LegacyConnectionQuery): Promise<string | null> {
  try {
    const connection = await getConnection(config, legacyQuery)
    if (connection.enabled && connection?.authorization?.access_token != null) {
      return connection.authorization.access_token
    }
  } catch (e) {
    if (!(e instanceof IKitAPIError && e.statusCode === 404)) {
      throw e
    }
  }
  return null
}

export async function createConnection (config: AuthorizedConfig, connectorSlug: string, connectionId?: string): Promise<Connection> {
  const {
    connection
  } = await request(config, {
    path: `/connections/${connectorSlug}`,
    method: 'POST',
    body: {
      id: connectionId
    }
  })

  return connection as Connection
}

export async function removeConnection (config: AuthorizedConfig, legacyQuery: LegacyConnectionQuery): Promise<Connection> {
  const {
    connection
  } = await request(config, {
    path: connectionPath(legacyQuery),
    method: 'DELETE'
  })

  return connection as Connection
}

export async function listConnections (config: AuthorizedConfig, connectorSlug?: string): Promise<Connection[]> {
  const path = connectorSlug != null ? `/connections?slug=${encodeURIComponent(connectorSlug)}` : '/connections'

  const {
    connections
  } = await request(config, {
    path,
    method: 'GET'
  })

  return connections as Connection[]
}
