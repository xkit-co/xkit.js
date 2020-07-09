import { Socket, Channel, Push } from 'phoenix'
import { AuthorizedConfig } from './config'
import { assertToken } from './session'

const SOCKET_ENDPOINT = '/socket'

interface SocketParams {
  token: string
}

let socket

function resetSocket(socket: Socket): Socket {
  socket.reconnectTimer.reset()
  socket.disconnect(() => {})
  return socket
}

async function initializeSocket(config: AuthorizedConfig): Promise<Socket> {
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

  // need to add protocol config
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  return new Promise((resolve, reject) => {
    socket = new Socket(`${protocol}//${config.domain}${SOCKET_ENDPOINT}`, { params })
    let socketHasOpened = false
    socket.onOpen(() => {
      socketHasOpened = true
      resolve(socket)
    })
    socket.onClose((evt) => {
      if (!socketHasOpened) {
        resetSocket(socket)
        socket = null
        console.debug('Socket initialization failed', evt)

        // check to see if it's an auth error or not
        assertToken(config)
          .then(() => {
            // if this call succeeded, it's a socket specific issue
            reject(new Error(`Failed to connect to server`))
          })
          .catch(reject)
      } else {
        console.debug('Socket closing', evt)
      }
    })
    socket.onError((err) => {
      console.debug('Socket error', err)
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
        console.debug(`Received error response: ${reason}`)
        reject(new Error(reason))
      })
      .receive('timeout', () => {
        console.debug('Received timeout')
        reject(new Error('Network timeout'))
      })
  })
}

export async function subscribe(config: IKitConfig, topic: string): Promise<[Channel, unknown]> {
  const socket = await initializeSocket(config)
  console.debug(`Initialized socket`, socket)
  const channel = socket.channel(topic)
  channel.onError((err) => {
    console.debug(`Channel error`, err)
  })
  channel.onClose(() => console.debug(`Channel closed`))
  console.debug(`Initialized channel`, channel)

  const reply = await promisifyPush(channel.join())
  console.debug(`Got reply`, reply)
  return [channel, reply]
}

export function leave(channel: Channel): Promise<void> {
  return promisifyPush(channel.leave())
}
