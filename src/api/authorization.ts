import { AuthorizedConfig } from '../config'
import Emitter from '../emitter'
import { request, UnknownJSON } from './request'
import { Socket, subscribe, leave } from './socket'
import { PublicConnector } from './connector'
import { logger } from '../util'

type AuthorizeUrl = string

export interface CollectField {
  name: string
  label: string
  suffix?: string
}

export interface AuthorizerPrototype {
  name: string
  slug: string
  collect_video_url?: string
  collect_instructions?: string
  /** @deprecated Use `collect_fields` instead. */
  collect_label?: string
  /** @deprecated Use `collect_fields` instead. */
  collect_field?: string
  /** @deprecated Use `collect_fields` instead. */
  collect_suffix?: string
  collect_fields?: CollectField[]
  collect_save?: string
}

export interface Authorizer {
  client_id: string
  prototype: AuthorizerPrototype
}

export enum AuthorizationStatus {
  awaiting_callback = 'awaiting_callback',
  retrieving_tokens = 'retrieving_tokens',
  active = 'active',
  error = 'error'
}

export interface Authorization {
  id: number | string
  display_label?: string
  status: AuthorizationStatus
  error_code?: string
  error_message?: string
  authorizer: Authorizer
  access_token?: string
  authorize_url?: AuthorizeUrl
  /** @deprecated Use `connector` instead. */
  initiating_connector?: PublicConnector
  connector?: PublicConnector
  state?: string
}

function isStatus(status: string): status is AuthorizationStatus {
  const statuses: string[] = Object.values(AuthorizationStatus)
  return statuses.includes(status)
}

export function isComplete(status: string): boolean {
  const completeStatuses: string[] = [
    AuthorizationStatus.active,
    AuthorizationStatus.error
  ]
  return completeStatuses.includes(status)
}

// TODO: Don't hardcode this in here
export function loadingPath(authorization?: Authorization): string {
  if (authorization == null) {
    return '/authorizations/loading'
  }
  return `/authorizations/${authorization.authorizer.prototype.slug}/loading`
}

export async function setAuthorizationFields(
  config: AuthorizedConfig,
  prototypeSlug: string,
  state: string,
  params: UnknownJSON
): Promise<Authorization> {
  const { authorization } = await request(config, {
    path: `/authorizations/${prototypeSlug}`,
    method: 'PUT',
    body: {
      state,
      ...params
    }
  })

  return authorization as Authorization
}

export async function getAuthorization(
  config: AuthorizedConfig,
  prototypeSlug: string,
  authorizationId: string | number
): Promise<Authorization> {
  const { authorization } = await request(config, {
    path: `/authorizations/${prototypeSlug}/${authorizationId}`
  })

  return authorization as Authorization
}

export async function subscribeToStatus(
  socket: Socket,
  authorizationId: string | number
): Promise<[Emitter, AuthorizationStatus]> {
  const emitter = new Emitter()
  const [channel, { status }] = await subscribe<{ status: string }>(
    socket,
    `authorization_status:${authorizationId}`
  )
  logger.debug('Subscribed to channel', channel)

  if (!isStatus(status)) {
    throw new Error(`Invalid status returned from subscription: ${status}`)
  }

  if (isComplete(status)) {
    logger.debug(
      `Removing subscription to authorization status, already in a terminal state: ${status}.`
    )
    await leave(channel)
    return [emitter, status]
  }

  channel.onError((err: Error | string) => {
    emitter.emit('error', { error: err })
  })

  channel.onClose(() => {
    emitter.emit('close')
  })

  channel.on('status_update', ({ status: statusUpdate }) => {
    emitter.emit('status_update', { status: statusUpdate })

    if (isComplete(statusUpdate)) {
      logger.debug(
        `Removing subscription to authorization status, now in a terminal state: ${status}.`
      )
      leave(channel).catch((e) =>
        logger.error(`Leaving Channel failed with ${e.message as string}`)
      )
    }
  })

  return [emitter, status]
}
