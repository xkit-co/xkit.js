import { IKitConfig } from './config'
import StateManager from './config-state'
import { login, getAccessToken, logout } from './api/session'
import {
  Connection,
  ConnectionShell,
  getConnection,
  getConnectionOrConnector,
  getConnectionPublic,
  getConnectionToken,
  removeConnection
} from './api/connection'
import {
  Connector,
  connectorPath,
  listConnectors,
  listConnectorsPublic
} from './api/connector'
import { connect, reconnect } from './connect'
import {
  Platform,
  getPlatform
} from './api/platform'

export interface XkitJs {
  domain: string,
  url: string,
  connectorUrl: (slug: string) => string,
  ready: (fn: Function) => void,
  onUpdate: (fn: Function) => Function,
  logout: () => Promise<void>
  login: (token: string) => Promise<void>,
  getAccessToken: () => Promise<string>,
  getPlatform: () => Promise<Platform>,
  listConnectors: () => Promise<Connector[]>,
  getConnection: (slug: string) => Promise<Connection>,
  getConnectionOrConnector: (slug: string) => Promise<ConnectionShell>,
  getConnectionToken: (slug: string) => Promise<string | null>,
  removeConnection: (slug: string) => Promise<void>,
  connect: (connector: Connector | string) => Promise<Connection>,
  reconnect: (connection: Connection) => Promise<Connection>
 
}

function xkit(domain: string): XkitJs {
  const configState = new StateManager({ domain })

  return {
    domain,
    url: `${window.location.protocol}//${domain}`,
    connectorUrl: (slug: string) => `${window.location.protocol}//${configState.getState().domain}${connectorPath(slug)}`,
    ready: (fn: Function): void => fn(),
    onUpdate: configState.onUpdate,
    logout: configState.logout,
    login: configState.login,
    getAccessToken: configState.retrieveToken,
    getPlatform: configState.curryWithConfig(getPlatform),
    listConnectors: configState.curryWithConfig(listConnectors, listConnectorsPublic),
    getConnection: configState.curryWithConfig(getConnection),
    getConnectionOrConnector: configState.curryWithConfig(getConnectionOrConnector, getConnectionPublic),
    getConnectionToken: configState.curryWithConfig(getConnectionToken),
    removeConnection: configState.curryWithConfig(removeConnection),
    connect: connect.bind(null, configState.callWithConfig),
    reconnect: reconnect.bind(null, configState.callWithConfig)
  }
}

export default xkit
