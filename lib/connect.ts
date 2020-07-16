import { AuthorizedConfig } from './config'
import { Connector } from './api/connector'
import {
  createConnection,
  getConnection,
  Connection
} from './api/connection'
import { createAuthorization } from './api/authorization'
import { authorize, AuthWindow } from './authorize'

async function updateConnection(config: AuthorizedConfig, connection: Connection): Promise<Connection> {
  const newConnection = await getConnection(config, connection.connector.slug)
  return newConnection
}

// return an error?
// handle not logged in - send back to their site
export async function connect (config: AuthorizedConfig, authWindow: AuthWindow, connector: Connector): Promise<Connection> {
  const connection = await createConnection(config, connector.slug)
  const authorization = await authorize(config, authWindow, connection.authorization)
  const newConnection = await updateConnection(config, connection)
  return newConnection
}

export async function reconnect (config: AuthorizedConfig, authWindow: AuthWindow, connection: Connection): Promise<Connection> {
  const oldAuthorization = connection.authorization
  if (!oldAuthorization) {
    const newConnection = await connect(config, authWindow, connection.connector)
    return newConnection
  }

  const authorization = await createAuthorization(config, oldAuthorization.authorizer.prototype.slug)
  const newAuthorization = await authorize(config, authWindow, authorization)
  const newConnection = await updateConnection(config, connection)
  return newConnection
}
