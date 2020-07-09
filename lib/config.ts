type hostname = string

export interface IKitConfig {
  domain: hostname,
  token?: string
}

export interface AuthorizedConfig {
  domain: hostname,
  token: string
}
