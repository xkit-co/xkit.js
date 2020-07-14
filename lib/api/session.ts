import { IKitConfig, AuthorizedConfig } from '../config'
import { request } from './request'

export async function login(config: IKitConfig, token: string): Promise<AuthorizedConfig> {
  const configWithToken = Object.assign({}, config, { token })

  await request(configWithToken, {
    path: '/sessions',
    method: 'POST'
  })

  return configWithToken as AuthorizedConfig
}

export async function logout(config: IKitConfig): Promise<void> {
  await request(config, {
    path: '/sessions',
    method: 'DELETE'
  })
}

export async function getAccessToken(config: IKitConfig): Promise<string> {
  const {
    access_token
  } = await request(config, {
    path: '/sessions/token',
    method: 'POST'
  })

  if (!access_token) {
    throw new Error('No access token was returned')
  }

  return access_token as string
}

export async function assertToken(config: IKitConfig): Promise<void> {
  await request(config, {
    path: '/session'
  })
}
