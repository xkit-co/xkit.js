import { v4 as uuidv4 } from 'uuid'
import { AuthorizedConfig } from './config'
import { configGetter } from './config-state'
import { Connector } from './api/connector'
import {
  createConnection,
  getConnection,
  removeConnection as removeAPIConnection,
  Connection,
  LegacyConnectionQuery
} from './api/connection'
import {
  authorize,
  prepareAuthWindowWithConfig,
  AuthWindow
} from './authorize'
import Emitter, { ENABLE_CONNECTION_EVENT, DISABLE_CONNECTION_EVENT, REMOVE_CONNECTION_EVENT } from './emitter'

async function updateConnection (config: AuthorizedConfig, connection: Connection): Promise<Connection> {
  const newConnection = await getConnection(config, { id: connection.id })
  return newConnection
}

async function connectWithoutWindow (emitter: Emitter, callWithConfig: configGetter, authWindow: AuthWindow, connector: Connector | string, id?: string): Promise<Connection> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await callWithConfig(config => createConnection(config, slug, id))
  const authorization = await authorize(callWithConfig, authWindow, connection.authorization)
  const newConnection = await callWithConfig(config => updateConnection(config, connection))
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

export async function connect (emitter: Emitter, callWithConfig: configGetter, connector: Connector | string): Promise<Connection> {
  const connection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return connectWithoutWindow(emitter, callWithConfig, authWindow, connector)
  })

  return connection
}

export async function disconnect (emitter: Emitter, config: AuthorizedConfig, connector: Connector | string): Promise<void> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await removeAPIConnection(config, { slug })
  emitter.emit(DISABLE_CONNECTION_EVENT, connection.connector.slug)
  emitter.emit(REMOVE_CONNECTION_EVENT, connection)
}

export async function reconnect (emitter: Emitter, callWithConfig: configGetter, connection: Connection): Promise<Connection> {
  const newConnection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return connectWithoutWindow(emitter, callWithConfig, authWindow, connection.connector, connection.id)
  })

  return newConnection
}

export async function addConnection (emitter: Emitter, callWithConfig: configGetter, connector: Connector | string, id?: string): Promise<Connection> {
  const connectionId = typeof id === 'string' ? id : uuidv4()
  const connection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return connectWithoutWindow(emitter, callWithConfig, authWindow, connector, connectionId)
  })

  return connection
}

export async function removeConnection (emitter: Emitter, config: AuthorizedConfig, query: LegacyConnectionQuery): Promise<void> {
  const connection = await removeAPIConnection(config, query)
  emitter.emit(DISABLE_CONNECTION_EVENT, connection.connector.slug)
  emitter.emit(REMOVE_CONNECTION_EVENT, connection)
}
