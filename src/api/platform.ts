import { IKitConfig } from '../config'
import { request } from './request'

export interface Platform {
  name: string
  slug: string
  custom_domain?: string
  website: string
  login_redirect_url: string
  remove_branding: boolean
}

export async function getPlatformPublic(config: IKitConfig): Promise<Platform> {
  const { platform } = await request(config, {
    path: '/platform'
  })

  return platform as Platform
}
