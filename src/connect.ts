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
import { createAuthorization } from './api/authorization'
import {
  authorize,
  prepareAuthWindowWithConfig,
  AuthWindow
} from './authorize'
import Emitter from './emitter'

const ENABLE_CONNECTION_EVENT = 'connection:enable'
const DISABLE_CONNECTION_EVENT = 'connection:disable'

async function updateConnection(config: AuthorizedConfig, connection: Connection): Promise<Connection> {
  const newConnection = await getConnection(config, connection.connector.slug)
  return newConnection
}

async function connectWithoutWindow (emitter: Emitter, callWithConfig: configGetter, authWindow: AuthWindow, connector: Connector | string): Promise<Connection> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await callWithConfig(config => createConnection(config, slug))
  const authorization = await authorize(callWithConfig, authWindow, connection.authorization)
  const newConnection = await callWithConfig(config => updateConnection(config, connection))
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

async function reconnectWithoutWindow (emitter: Emitter, callWithConfig: configGetter, authWindow: AuthWindow, connection: Connection): Promise<Connection> {
  const oldAuthorization = connection.authorization
  if (!oldAuthorization) {
    const newConnection = await connectWithoutWindow(emitter, callWithConfig, authWindow, connection.connector)
    return newConnection
  }

  const authorization = await callWithConfig(config => createAuthorization(config, oldAuthorization.authorizer.prototype.slug))
  const newAuthorization = await authorize(callWithConfig, authWindow, authorization)
  const newConnection = await callWithConfig(config => updateConnection(config, connection))
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

export async function removeConnection(emitter: Emitter, config: AuthorizedConfig, query: LegacyConnectionQuery): Promise<void> {
  await removeAPIConnection(config, query)
  // TODO: the payload that we emit used to always with a string connectorSlug.
  // Now it can be a string or an object depending on the arguments to this function,
  // which could break existing consumers.
  emitter.emit(DISABLE_CONNECTION_EVENT, query)
}

export async function connect (emitter: Emitter, callWithConfig: configGetter, connector: Connector | string): Promise<Connection> {
  const connection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return connectWithoutWindow(emitter, callWithConfig, authWindow, connector)
  })

  return connection
}

export async function reconnect (emitter: Emitter, callWithConfig: configGetter, connection: Connection): Promise<Connection> {
  const newConnection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return reconnectWithoutWindow(emitter, callWithConfig, authWindow, connection)
  })

  return newConnection
}
