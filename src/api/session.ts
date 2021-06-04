import { IKitConfig, AuthorizedConfig } from '../config'
import { request } from './request'

export async function createSession (config: IKitConfig, token: string): Promise<AuthorizedConfig> {
  const configWithToken = Object.assign({}, config, { token })

  await request(configWithToken, {
    path: '/sessions',
    method: 'POST'
  })

  return configWithToken as AuthorizedConfig
}

export async function deleteSession (config: IKitConfig): Promise<void> {
  await request(config, {
    path: '/sessions',
    method: 'DELETE'
  })
}

export async function getAccessToken (config: IKitConfig): Promise<string> {
  const {
    access_token: accessToken
  } = await request(config, {
    path: '/sessions/token',
    method: 'POST'
  })

  if (!accessToken) {
    throw new Error('No access token was returned')
  }

  return accessToken as string
}

export async function getOneTimeToken (config: AuthorizedConfig): Promise<string> {
  const { ott } = await request(config, {
    path: '/sessions/ott',
    method: 'POST'
  })

  if (!ott) {
    throw new Error('No one-time token was returned')
  }

  return ott as string
}

export async function assertToken (config: IKitConfig): Promise<void> {
  await request(config, {
    path: '/session'
  })
}
