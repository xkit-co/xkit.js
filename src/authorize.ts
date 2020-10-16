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
import {
  onWindowClose,
  captureMessages,
  hasOwnProperty,
  delay
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

const AUTH_POP_PARAMS: string = Object.entries({
  scrollbars: 'no',
  resizable: 'no',
  status: 'no',
  location: 'no',
  menubar: 'no',
  width: 625,
  height: 700
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

function replaceAuthWindowURL(config: IKitConfig, authWindow: AuthWindow, url: string): AuthWindow {
  if (!authWindow.ref || authWindow.ref.closed) {
    throw new Error('Cancelled authorization')
  }

  try {
    authWindow.ref.location.replace(url)
  } catch (e) {
    // Electron doesn't support updating it directly, so we send a message to the window
    authWindow.ready().then(() => {
      authWindow.ref.postMessage({ location: url }, popupOrigin(config))
    })
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

  const loadingUrl = `${popupHost(config)}${loadingPath()}`

  const ref = window.open(loadingUrl, windowName(), AUTH_POP_PARAMS)

  const errors = captureMessages<ErrorMessage>(popupHost(config), isMessageError)

  const ready = monitorAuthWindowReady(config)

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
  return callWithConfig((config) => {
    return prepareAuthWindow(config, callback)
  })
}

async function loadAuthWindow(config: AuthorizedConfig, authWindow: AuthWindow, authorization: Authorization): Promise<void> {
  if (!isAuthorizationReadyForSetup(authorization)) {
    throw new Error('Authorization is not in a state to be setup.')
  }

  replaceAuthWindowURL(config, authWindow, authorization.authorize_url)

  await onAuthWindowClose(authWindow)

  const newAuthorization = await updateAuthorization(config, authorization)

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

export function authorize(config: AuthorizedConfig, authWindow: AuthWindow, authorization: Authorization): Promise<Authorization> {
  replaceAuthWindowURL(config, authWindow, `${popupHost(config)}${loadingPath(authorization)}`)

  return new Promise((resolve, reject) => {
    subscribeToStatus(config, authorization.id)
      .then(([emitter, status]: [Emitter, AuthorizationStatus]) => {
        if (isComplete(status)) {
          updateAuthorization(config, authorization).then(resolve).catch(reject)
          return
        }

        authorization.status = status

        emitter.on('status_update', ({ status }) => {
          console.debug('received status update', status)
          if (isComplete(status)) {
            updateAuthorization(config, authorization).then(resolve).catch(reject)
            emitter.removeAllListeners()
          }
        })
        emitter.on('error', ({ error }) => {
          console.debug(`Emitter received an error`, error)
          reject(error instanceof Error ? error : new Error(error))
          emitter.removeAllListeners()
        })
        emitter.on('close', () => {
          console.debug(`Emitter closed`)
          reject(new Error('Subscriber closed unexpectedly'))
          emitter.removeAllListeners()
        })

        if (status === AuthorizationStatus.awaiting_callback) {
          loadAuthWindow(config, authWindow, authorization).catch(reject)
        }
      })
      .catch(reject)
  })
}
