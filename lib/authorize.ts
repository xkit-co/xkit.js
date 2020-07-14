import { IKitConfig } from './config'
import {
  getAuthorization,
  Authorization,
  AuthorizationStatus,
  isComplete,
  subscribeToStatus,
  loadingPath
} from './api/authorization'
import { onWindowClose, captureMessages } from './util'

interface AuthorizationToBeSetup extends Required<Omit<Authorization, 'access_token' | 'status'>> {
  status: AuthorizationStatus.awaiting_callback
}

interface AuthWindow {
  errors: string[],
  ref: Window
}

type AuthWindowCallback = (authWindow: AuthWindow) => Promise<any>

const AUTH_POP_PARAMS: string = Object.entries({
  scrollbars: 'no',
  resizable: 'no',
  status: 'no',
  location: 'no',
  menubar: 'no',
  width: 600,
  height: 700
}).reduce((paramStr: string, [key, val]: [string, string | number]) => `${paramStr},${key}=${val}`, '')

function windowName() {
  return 'ikit:authorization'
}

function popupHost(config: IKitConfig): string {
  return `${window.location.protocol}//${config.domain}`
}

function isAuthorizationReadyForSetup(auth: Authorization): auth is AuthorizationToBeSetup {
  return auth.status === AuthorizationStatus.awaiting_callback && Boolean(auth.authorize_url)
}

function replaceAuthWindowURL(authWindow: AuthWindow, url: string): AuthWindow {
  if (!authWindow.ref || authWindow.ref.closed) {
    throw new Error('Cancelled authorization')
  }

  authWindow.ref.location.replace(url)

  return authWindow
}

async function onAuthWindowClose(authWindow: AuthWindow): void {
  await onWindowClose(authWindow.ref)

  if (authWindow.errors.length) {
    throw new Error(errors[0].error)
  }
}

export async function prepareAuthWindow(config: IKitConfig, callback: AuthWindowCallback): void {
  const loadingUrl = `${popupHost(config)}${loadingPath()}`

  const ref = window.open(loadingUrl, windowName(), AUTH_POP_PARAMS)

  const errors = captureMessages(popupHost(config), (msg) => Boolean(msg.error))

  try {
    const ret = await callback({ ref, errors })
    return ret
  } finally {
    if (ref && !ref.closed) {
      ref.close()
    }
  }
}

async function loadAuthWindow(config: IKitConfig, authWindow: AuthWindow, authorization: Authorization): Promise<void> {
  if (!isAuthorizationReadyForSetup(authorization)) {
    throw new Error('Authorization is not in a state to be setup.')
  }

  replaceAuthWindowURL(authWindow, authorization.authorize_url)

  await onAuthWindowClose(authWindow)

  const newAuthorization = await updateAuthorization(config, authorization)

  if (newAuthorization.status === AuthorizationStatus.awaiting_callback) {
    throw new Error('Cancelled authorization')
  }
}

async function updateAuthorization(config: IKitConfig, authorization: Authorization): Promise<Authorization> {
  const newAuthorization = await getAuthorization(config, authorization.authorizer.prototype.slug, authorization.id)

  if (newAuthorization.status === AuthorizationStatus.error) {
    throw new Error('Encountered an unknown error during authorization')
  }

  return newAuthorization
}

export function authorize(config: AuthorizedConfig, authWindow: AuthWindow, authorization: Authorization): Promise<Authorization> {
  replaceAuthWindowURL(authWindow, `${popupHost(config)}${loadingPath(authorization)}`)

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
