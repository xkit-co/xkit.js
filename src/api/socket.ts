import { Socket as PhoenixSocket, Channel, Push } from 'phoenix'
import { AuthorizedConfig } from '../config'
import { logger } from '../util'
import { assertToken } from './session'

const SOCKET_ENDPOINT = '/socket'
// Theoretically we can support http (or ws in this case) in development,
// but with Cookie policies as they are, we are better off going all https (wss)
const SCHEME = 'wss:'

interface SocketParams {
  token: string
}

interface UndocumentedSocket extends PhoenixSocket {
  // This is an undocumented part of the socket interface.
  // We use to stop the socket from attempting reconnects.
  // TODO: is this a bug that has been fixed upstream?
  reconnectTimer: {
    reset: () => void
  }
}

export type Socket = UndocumentedSocket

type Subscription<T> = [Channel, T]

export function resetSocket(socket: Socket): Socket {
  socket.reconnectTimer.reset()
  socket.disconnect(() => {})
  return socket
}

export async function createSocket(config: AuthorizedConfig): Promise<Socket> {
  return await new Promise((resolve, reject) => {
    const params: SocketParams = {
      token: config.token
    }

    const opts = {
      params,
      // The default value of 30 seconds is not enough to keep the connection alive -
      // the proxy that handles custom domains terminates the connection after 30 seconds.
      heartbeatIntervalMs: 15000
    }

    const socket = new PhoenixSocket(
      `${SCHEME}//${config.domain}${SOCKET_ENDPOINT}`,
      opts
    ) as Socket

    let promiseHasResolved = false

    socket.onOpen(() => {
      promiseHasResolved = true
      resolve(socket)
    })

    // This is only called in "unexpected" close events (i.e. not those triggered by `disconnect`)
    // See: https://github.com/phoenixframework/phoenix/issues/3378
    socket.onClose((evt) => {
      if (promiseHasResolved) {
        logger.debug('Socket closing', evt)
        return
      }

      logger.debug('Socket initialization failed', evt)

      promiseHasResolved = true
      resetSocket(socket)

      // This endpoint will tell us if the connection failure is due to an
      // authorization error.
      assertToken(config).then(
        // Our token assertion was successful, so this is not an auth error.
        // We reject with a standard error.
        () => reject(new Error('Failed to connect to server')),
        // We failed our token assertion, so we bubble the error so it can
        // be handled by `callWithConfig` including a potential retry.
        reject
      )
    })

    // onError will only ever be fired prior to onClose since under the hood they
    // rely on the `close` and `error` WebSocket events.
    // See: https://stackoverflow.com/questions/40084398/is-onclose-always-called-after-onerror-for-websocket
    socket.onError((err) => {
      logger.debug('Socket error', err)
    })

    socket.connect()
  })
}

async function promisifyPush<T>(push: Push): Promise<T> {
  return await new Promise((resolve, reject) => {
    push
      .receive('ok', (response) => {
        resolve(response as T)
      })
      .receive('error', ({ reason }) => {
        logger.debug(`Received error response: ${String(reason)}`)
        reject(new Error(reason))
      })
      .receive('timeout', () => {
        logger.debug('Received timeout')
        reject(new Error('Network timeout'))
      })
  })
}

export async function subscribe<T>(
  socket: Socket,
  topic: string
): Promise<Subscription<T>> {
  const channel = socket.channel(topic)

  channel.onError((err) => logger.debug('Channel error', err))
  channel.onClose(() => logger.debug('Channel closed'))

  logger.debug('Initialized channel', channel)

  const reply = await promisifyPush<T>(channel.join())

  logger.debug('Got reply', reply)

  return [channel, reply]
}

export async function leave(channel: Channel): Promise<void> {
  await promisifyPush<unknown>(channel.leave())
}
