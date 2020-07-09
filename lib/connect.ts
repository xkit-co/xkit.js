import { IKitConfig } from './config'
import { Connector } from './api/connector'
import { createConnection, getConnection, Connection } from './api/connection'
import { createAuthorization } from './api/authorization'
import { authorize } from './authorize'

async function updateConnection(config: IKitConfig, connection: Connection): Promise<Connection> {
  const newConnection = await getConnection(config, connection.connector.slug)
  return newConnection
}

// return an error?
// handle not logged in - send back to their site
export async function connect (config: IKitConfig, connector: Connector): Promise<Connection> {
  const connection = await createConnection(config, connector.slug)
  const authorization = await authorize(config, connection.authorization)
  const newConnection = await updateConnection(config, connection)
  return newConnection
}

export async function reconnect (config: IKitConfig, connection: Connection): Promise<Connection> {
  const oldAuthorization = connection.authorization
  if (!oldAuthorization) {
    const newConnection = await connect(config, connection.connector)
    return newConnection
  }
  const authorization = await createAuthorization(config, oldAuthorization.authorizer.prototype.slug)
  const newAuthorization = await authorize(config, authorization)
  const newConnection = await updateConnection(config, connection)
  return newConnection
}
