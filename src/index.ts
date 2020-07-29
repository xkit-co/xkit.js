import { IKitConfig } from './config'
import StateManager from './config-state'
import { login, getAccessToken, logout } from './api/session'
import {
  Connection,
  ConnectionShell,
  getConnection,
  getConnectionOrConnector,
  getConnectionToken
} from './api/connection'
import {
  Connector,
  connectorPath
} from './api/connector'
import { connect } from './connect'
import { getPlatform } from './api/platform'

export interface XkitJs {
  domain: string,
  url: string,
  connectorUrl: (slug: string) => string,
  getAccessToken: () => Promise<string>,
  getConnection: (slug: string) => Promise<Connection>,
  getConnectionOrConnector: (slug: string) => Promise<ConnectionShell>,
  getConnectionToken: (slug: string) => Promise<string | null>,
  logout: () => Promise<void>
  login: (token: string) => Promise<void>,
  connect: (connector: Connector) => Promise<Connection>
}

function xkit(domain: string): XkitJs {
  const configState = new StateManager({ domain })

  return {
    domain,
    url: `${window.location.protocol}//${domain}`,
    connectorUrl: (slug: string) => `${window.location.protocol}//${configState.getState().domain}${connectorPath(slug)}`,
    getAccessToken: configState.retrieveToken,
    getConnection: configState.curryWithConfig(getConnection),
    getConnectionOrConnector: configState.curryWithConfig(getConnectionOrConnector),
    getConnectionToken: configState.curryWithConfig(getConnectionToken),
    logout: configState.logout,
    login: configState.login,
    connect: connect.bind(null, configState.callWithConfig)
  }
}

export default xkit
