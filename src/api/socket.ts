import { Socket, Channel, Push } from 'phoenix'
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

interface UndocumentedSocket extends Socket {
  reconnectTimer: {
    reset: () => void
  }
}

let socket: UndocumentedSocket | null

function resetSocket(socket: UndocumentedSocket): UndocumentedSocket {
  socket.reconnectTimer.reset()
  socket.disconnect(() => {})
  return socket
}

async function initializeSocket(config: AuthorizedConfig): Promise<UndocumentedSocket> {
  if (socket) {
    if (socket.isConnected) {
      return socket
    } else {
      resetSocket(socket)
      socket = null
    }
  }

  const params: SocketParams = {
    token: config.token
  }

  return new Promise((resolve, reject) => {
    socket = new Socket(`${SCHEME}//${config.domain}${SOCKET_ENDPOINT}`, { params }) as UndocumentedSocket
    let socketHasOpened = false
    socket.onOpen(() => {
      socketHasOpened = true
      resolve(socket)
    })
    socket.onClose((evt) => {
      if (!socketHasOpened) {
        resetSocket(socket)
        socket = null
        logger.debug('Socket initialization failed', evt)

        // check to see if it's an auth error or not
        assertToken(config)
          .then(() => {
            // if this call succeeded, it's a socket specific issue
            reject(new Error(`Failed to connect to server`))
          })
          .catch(reject)
      } else {
        logger.debug('Socket closing', evt)
      }
    })
    socket.onError((err) => {
      logger.debug('Socket error', err)
    })
    socket.connect()
  })
}

function promisifyPush(push: Push): Promise<unknown> {
  return new Promise((resolve, reject) => {
    push
      .receive('ok', (response) => {
        resolve(response)
      })
      .receive('error', ({ reason }) => {
        logger.debug(`Received error response: ${reason}`)
        reject(new Error(reason))
      })
      .receive('timeout', () => {
        logger.debug('Received timeout')
        reject(new Error('Network timeout'))
      })
  })
}

export async function subscribe(config: AuthorizedConfig, topic: string): Promise<[Channel, unknown]> {
  const socket = await initializeSocket(config)
  logger.debug(`Initialized socket`, socket)
  const channel = socket.channel(topic)
  channel.onError((err) => {
    logger.debug(`Channel error`, err)
  })
  channel.onClose(() => logger.debug(`Channel closed`))
  logger.debug(`Initialized channel`, channel)

  const reply = await promisifyPush(channel.join())
  logger.debug(`Got reply`, reply)
  return [channel, reply]
}

export async function leave(channel: Channel): Promise<void> {
  await promisifyPush(channel.leave())
}
