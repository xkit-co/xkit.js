import { IKitConfig, AuthorizedConfig } from './config'
import { CallWithConfig } from './config-state'
import {
  getAuthorization,
  Authorization,
  AuthorizationStatus,
  isComplete,
  subscribeToStatus,
  loadingPath
} from './api/authorization'
import { getOneTimeToken } from './api/session'
import {
  onWindowClose,
  captureMessages,
  hasOwnProperty,
  logger
} from './util'
import Emitter from './emitter'

// TODO: keep this in sync with loading.html
const POPUP_READY_MESSAGE = 'authWindow:ready'

interface AuthorizationToBeSetup extends Required<Omit<Authorization, 'access_token' | 'status'>> {
  status: AuthorizationStatus.awaiting_callback
}

interface ErrorMessage {
  error: string
}

class AuthorizationError extends Error {
  code?: string

  constructor (message: string, code?: string) {
    super(message)
    this.code = code
  }
}

function isMessageError (msg: unknown): msg is ErrorMessage {
  if (typeof msg === 'object' &&
      msg !== null &&
      hasOwnProperty(msg, 'error')) {
    return typeof msg.error === 'string'
  }

  return false
}

export interface AuthWindow {
  errors: ErrorMessage[]
  ref: Window
  ready: () => Promise<void>
}

type AuthWindowCallback<T> = (authWindow: AuthWindow) => Promise<T>

type Screen = { height: number, width: number } | undefined
const SCREEN: Screen = typeof window !== 'undefined' ? window.screen : undefined

const AUTH_POP_WIDTH_PX = 625
const AUTH_POP_HEIGHT_PX = 700
const AUTH_POP_PARAMS: string = Object.entries({
  scrollbars: 'no',
  resizable: 'no',
  status: 'no',
  location: 'no',
  menubar: 'no',
  width: AUTH_POP_WIDTH_PX,
  height: AUTH_POP_HEIGHT_PX,
  // Center the auth popup window on user's screen
  left: (SCREEN?.width != null) ? SCREEN.width / 2 - AUTH_POP_WIDTH_PX / 2 : 0,
  top: (SCREEN?.height != null) ? SCREEN.height / 2 - AUTH_POP_HEIGHT_PX / 2 : 0
}).reduce((paramStr: string, [key, val]: [string, string | number]) => `${paramStr},${key}=${val}`, '')

function windowName (): string {
  return 'ikit:authorization'
}

function popupHost (config: IKitConfig): string {
  return `https://${config.domain}`
}

function popupOrigin (config: IKitConfig): string {
  return new URL(popupHost(config)).origin
}

function loadingURL (config: IKitConfig, authorization?: Authorization, token?: string): string {
  const params: Record<string, string> = { opener_origin: window.location.origin }
  if (token != null && token !== '') {
    params.token = token
  }
  const queryString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')

  return `${popupHost(config)}${loadingPath(authorization)}?${queryString}`
}

// Since Electron doesn't give us access to the child window, we
// wait for confirmation that it has loaded before attempting to
// send it a message.
function monitorAuthWindowReady (config: IKitConfig): () => Promise<void> {
  let authWindowReady = false
  const waiters: Function[] = []

  const listener = (event: MessageEvent): void => {
    if (event.origin === popupOrigin(config) && event.data === POPUP_READY_MESSAGE) {
      authWindowReady = true
      waiters.forEach(fn => fn())
      window.removeEventListener('message', listener)
    }
  }

  window.addEventListener('message', listener)

  return async function (): Promise<void> {
    return await new Promise((resolve) => {
      if (authWindowReady) {
        resolve()
        return
      }
      waiters.push(resolve)
    })
  }
}

function isAuthorizationReadyForSetup (auth: Authorization): auth is AuthorizationToBeSetup {
  return auth.status === AuthorizationStatus.awaiting_callback && Boolean(auth.authorize_url)
}

async function replaceAuthWindowURL (config: IKitConfig, authWindow: AuthWindow, url: string): Promise<AuthWindow> {
  if (authWindow.ref == null || authWindow.ref.closed) {
    throw new AuthorizationError('Installation cancelled.')
  }

  // Wait every time time so we can be sure we're e.g. logged in
  await authWindow.ready()
  // Reset our monitor for the next time
  authWindow.ready = monitorAuthWindowReady(config)

  try {
    authWindow.ref.location.replace(url)
  } catch (e) {
    // Electron doesn't support updating it directly, so we send a message to the window
    authWindow.ref.postMessage({ location: url }, popupOrigin(config))
  }

  return authWindow
}

