import { IKitConfig, AuthorizedConfig } from './config'
import { getPlatform } from './api/platform'
import {
  login,
  logout,
  getAccessToken
} from './api/session'
import Emitter from './emitter'

interface InitialConfigState extends IKitConfig {
  loginRedirect?: string
}

export interface ConfigState extends InitialConfigState {
  retrievingToken?: Promise<string>,
  loading: boolean
}

export type configGetter = <T>(fn: (config: AuthorizedConfig) => Promise<T>) => Promise<T>

class StateManager {
  private state: ConfigState
  emitter: Emitter

  constructor (initialState: InitialConfigState) {
    this.state = {
      ...initialState,
      loading: true
    }

    this.emitter = new Emitter()
    this.emitter.on('update', ({ domain }: Partial<ConfigState>) => {
      if (domain) {
        this.initializeConfig()
      }
    })
  }

  setState = (newState: Partial<ConfigState>): void => {
    Object.assign(this.state, newState)
    this.emitter.emit('update', newState)
  }

  getState = (): ConfigState => {
    return Object.assign({}, this.state)
  }

  curryWithConfig = <T>(fn: (config: AuthorizedConfig, ...args: unknown[]) => Promise<T>): ((...args: unknown[]) => Promise<T>) => {
    return function (...args: unknown[]): Promise<T> {
      return this.callWithConfig((config: AuthorizedConfig) => fn(config, ...args))
    }
  }

  callWithConfig: configGetter = async <T>(fn: (config: AuthorizedConfig) => Promise<T>): Promise<T> => {
    const {
      token,
      domain,
      loginRedirect
    } = this.getState()

    try {
      const res = await fn({ domain, token })
      return res
    } catch (e) {
      if (e.statusCode === 401 || e.message.toLowerCase() === 'unauthorized') {
        try {
          const newToken = await this.retrieveToken()
        } catch (e) {
          await this.redirect(e)
          return
        }

        const newState = this.getState()
        const res = await fn({ domain: newState.domain, token: newState.token })
        return res
      }
      throw e
    }
  }

  redirect = async (e: Error | undefined): Promise<void> => {
    console.error(`Encoutered error while refreshing access: ${e ? e.message : 'undefined'}`)

    const { loginRedirect } = this.getState()
    if (!loginRedirect) {
      console.error('Misconfigured site: unable to retrieve login redirect location')
      throw new Error('We encountered an unexpected error. Please report this issue.')
    }
    window.location.href = loginRedirect
    // never release from this function so that the page redirects
    // without doing anything else
    await new Promise(() => {})
  }

  login = async (token: string): Promise<void> => {
    const { domain } = this.getState()
    this.setState({
      loading: true
    })
    try {
      await login({ domain }, token)
      this.setState({ token })
    } catch (e) {
      if (e.statusCode === 401) {
        // token is expired, throw it away and
        // try to refresh
        await this.retrieveToken()
      } else {
        console.warn(e)
      }
    } finally {
      this.setState({ loading: false })
    }
  }

  logout = async (): Promise<void> => {
    const { domain } = this.getState()
    await logout({ domain })
    this.setState({ token: undefined })
  }

  // consolidate requests for a new token
  retrieveToken = async (): Promise<string> => {
    const {
      retrievingToken,
      domain
    } = this.getState()

    if (retrievingToken) {
      const token = await retrievingToken
      return token
    }

    const tokenPromise = getAccessToken({ domain })
    this.setState({ retrievingToken: tokenPromise })

    const token = await tokenPromise
    this.setState({ token })
    return token
  }

  private async initializeConfig (): Promise<void> {
    this.setLoginRedirect()
    const { token } = this.getState()
    if (token) {
      this.login(token)
    } else {
      try {
        this.setState({ loading: true })
        await this.retrieveToken()
      } finally {
        this.setState({ loading: false })
      }
    }
  }

  private async setLoginRedirect (): Promise<void> {
    try {
      const { domain } = this.getState()
      const { login_redirect_url } = await getPlatform({ domain })
      if (!login_redirect_url) {
        console.warn("Unable to retreive login redirect URL")
      } else {
        this.setState({ loginRedirect: login_redirect_url })
      }
    } catch (e) {
      console.warn(`Unable to retreive login redirect URL: ${e.message}`)
    }
  }
}

export default StateManager
