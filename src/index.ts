import { IKitConfig } from './config'
import StateManager from './config-state'
import { UnknownJSON } from './api/request'
import { login, getAccessToken, logout } from './api/session'
import {
  Connection,
  ConnectionShell,
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
  setAuthorizationField,
  Authorization
} from './api/authorization'
import {
  connect,
  reconnect,
  removeConnection
} from './connect'
import {
  Platform,
  getPlatform
} from './api/platform'
import Emitter from './emitter'

type XkitEvents = 'connection:enable' | 'connection:disable' | 'config:update'

function deprecate<T>(fn: (...args: unknown[]) => T, name?: string, alternative?: string): (...args: unknown[]) => T {
  return function (...args: unknown[]): T {
    console.warn(`Xkit: ${name || 'this function'} is deprecated.${alternative ? ` Use ${alternative} instead.` : ''}`)
    return fn.call(this, ...args)
  }
}

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
  setAuthorizationField(slug: string, state: string, params: UnknownJSON): Promise<Authorization>,
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
    getConnection: configState.curryWithConfig(getConnection),
    getConnectionOrConnector: configState.curryWithConfig(getConnectionOrConnector, getConnectionPublic),
    getConnectionToken: configState.curryWithConfig(getConnectionToken),
    removeConnection: configState.curryWithConfig(removeConnection.bind(null, emitter)),
    connect: connect.bind(null, emitter, configState.callWithConfig),
    reconnect: reconnect.bind(null, emitter, configState.callWithConfig),
    setAuthorizationField: configState.curryWithConfig(setAuthorizationField),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  }
}

export default xkit
