import { v4 as uuidv4 } from 'uuid'
import { AuthorizedConfig } from './config'
import { CallWithConfig, CreateSocket } from './config-state'
import { Connector } from './api/connector'
import {
  createConnection,
  getConnection,
  removeConnection as removeAPIConnection,
  Connection,
  LegacyConnectionQuery
} from './api/connection'
import { authorize, prepareAuthWindowWithConfig, AuthWindow } from './authorize'
import Emitter, {
  ENABLE_CONNECTION_EVENT,
  DISABLE_CONNECTION_EVENT,
  REMOVE_CONNECTION_EVENT
} from './emitter'

async function updateConnection(
  config: AuthorizedConfig,
  connection: Connection
): Promise<Connection> {
  const newConnection = await getConnection(config, { id: connection.id })
  return newConnection
}

async function connectWithoutWindow(
  emitter: Emitter,
  callWithConfig: CallWithConfig,
  createSocket: CreateSocket,
  authWindow: AuthWindow,
  connector: Connector | string,
  id?: string
): Promise<Connection> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await callWithConfig(
    async (config) => await createConnection(config, slug, id)
  )
  if (connection.authorization == null)
    throw new Error('Authorization missing.')
  await authorize(
    callWithConfig,
    createSocket,
    authWindow,
    connection.authorization
  )
  const newConnection = await callWithConfig(
    async (config) => await updateConnection(config, connection)
  )
  emitter.emit(ENABLE_CONNECTION_EVENT, newConnection)
  return newConnection
}

export async function connect(
  emitter: Emitter,
  callWithConfig: CallWithConfig,
  createSocket: CreateSocket,
  connector: Connector | string
): Promise<Connection> {
  const connection = await prepareAuthWindowWithConfig(
    callWithConfig,
    async (authWindow) => {
      return await connectWithoutWindow(
        emitter,
        callWithConfig,
        createSocket,
        authWindow,
        connector
      )
    }
  )

  return connection
}

export async function disconnect(
  emitter: Emitter,
  config: AuthorizedConfig,
  connector: Connector | string
): Promise<void> {
  const slug = typeof connector === 'string' ? connector : connector.slug
  const connection = await removeAPIConnection(config, { slug })
  emitter.emit(DISABLE_CONNECTION_EVENT, connection.connector.slug)
  emitter.emit(REMOVE_CONNECTION_EVENT, connection)
}

export async function reconnect(
  emitter: Emitter,
  callWithConfig: CallWithConfig,
  createSocket: CreateSocket,
  connection: Connection
): Promise<Connection> {
  const newConnection = await prepareAuthWindowWithConfig(
    callWithConfig,
    async (authWindow) => {
      return await connectWithoutWindow(
        emitter,
        callWithConfig,
        createSocket,
        authWindow,
        connection.connector,
        connection.id
      )
    }
  )

  return newConnection
}

export async function addConnection(
  emitter: Emitter,
  callWithConfig: CallWithConfig,
  createSocket: CreateSocket,
  connector: Connector | string,
  id?: string
): Promise<Connection> {
  const connectionId = typeof id === 'string' ? id : uuidv4()
  const connection = await prepareAuthWindowWithConfig(
    callWithConfig,
    async (authWindow) => {
      return await connectWithoutWindow(
        emitter,
        callWithConfig,
        createSocket,
        authWindow,
        connector,
        connectionId
      )
    }
  )

  return connection
}

export async function removeConnection(
  emitter: Emitter,
  config: AuthorizedConfig,
  query: LegacyConnectionQuery
): Promise<void> {
  const connection = await removeAPIConnection(config, query)
  emitter.emit(DISABLE_CONNECTION_EVENT, connection.connector.slug)
  emitter.emit(REMOVE_CONNECTION_EVENT, connection)
}
