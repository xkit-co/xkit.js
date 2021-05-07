import { IKitConfig, AuthorizedConfig } from './config'
import { IKitAPIError } from './api/request'
import { getPlatform } from './api/platform'
import {
  login,
  logout,
  getAccessToken
} from './api/session'
import Emitter from './emitter'
import { logger } from './util'

const CONFIG_UPDATE_EVENT = 'config:update'

interface InitialConfigState extends IKitConfig {
  loginRedirect?: string
}

export interface ConfigState extends InitialConfigState {
  retrievingToken?: Promise<string>
  loading: boolean
}

export type configGetter = <T>(fn: (config: AuthorizedConfig) => Promise<T>) => Promise<T>

function isUnauthorized (e: Error): boolean {
  return (e instanceof IKitAPIError && e.statusCode === 401) ||
         e.message.toLowerCase() === 'unauthorized'
}

class StateManager {
  private readonly state: ConfigState
  emitter: Emitter

  constructor (initialState: InitialConfigState, emitter: Emitter) {
    this.state = {
      ...initialState,
      loading: true
    }

    this.emitter = emitter
    this.emitter.on(CONFIG_UPDATE_EVENT, ({ domain }: Partial<ConfigState>) => {
      if (domain) {
        this.initializeConfig()
      }
    })
    if (this.state.domain) {
      this.initializeConfig()
    }
  }

  // DEPRECATED
  onUpdate = (updateFn: Function): Function => {
    const wrappedUpdateFn = (payload: unknown): any => updateFn()
    this.emitter.on(CONFIG_UPDATE_EVENT, wrappedUpdateFn)
    return () => {
      this.emitter.off(CONFIG_UPDATE_EVENT, wrappedUpdateFn)
    }
  }

  setState = (newState: Partial<ConfigState>): void => {
    Object.assign(this.state, newState)
    this.emitter.emit(CONFIG_UPDATE_EVENT, newState)
  }

  getState = (): ConfigState => {
    return Object.assign({}, this.state)
  }

  callWithConfig: configGetter = async <T>(fn: (config: AuthorizedConfig) => Promise<T>, fallbackFn?: (config: IKitConfig) => Promise<T>): Promise<T> => {
    const {
      token,
      domain
    } = this.getState()

    const fallback = async (e: Error): Promise<T> => {
      if (isUnauthorized(e)) {
        if (fallbackFn) {
          const res = await fallbackFn({ domain: this.getState().domain })
          return res
        }
        await this.redirect(e)
      }
      throw e
    }

    try {
      const res = await fn({ domain, token })
      return res
    } catch (e) {
      if (isUnauthorized(e)) {
        try {
          await this.retrieveToken()
        } catch (e) {
          return fallback(e)
        }

        const newState = this.getState()
        try {
          const res = await fn({ domain: newState.domain, token: newState.token })
          return res
        } catch (e) {
          return fallback(e)
        }
      }
      throw e
    }
  }

  curryWithConfig = <T>(fn: (config: AuthorizedConfig, ...args: unknown[]) => Promise<T>, fallbackFn?: (config: IKitConfig, ...args: unknown[]) => Promise<T>): ((...args: unknown[]) => Promise<T>) => {
    const stateManager = this
    return function (...args: unknown[]): Promise<T> {
      const fns = [(config: AuthorizedConfig) => fn(config, ...args)]
      if (fallbackFn) {
        fns.push((config: IKitConfig) => fallbackFn(config, ...args))
      }
      return stateManager.callWithConfig.apply(stateManager, fns)
    }
  }

  redirect = async (e: Error | undefined): Promise<void> => {
    logger.error(`Encoutered error while refreshing access: ${e ? e.message : 'undefined'}`)

    const { loginRedirect } = this.getState()
    if (!loginRedirect) {
      logger.error('Misconfigured site: unable to retrieve login redirect location')
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
      if (isUnauthorized(e)) {
        // token is expired, throw it away and
        // try to refresh
        await this.retrieveToken()
      } else {
        logger.warn(e)
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
    this.setState({
      token,
      // remove the promise, otherwise we'll always resolve
      // to the same token
      retrievingToken: undefined
    })
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
      } catch (e) {
        logger.debug('User is not yet logged into Xkit.', e)
      } finally {
        this.setState({ loading: false })
      }
    }
  }

  private async setLoginRedirect (): Promise<void> {
    try {
      const { domain } = this.getState()
      const { login_redirect_url: loginRedirectUrl } = await getPlatform({ domain })
      if (!loginRedirectUrl) {
        logger.warn('Unable to retreive login redirect URL')
      } else {
        this.setState({ loginRedirect: loginRedirectUrl })
      }
    } catch (e) {
      logger.warn(`Unable to retreive login redirect URL: ${e.message}`)
    }
  }
}

export default StateManager
