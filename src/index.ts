import { IKitConfig } from './config'
import StateManager from './config-state'
import { UnknownJSON } from './api/request'
import { login, getAccessToken, logout } from './api/session'
import {
  Connection,
  ConnectionShell,
  LegacyConnectionQuery,
  listConnections,
  getConnection,
  getConnectionOrConnector,
  getConnectionPublic,
  getConnectionToken
} from './api/connection'
import {
  Connector,
  connectorPath,
  listConnectors,
  listConnectorsPublic
} from './api/connector'
import {
  setAuthorizationFields,
  Authorization
} from './api/authorization'
import {
  connect,
  reconnect,
  addConnection,
  removeConnection
} from './connect'
import {
  Platform,
  getPlatform
} from './api/platform'
import Emitter from './emitter'
import { logger, deprecate } from './util'

type XkitEvents = 'connection:enable' | 'connection:disable' | 'config:update'

export interface XkitJs {
  domain: string,
  url: string,
  connectorUrl: (slug: string) => string,
  ready: (fn: Function) => void,
  /** @deprecated Use `on("config:update", ...)` instead. */
  onUpdate: (fn: Function) => Function,
  logout: () => Promise<void>
  login: (token: string) => Promise<void>,
  getAccessToken: () => Promise<string>,
  getPlatform: () => Promise<Platform>,
  listConnectors: () => Promise<Connector[]>,
  listConnections: (slug?: string) => Promise<Connection[]>,
  getConnection: (query: LegacyConnectionQuery) => Promise<Connection>,
  getConnectionOrConnector: (slug: string) => Promise<ConnectionShell>,
  getConnectionToken: (query: LegacyConnectionQuery) => Promise<string | null>,
  removeConnection: (query: LegacyConnectionQuery) => Promise<void>,
  connect: (connector: Connector | string) => Promise<Connection>,
  reconnect: (connection: Connection) => Promise<Connection>,
  addConnection: (connector: Connector | string, id?: string) => Promise<Connection>,
  /** @deprecated Use `setAuthorizationFields(...)` instead. */
  setAuthorizationField(slug: string, state: string, params: UnknownJSON): Promise<Authorization>,
  setAuthorizationFields(slug: string, state: string, params: UnknownJSON): Promise<Authorization>,
  on: (type: XkitEvents, fn: (payload: unknown) => void) => void,
  off: (type: XkitEvents, fn: (payload: unknown) => void) => void
}

function xkit(domain: string): XkitJs {
  const emitter = new Emitter()
  const configState = new StateManager({ domain }, emitter)

  return {
    domain,
    url: `https://${domain}`,
    connectorUrl: (slug: string) => `https://${configState.getState().domain}${connectorPath(slug)}`,
    ready: (fn: Function): void => fn(),
    onUpdate: deprecate(configState.onUpdate, 'xkit.onUpdate', 'xkit.on("config:update", ...)'),
    logout: configState.logout,
    login: configState.login,
    getAccessToken: configState.retrieveToken,
    getPlatform: configState.curryWithConfig(getPlatform),
    listConnectors: configState.curryWithConfig(listConnectors, listConnectorsPublic),
    listConnections: configState.curryWithConfig(listConnections),
    getConnection: configState.curryWithConfig(getConnection),
    getConnectionOrConnector: configState.curryWithConfig(getConnectionOrConnector, getConnectionPublic),
    getConnectionToken: configState.curryWithConfig(getConnectionToken),
    removeConnection: configState.curryWithConfig(removeConnection.bind(null, emitter)),
    connect: connect.bind(null, emitter, configState.callWithConfig),
    reconnect: reconnect.bind(null, emitter, configState.callWithConfig),
    addConnection: addConnection.bind(null, emitter, configState.callWithConfig),
    setAuthorizationField: deprecate(configState.curryWithConfig(setAuthorizationFields), 'xkit.setAuthorizationField', 'xkit.setAuthorizationFields(...)'),
    setAuthorizationFields: configState.curryWithConfig(setAuthorizationFields),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  }
}

export default xkit
