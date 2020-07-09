import { IKitConfig } from './config'
import {
  getAuthorization,
  Authorization,
  AuthorizationStatus,
  isComplete,
  subscribeToStatus
} from './api/authorization'
import { onWindowClose, captureMessages } from './util'

interface AuthorizationToBeSetup extends Required<Omit<Authorization, 'access_token' | 'status'>> {
  status: AuthorizationStatus.awaiting_callback
}

const AUTH_POP_PARAMS: string = Object.entries({
  scrollbars: 'no',
  resizable: 'no',
  status: 'no',
  location: 'no',
  menubar: 'no',
  width: 600,
  height: 700
}).reduce((paramStr: string, [key, val]: [string, string | number]) => `${paramStr},${key}=${val}`, '')

function windowName(auth: Authorization) {
  // use slug instead of authorization id?
  return `ikit:authorization:${auth.id}`
}

function isAuthorizationReadyForSetup(auth: Authorization): auth is AuthorizationToBeSetup {
  return auth.status === AuthorizationStatus.awaiting_callback && Boolean(auth.authorize_url)
}

async function openAuthWindow(config: IKitConfig, authorization: Authorization): Promise<void> {
  if (!isAuthorizationReadyForSetup(authorization)) {
    throw new Error('Authorization is not in a state to be setup.')
  }

  const windowRef = window.open(authorization.authorize_url, windowName(authorization), AUTH_POP_PARAMS)

  // need to allow for protocol config (https)
  const errors = captureMessages(`http://${config.domain}`, (msg) => Boolean(msg.error))

  await onWindowClose(windowRef)

  if (errors.length) {
    throw new Error(errors[0].error)
  }

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

export function authorize(config: AuthorizedConfig, authorization: Authorization): Promise<Authorization> {
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
          reject(error instanceof Error ? error : new Error(error))
          emitter.removeAllListeners()
        })
        emitter.on('close', () => {
          reject(new Error('Subscriber closed unexpectedly'))
          emitter.removeAllListeners()
        })

        if (status === AuthorizationStatus.awaiting_callback) {
          openAuthWindow(config, authorization).catch(reject)
        }
      })
      .catch(reject)
  })
}
