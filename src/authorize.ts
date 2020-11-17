import { IKitConfig, AuthorizedConfig } from './config'
import { configGetter } from './config-state'
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

const CHECK_POPUP_DELAY_MS = 100
// TODO: keep this in sync with loading.html
const POPUP_READY_MESSAGE = 'authWindow:ready'

interface AuthorizationToBeSetup extends Required<Omit<Authorization, 'access_token' | 'status'>> {
  status: AuthorizationStatus.awaiting_callback
}

interface ErrorMessage {
  error: string
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
  errors: ErrorMessage[],
  ref: Window,
  ready: () => Promise<void>
}

type AuthWindowCallback<T> = (authWindow: AuthWindow) => Promise<T>

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
  left: window.screen ? window.screen.width / 2 - AUTH_POP_WIDTH_PX / 2 : 0,
  top: window.screen ? window.screen.height / 2 - AUTH_POP_HEIGHT_PX / 2 : 0
}).reduce((paramStr: string, [key, val]: [string, string | number]) => `${paramStr},${key}=${val}`, '')

function windowName() {
  return 'ikit:authorization'
}

function popupHost(config: IKitConfig): string {
  return `https://${config.domain}`
}

function popupOrigin(config: IKitConfig): string {
  return new URL(popupHost(config)).origin
}

// Since Electron doesn't give us access to the child window, we
// wait for confirmation that it has loaded before attempting to
// send it a message.
function monitorAuthWindowReady(config: IKitConfig) {
  let authWindowReady = false
  let waiters: Function[] = []

  const listener = (event: MessageEvent) => {
    if (event.origin === popupOrigin(config) && event.data === POPUP_READY_MESSAGE) {
      authWindowReady = true
      waiters.forEach(fn => fn())
      window.removeEventListener('message', listener)
    }
  }

  window.addEventListener('message', listener)

  return function (): Promise<void> {
    return new Promise((resolve) => {
      if (authWindowReady) {
        resolve()
        return
      }
      waiters.push(resolve)
    })
  }
}

function isAuthorizationReadyForSetup(auth: Authorization): auth is AuthorizationToBeSetup {
  return auth.status === AuthorizationStatus.awaiting_callback && Boolean(auth.authorize_url)
}

async function replaceAuthWindowURL(config: IKitConfig, authWindow: AuthWindow, url: string): Promise<AuthWindow> {
  if (!authWindow.ref || authWindow.ref.closed) {
    throw new Error('Cancelled authorization')
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

async function onAuthWindowClose(authWindow: AuthWindow): Promise<void> {
  await onWindowClose(authWindow.ref)

  if (authWindow.errors.length) {
    throw new Error(authWindow.errors[0].error)
  }
}

export async function prepareAuthWindow<T>(config: IKitConfig, callback: AuthWindowCallback<T>): Promise<T> {
  if (!config.token) {
    throw new Error('Unauthorized')
  }

  const errors = captureMessages<ErrorMessage>(popupHost(config), isMessageError)
  const ready = monitorAuthWindowReady(config)

  // don't open the window until our monitors above are set up,
  // otherwise we may not receive the messages we need
  const ref = window.open(
    `${popupHost(config)}${loadingPath()}`,
    windowName(),
    AUTH_POP_PARAMS
  )

  try {
    const ret = await callback({ ref, errors, ready })
    return ret
  } finally {
    if (ref && !ref.closed) {
      ref.close()
    }
  }
}

export function prepareAuthWindowWithConfig<T>(callWithConfig: configGetter, callback: AuthWindowCallback<T>): Promise<T> {
  return callWithConfig((config) => prepareAuthWindow(config, callback))
}

async function loadAuthWindow(callWithConfig: configGetter, authWindow: AuthWindow, authorization: Authorization): Promise<void> {
  if (!isAuthorizationReadyForSetup(authorization)) {
    throw new Error('Authorization is not in a state to be setup.')
  }

  callWithConfig(config => replaceAuthWindowURL(config, authWindow, authorization.authorize_url))

  await onAuthWindowClose(authWindow)

  const newAuthorization = await callWithConfig(config => updateAuthorization(config, authorization))

  if (newAuthorization.status === AuthorizationStatus.awaiting_callback) {
    throw new Error('Cancelled authorization')
  }
}

async function updateAuthorization(config: AuthorizedConfig, authorization: Authorization): Promise<Authorization> {
  const newAuthorization = await getAuthorization(config, authorization.authorizer.prototype.slug, authorization.id)

  if (newAuthorization.status === AuthorizationStatus.error) {
    throw new Error('Encountered an unknown error during authorization')
  }

  return newAuthorization
}

// TODO: make this concurrent with loading the connection?
async function loginToAuthWindow(callWithConfig: configGetter, authWindow: AuthWindow, authorization: Authorization): Promise<AuthWindow> {
  const oneTimeToken = await callWithConfig(getOneTimeToken)
  return callWithConfig(config => {
    const loadingURL = `${popupHost(config)}${loadingPath(authorization)}?token=${oneTimeToken}`
    return replaceAuthWindowURL(config, authWindow, loadingURL)
  })
}

export function authorize(callWithConfig: configGetter, authWindow: AuthWindow, authorization: Authorization): Promise<Authorization> {
  return new Promise((resolve, reject) => {
    loginToAuthWindow(callWithConfig, authWindow, authorization)
      .then(() => callWithConfig(config => subscribeToStatus(config, authorization.id)))
      .then(([emitter, status]: [Emitter, AuthorizationStatus]) => {
        if (isComplete(status)) {
          callWithConfig(config => updateAuthorization(config, authorization)).then(resolve).catch(reject)
          return
        }

        authorization.status = status

        emitter.on('status_update', ({ status }) => {
          logger.debug('received status update', status)
          if (isComplete(status)) {
            callWithConfig(config => updateAuthorization(config, authorization)).then(resolve).catch(reject)
            emitter.removeAllListeners()
          }
        })
        emitter.on('error', ({ error }) => {
          logger.debug(`Emitter received an error`, error)
          reject(error instanceof Error ? error : new Error(error))
          emitter.removeAllListeners()
        })
        emitter.on('close', () => {
          logger.debug(`Emitter closed`)
          reject(new Error('Subscriber closed unexpectedly'))
          emitter.removeAllListeners()
        })

        if (status === AuthorizationStatus.awaiting_callback) {
          loadAuthWindow(callWithConfig, authWindow, authorization).catch(reject)
        }
      })
      .catch(reject)
  })
}
