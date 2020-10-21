import { AuthorizedConfig } from './config'
import { configGetter } from './config-state'
import { Connector } from './api/connector'
import {
  createConnection,
  getConnection,
  removeConnection as removeAPIConnection,
  Connection
} from './api/connection'
import { createAuthorization } from './api/authorization'
import {
  authorize,
  prepareAuthWindowWithConfig,
  AuthWindow
} from './authorize'
import Emitter from './emitter'

const ENABLE_CONNECTION_EVENT = 'connection:enabled'
const DISABLE_CONNECTION_EVENT = 'connection:disabled'

async function updateConnection(config: AuthorizedConfig, connection: Connection): Promise<Connection> {
  const newConnection = await getConnection(config, connection.connector.slug)
  return newConnection
}

async function connectWithoutWindow (config: AuthorizedConfig, emitter: Emitter, authWindow: AuthWindow, connector: Connector | string): Promise<Connection> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await createConnection(config, slug)
  const authorization = await authorize(config, authWindow, connection.authorization)
  const newConnection = await updateConnection(config, connection)
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

async function reconnectWithoutWindow (config: AuthorizedConfig, emitter: Emitter, authWindow: AuthWindow, connection: Connection): Promise<Connection> {
  const oldAuthorization = connection.authorization
  if (!oldAuthorization) {
    const newConnection = await connectWithoutWindow(config, emitter, authWindow, connection.connector)
    return newConnection
  }

  const authorization = await createAuthorization(config, oldAuthorization.authorizer.prototype.slug)
  const newAuthorization = await authorize(config, authWindow, authorization)
  const newConnection = await updateConnection(config, connection)
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

export async function connect (callWithConfig: configGetter, emitter: Emitter, connector: Connector | string): Promise<Connection> {
  const connection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return callWithConfig(config => connectWithoutWindow(config, emitter, authWindow, connector))
  })

  return connection
}

export async function reconnect (callWithConfig: configGetter, emitter: Emitter, connection: Connection): Promise<Connection> {
  const newConnection = await prepareAuthWindowWithConfig(callWithConfig, authWindow => {
    return callWithConfig(config => reconnectWithoutWindow(config, emitter, authWindow, connection))
  })

  return newConnection
}

export async function removeConnection(config: AuthorizedConfig, emitter: Emitter, connectorSlug: string): Promise<void> {
  await removeAPIConnection(config, connectorSlug)
  emitter.emit(DISABLE_CONNECTION_EVENT, connectorSlug)
}