async function onAuthWindowClose (authWindow: AuthWindow): Promise<void> {
  await onWindowClose(authWindow.ref)

  if (authWindow.errors.length > 0) {
    throw new AuthorizationError(authWindow.errors[0].error)
  }
}

export async function prepareAuthWindow<T> (config: IKitConfig, authWindowCallback: AuthWindowCallback<T>): Promise<T> {
  if (config.token == null || config.token === '') {
    throw new AuthorizationError('Unauthorized.')
  }

  const errors = captureMessages<ErrorMessage>(popupHost(config), isMessageError)
  const ready = monitorAuthWindowReady(config)

  // don't open the window until our monitors above are set up,
  // otherwise we may not receive the messages we need
  const ref = window.open(loadingURL(config), windowName(), AUTH_POP_PARAMS)
  if (ref == null) {
    throw new AuthorizationError('Failed to open the authorization window.')
  }

  try {
    const ret = await authWindowCallback({ ref, errors, ready })
    return ret
  } finally {
    if (!ref.closed) {
      ref.close()
    }
  }
}

export async function prepareAuthWindowWithConfig<T> (callWithConfig: CallWithConfig, callback: AuthWindowCallback<T>): Promise<T> {
  return await callWithConfig(async (config) => await prepareAuthWindow(config, callback))
}

async function loadAuthWindow (callWithConfig: CallWithConfig, authWindow: AuthWindow, authorization: Authorization): Promise<void> {
  if (!isAuthorizationReadyForSetup(authorization)) {
    throw new AuthorizationError('Authorization is not in a state to be setup.')
  }

  callWithConfig(async config => await replaceAuthWindowURL(config, authWindow, authorization.authorize_url))
    .catch((e) => logger.error(`Not able to replace Auth Window URL: ${e.message as string}`))

  await onAuthWindowClose(authWindow)

  const newAuthorization = await callWithConfig(async config => await updateAuthorization(config, authorization))

  if (newAuthorization.status === AuthorizationStatus.awaiting_callback) {
    throw new AuthorizationError('Installation cancelled.')
  }
}

async function updateAuthorization (config: AuthorizedConfig, authorization: Authorization): Promise<Authorization> {
  const newAuthorization = await getAuthorization(config, authorization.authorizer.prototype.slug, authorization.id)

  if (newAuthorization.status === AuthorizationStatus.error) {
    throw new AuthorizationError(newAuthorization.error_message ?? 'Installation failed.', newAuthorization.error_code)
  }

  return newAuthorization
}

// TODO: make this concurrent with loading the connection?
async function loginToAuthWindow (callWithConfig: CallWithConfig, authWindow: AuthWindow, authorization: Authorization): Promise<AuthWindow> {
  const oneTimeToken = await callWithConfig(getOneTimeToken)
  return await callWithConfig(async config => {
    const url = loadingURL(config, authorization, oneTimeToken)
    return await replaceAuthWindowURL(config, authWindow, url)
  })
}

export async function authorize (callWithConfig: CallWithConfig, authWindow: AuthWindow, authorization: Authorization): Promise<Authorization> {
  return await new Promise((resolve, reject) => {
    loginToAuthWindow(callWithConfig, authWindow, authorization)
      .then(async () => await callWithConfig(async config => await subscribeToStatus(config, authorization.id)))
      .then(([emitter, status]: [Emitter, AuthorizationStatus]) => {
        if (isComplete(status)) {
          callWithConfig(async config => await updateAuthorization(config, authorization)).then(resolve).catch(reject)
          return
        }

        authorization.status = status

        emitter.on<{status: AuthorizationStatus}>('status_update', ({ status }) => {
          logger.debug('received status update', status)
          if (isComplete(status)) {
            callWithConfig(async config => await updateAuthorization(config, authorization)).then(resolve).catch(reject)
            emitter.removeAllListeners()
          }
        })
        emitter.on<{error: Error | string}>('error', ({ error }) => {
          logger.debug('Emitter received an error', error)
          reject(error instanceof Error ? error : new AuthorizationError(error))
          emitter.removeAllListeners()
        })
        emitter.on('close', () => {
          logger.debug('Emitter closed')
          reject(new AuthorizationError('Installation failed. Network error.'))
          emitter.removeAllListeners()
        })

        if (status === AuthorizationStatus.awaiting_callback) {
          loadAuthWindow(callWithConfig, authWindow, authorization).catch(reject)
        }
      })
      .catch(reject)
  })
}
