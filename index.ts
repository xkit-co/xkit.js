import { AuthorizedConfig } from './lib/config'
import { login, getAccessToken, logout } from './lib/api/session'
import {
  getConnection,
  getConnectionOrConnector,
  getConnectionToken
} from './lib/api/connection'
import { connectorPath } from './lib/api/connector'
import { getPlatform } from './lib/api/platform'

function bindConfig(config: IKitConfig, fn: Function): Function {
  return async function (...args) {
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
            window.location = login_redirect_url
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

function xkit(domain: string): FunctionMap {
  const config = { domain }

  return {
    url: `${window.location.protocol}//${domain}`,
    connectorUrl: (slug: string) => `${window.location.protocol}//${config.domain}${connectorPath(slug)}`,
    getAccessToken: bindConfig(config, getAccessToken),
    logout: bindConfig(config, logout),
    getConnection: bindConfig(config, getConnection),
    getConnectionOrConnector: bindConfig(config, getConnectionOrConnector),
    getConnectionToken: bindConfig(config, getConnectionToken),
    login: async (token: string) => {
      await login(config, token)
      config.token = token
    }
  }
}

export default xkit
