import StateManager, { TokenCallback } from './config-state'
import { UnknownJSON } from './api/request'
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
  listConnectorsPublic,
  getConnector,
  getConnectorPublic
} from './api/connector'
import { setAuthorizationFields, Authorization } from './api/authorization'
import {
  connect,
  reconnect,
  disconnect,
  addConnection,
  removeConnection
} from './connect'
import { Platform, getPlatformPublic } from './api/platform'
import Emitter from './emitter'
import { deprecate } from './util'

type XkitEvents = 'connection:enable' | 'connection:disable' | 'config:update'

export interface XkitJs {
  domain: string
  url: string
  connectorUrl: (slug: string) => string
  ready: (fn: Function) => void
  /** @deprecated Use `on("config:update", ...)` instead. */
  onUpdate: (fn: Function) => Function
  logout: () => Promise<void>
  login: (
    tokenOrFunc: string | TokenCallback,
    tokenCallback?: TokenCallback
  ) => Promise<void>
  getAccessToken: () => Promise<string>
  getPlatform: () => Promise<Platform>
  listConnectors: () => Promise<Connector[]>
  getConnector: (slug: string) => Promise<Connector>
  listConnections: (slug?: string) => Promise<Connection[]>
  getConnection: (query: LegacyConnectionQuery) => Promise<Connection>
  getConnectionOrConnector: (slug: string) => Promise<ConnectionShell>
  getConnectionToken: (query: LegacyConnectionQuery) => Promise<string | null>
  connect: (connector: Connector | string) => Promise<Connection>
  reconnect: (connection: Connection) => Promise<Connection>
  disconnect: (connector: Connector | string) => Promise<void>
  addConnection: (
    connector: Connector | string,
    id?: string
  ) => Promise<Connection>
  removeConnection: (query: LegacyConnectionQuery) => Promise<void>
  /** @deprecated Use `setAuthorizationFields(...)` instead. */
  setAuthorizationField: (
    slug: string,
    state: string,
    params: UnknownJSON
  ) => Promise<Authorization>
  setAuthorizationFields: (
    slug: string,
    state: string,
    params: UnknownJSON
  ) => Promise<Authorization>
  on: (type: XkitEvents, fn: (payload: unknown) => void) => void
  off: (type: XkitEvents, fn: (payload: unknown) => void) => void
}

function xkit(domain: string): XkitJs {
  const emitter = new Emitter()
  const configState = new StateManager({ domain }, emitter)

  // Need explicit assignment because TypeScript can't handle it.
  const onUpdate: (this: any, ...args: any[]) => Function = configState.onUpdate

  return {
    domain,
    url: `https://${domain}`,
    connectorUrl: (slug: string) =>
      `https://${configState.getState().domain}${connectorPath(slug)}`,
    ready: (fn: Function): void => fn(),
    onUpdate: deprecate(
      onUpdate,
      'xkit.onUpdate',
      'xkit.on("config:update", ...)'
    ),
    logout: configState.logout,
    login: configState.login,
    getAccessToken: configState.retrieveToken,
    getPlatform: configState.curryWithConfig(
      getPlatformPublic,
      getPlatformPublic
    ),
    listConnectors: configState.curryWithConfig(
      listConnectors,
      listConnectorsPublic
    ),
    getConnector: configState.curryWithConfig(getConnector, getConnectorPublic),
    listConnections: configState.curryWithConfig(listConnections),
    getConnection: configState.curryWithConfig(getConnection),
    getConnectionOrConnector: configState.curryWithConfig(
      getConnectionOrConnector,
      getConnectionPublic
    ),
    getConnectionToken: configState.curryWithConfig(getConnectionToken),
    connect: connect.bind(
      null,
      emitter,
      configState.callWithConfig,
      configState.createSocket
    ),
    reconnect: reconnect.bind(
      null,
      emitter,
      configState.callWithConfig,
      configState.createSocket
    ),
    disconnect: configState.curryWithConfig(disconnect.bind(null, emitter)),
    addConnection: addConnection.bind(
      null,
      emitter,
      configState.callWithConfig,
      configState.createSocket
    ),
    removeConnection: configState.curryWithConfig(
      removeConnection.bind(null, emitter)
    ),
    setAuthorizationField: deprecate(
      configState.curryWithConfig(setAuthorizationFields),
      'xkit.setAuthorizationField',
      'xkit.setAuthorizationFields(...)'
    ),
    setAuthorizationFields: configState.curryWithConfig(setAuthorizationFields),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  }
}

export default xkit
