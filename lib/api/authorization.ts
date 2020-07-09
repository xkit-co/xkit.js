import { AuthorizedConfig } from '../config'
import Emitter from '../emitter'
import { request } from './request'
import { subscribe, leave } from './socket'
import { Channel } from 'phoenix'

type AuthorizeUrl = string

interface AuthorizerPrototype {
  name: string,
  slug: string
}

interface Authorizer {
  client_id: string,
  prototype: AuthorizerPrototype
}

export enum AuthorizationStatus {
  awaiting_callback = "awaiting_callback",
  retrieving_tokens = "retrieving_tokens",
  active = "active",
  error = "error"
}

export interface Authorization {
  id: number | string,
  status: AuthorizationStatus,
  authorizer: Authorizer,
  access_token?: string,
  authorize_url?: AuthorizeUrl
}

export function isComplete(status: AuthorizationStatus | string): boolean {
  return [AuthorizationStatus.active, AuthorizationStatus.error].includes(status)
}

export async function createAuthorization(config: AuthorizedConfig, prototypeSlug: string): Promise<Authorization> {
  const {
    authorization
  } = await request(config, {
    path: `/authorizations/${prototypeSlug}`,
    method: 'POST'
  })

  return authorization as Authorization
}

export async function getLatestAuthorization(config: AuthorizedConfig, prototypeSlug: string): Promise<Authorization> {
  const {
    authorization
  } = await request(config, {
    path: `/authorizations/${prototypeSlug}/latest`
  })

  return authorization as Authorization
}

export async function getAuthorization(config: AuthorizedConfig, prototypeSlug: string, authorizationId: string | number): Promise<Authorization> {
  const {
    authorization
  } = await request(config, {
    path: `/authorizations/${prototypeSlug}/${authorizationId}`
  })

  return authorization as Authorization
}

export async function refreshAuthorization(config: AuthorizedConfig, prototypeSlug: string, authorizationId: string | number): Promise<Authorization> {
  const {
    authorization
  } = await request(config, {
    path: `/authorizations/${prototypeSlug}/${authorizationId}/refresh`,
    method: 'POST'
  })

  return authorization as Authorization
}

export async function subscribeToStatus(config: AuthorizedConfig, authorizationId: string | number): Promise<[Emitter, AuthorizationStatus]> {
  const emitter = new Emitter()
  console.log('about to subscribe')
  const [channel, { status }] = (await subscribe(config, `authorization_status:${authorizationId}`)) as [Channel, { status: string }]
  if (isComplete(status)) {
    console.debug(`Removing subscription to authorization status, already in a terminal state: ${status}.`)
    await leave(channel)
    return [null, status]
  }

  channel.onError((err: Error | string) => {
    emitter.emit('error', { error: err })
  })

  channel.onClose(() => {
    emitter.emit('close')
  })

  channel.on('status_update', async ({ status }) => {
    emitter.emit('status_update', { status })

    if (isComplete(status)) {
      console.debug(`Removing subscription to authorization status, now in a terminal state: ${status}.`)
      await leave(channel)
      return
    }
  })

  return [emitter, status]
}
