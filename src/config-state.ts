import { IKitConfig, AuthorizedConfig } from './config'
import { IKitAPIError } from './api/request'
import { getPlatformPublic } from './api/platform'
import { createSession, deleteSession, getAccessToken } from './api/session'
import { createSocket, resetSocket, Socket } from './api/socket'
import Emitter from './emitter'
import { logger } from './util'

const CONFIG_UPDATE_EVENT = 'config:update'

interface InitialConfigState extends IKitConfig {
  loginRedirect?: string
}

export interface ConfigState extends InitialConfigState {
  retrievingToken?: Promise<string>
  loading: boolean
  tokenCallback: TokenCallback
}

export type CallWithConfig = <T>(
  fn: (config: AuthorizedConfig) => Promise<T>
) => Promise<T>
export type CreateSocket = () => Promise<Socket>
export type TokenCallback = () => Promise<string>

function isUnauthorized(e: Error): boolean {
  return (
    (e instanceof IKitAPIError && e.statusCode === 401) ||
    e.message.toLowerCase().includes('unauthorized')
  )
}

// User session management.
//
// The class encapsulates the logic of managing the user session. xkit.js contains publicly
// available APIs which can be used to showcase the platform's available connectors so it has
// to be able to work without the user session.
//
// The user session is established by calling login() and passing a JWT obtained by provisioning
// the user via the Platform API or by passing a 3rd-party JWT. Calling login() calls the Xkit
// backend that creates a cookie-based user session and returns a token that is then used
// to make API calls. If the token expires, a new token is retrieved using the cookie-based
// session. If the session expires, the developer-provided callback is invoked. If no callback was
// provided, the user is redirected to the URL configured in the dev portal.
class StateManager {
  private readonly state: ConfigState
  emitter: Emitter
  socket?: Socket

  constructor(initialState: InitialConfigState, emitter: Emitter) {
    this.state = {
      ...initialState,
      loading: true,
      tokenCallback: this.redirect
    }

    this.emitter = emitter
    this.emitter.on(CONFIG_UPDATE_EVENT, ({ domain }: Partial<ConfigState>) => {
      if (domain != null) {
        this.initializeConfig().catch(() =>
          logger.warn('Unable to initialize config')
        )
      }
    })
    if (this.state.domain != null) {
      this.initializeConfig().catch(() =>
        logger.warn('Unable to initialize config')
      )
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

  callWithConfig = async <T>(
    fn: (config: AuthorizedConfig) => Promise<T>,
    fallbackFn?: (config: IKitConfig) => Promise<T>
  ): Promise<T> => {
    const { token, domain, tokenCallback } = this.getState()

    try {
      if (token != null) {
        return await fn({ domain, token })
      }
    } catch (e) {
      if (!isUnauthorized(e)) {
        throw e
      }
    }

    // We didn't have a token or the token has expired.
    // Attempt to fetch a fresh token hoping that the session is still valid.

    try {
      const newToken = await this.retrieveToken()
      return await fn({ domain, token: newToken })
    } catch (e) {
      if (!isUnauthorized(e)) {
        throw e
      }
      logger.error(
        `Encountered error while refreshing access: ${
          e != null ? String(e.message) : 'undefined'
        }`
      )
    }

    // Attempting to refresh the token didn't help.

    if (fallbackFn != null) {
      return await fallbackFn({ domain: this.getState().domain })
    }

    const newToken = await tokenCallback()
    if (newToken == null) {
      throw new Error('Error while retrieving new token, token was undefined.')
    }
    this.setState({ token: newToken })
    return await fn({ domain, token: newToken })
  }

  curryWithConfig = <T>(
    fn: (config: AuthorizedConfig, ...args: any[]) => Promise<T>,
    fallbackFn?: (config: IKitConfig, ...args: any[]) => Promise<T>
  ): ((...args: any[]) => Promise<T>) => {
    return async (...args: any[]): Promise<T> => {
      const curriedFn = async (config: AuthorizedConfig): Promise<T> =>
        await fn(config, ...args)
      const curriedFallbackFn =
        fallbackFn == null
          ? undefined
          : async (config: IKitConfig): Promise<T> =>
              await fallbackFn(config, ...args)
      return await this.callWithConfig(curriedFn, curriedFallbackFn)
    }
  }

  redirect = async (): Promise<never> => {
    const { loginRedirect } = this.getState()
    if (loginRedirect == null) {
      logger.error(
        'Misconfigured site: unable to retrieve login redirect location'
      )
      throw new Error(
        'We encountered an unexpected error. Please report this issue.'
      )
    }
    window.location.href = loginRedirect
    // never release from this function so that the page redirects
    // without doing anything else
    await new Promise(() => {})
    throw new Error('unreachable code')
  }

  login = async (
    tokenOrFunc: string | TokenCallback,
    tokenCallback?: TokenCallback
  ): Promise<void> => {
    const { domain } = this.getState()
    this.setState({ loading: true })

    try {
      let token
      if (typeof tokenOrFunc === 'function') {
        tokenCallback = tokenOrFunc
        token = await tokenOrFunc()
      } else {
        token = tokenOrFunc
      }

      await createSession({ domain }, token)
      this.removeSocket()
      this.setState({ token, tokenCallback: tokenCallback ?? this.redirect })
    } catch (e) {
      logger.warn(e)
    } finally {
      this.setState({ loading: false })
    }
  }

  logout = async (): Promise<void> => {
    const { domain } = this.getState()
    await deleteSession({ domain })
    this.removeSocket()
    this.setState({ token: undefined })
  }

  createSocket = async (): Promise<Socket> => {
    if (this.socket?.isConnected() === true) {
      return this.socket
    }
    this.removeSocket()
    this.socket = await this.callWithConfig(createSocket)
    return this.socket
  }

  removeSocket = (): void => {
    if (this.socket != null) {
      resetSocket(this.socket)
      this.socket = undefined
    }
  }

  // consolidate requests for a new token
  retrieveToken = async (): Promise<string> => {
    const { retrievingToken, domain } = this.getState()

    if (retrievingToken != null) {
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

  private async initializeConfig(): Promise<void> {
    this.setLoginRedirect().catch((e) =>
      logger.debug(`Unable to set Login redirect ${e.message as string}`)
    )
    const { token } = this.getState()
    if (token != null) {
      await this.login(token)
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

  private async setLoginRedirect(): Promise<void> {
    try {
      const { domain } = this.getState()
      const { login_redirect_url: loginRedirectUrl } = await getPlatformPublic({
        domain
      })
      if (loginRedirectUrl !== '' && loginRedirectUrl != null) {
        this.setState({ loginRedirect: loginRedirectUrl })
      } else {
        throw new Error('Returned redirect URL was undefined or blank')
      }
    } catch (e) {
      logger.warn(`Unable to retrieve login redirect URL: ${String(e.message)}`)
    }
  }
}

export default StateManager
