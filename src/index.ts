import { IKitConfig } from './config'
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
import { getPlatform } from './api/platform'

function bindConfig<T>(config: IKitConfig, fn: (...args: unknown[]) => Promise<T>): (...args: unknown[]) => Promise<T> {
  return async function (...args: unknown[]): Promise<T> {
    try {
      const res = await fn(config, ...args)
      return res
    } catch (e) {
      if (e.statusCode === 401) {
        try {
          const newToken = await getAccessToken({ domain: config.domain })
          config.token = newToken
        } catch (e) {
          console.error(`Encoutered error while refreshing access: ${e.message}`)
          try {
            const { login_redirect_url } = await getPlatform({ domain: config.domain })
            if (!login_redirect_url) {
              throw new Error("Unable to load redirect url")
            }
            window.location.href = login_redirect_url
          } catch (e) {
            throw new Error('Misconfigured site: unable to retrieve login redirect location')
          }
          return
        }

        const res = await fn(config, ...args)
        return res
      }
      throw e
    }
  }
}

export interface XkitJs {
  domain: string,
  url: string,
  connectorUrl: (slug: string) => string,
  getAccessToken: () => Promise<string>,
  getConnection: (slug: string) => Promise<Connection>,
  getConnectionOrConnector: (slug: string) => Promise<ConnectionShell>,
  getConnectionToken: (slug: string) => Promise<string | null>,
  logout: () => Promise<void>
  login: (token: string) => Promise<void>
}

function xkit(domain: string): XkitJs {
  const config: IKitConfig = { domain }

  return {
    domain,
    url: `${window.location.protocol}//${domain}`,
    connectorUrl: (slug: string) => `${window.location.protocol}//${config.domain}${connectorPath(slug)}`,
    getAccessToken: bindConfig(config, getAccessToken),
    getConnection: bindConfig(config, getConnection),
    getConnectionOrConnector: bindConfig(config, getConnectionOrConnector),
    getConnectionToken: bindConfig(config, getConnectionToken),
    logout: async (): Promise<void> => {
      await logout(config)
      config.token = undefined
    },
    login: async (token: string): Promise<void> => {
      await login(config, token)
      config.token = token
    }
  }
}

export default xkit
