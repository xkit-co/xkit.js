import { Socket, Channel, Push } from 'phoenix'
import { AuthorizedConfig } from './config'

const SOCKET_ENDPOINT = '/socket'

interface SocketParams {
  token: string
}

let socket

async function initializeSocket(config: AuthorizedConfig): Promise<Socket> {
  if (socket) {
    return socket
  }

  const params: SocketParams = {
    token: config.token
  }

  // need to add protocol config
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new Socket(`${protocol}//${config.domain}${SOCKET_ENDPOINT}`, { params })
  socket.onClose(socketClose)
  socket.onError(socketClose)
  socket.connect()
  return socket
}

function socketClose(err: Error | string | undefined): void {
  console.debug('socket closing, removing from memory')
  console.error('Error encountered:', err)
  socket = undefined
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
  const channel = socket.channel(topic)

  const reply = await promisifyPush(channel.join())
  return [channel, reply]
}

export function leave(channel: Channel): Promise<void> {
  return promisifyPush(channel.leave())
}
