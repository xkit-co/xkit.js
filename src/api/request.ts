import { IKitConfig } from '../config'

const API_PATH = '/api/platform_user'
const SCHEME = process.env.NODE_ENV === 'production' ? 'https:' : 'http:'

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  path: string,
  method?: RequestMethod
}

interface FetchOptions {
  headers: Partial<Record<'Accept' | 'Authorization', string>>,
  credentials?: 'include',
  method?: RequestMethod
}

interface UnknownJSON {
  [index: string]: unknown
}

export class IKitAPIError extends Error {
  name: string
  message: string
  statusCode: number
  statusText: string
  debugMessage?: string

  constructor(message: string, res: Response, debugMessage?: string) {
    super()
    // Sigh: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, IKitAPIError.prototype)
    this.name = 'IKitAPIError'
    this.message = message
    this.statusCode = res.status
    this.statusText = res.statusText
    this.debugMessage = debugMessage
    // @ts-ignore
    if (process.env.NODE_ENV === 'development') {
      if (this.debugMessage) {
        this.message = `${this.message} (debug: ${this.debugMessage})`
      }
    }
  }
}

function getFetchOptions(config: IKitConfig, options: RequestOptions): FetchOptions {
  const fetchOptions: FetchOptions = {
    // So that cookies get sent and included, and returned cookies
    // are not ignored
    credentials: 'include',
    headers: {
      'Accept': 'application/json'
    }
  }

  if (options.method) {
    fetchOptions.method = options.method
  }

  if (config.token) {
    fetchOptions.headers['Authorization'] = `Bearer ${config.token}`
  }

  return fetchOptions
}

async function parseData(res: Response): Promise<UnknownJSON> {
  let data

  try {
    data = await res.json()
    if (!data) {
      throw new Error("No data in response")
    }
  } catch (e) {
    if (!res.ok) {
      throw new IKitAPIError(res.statusText, res, e.message)
    }
    throw new IKitAPIError(e.message, res)
  }
  if (data.error) {
    throw new IKitAPIError(data.error, res)
  }

  return data
}

export async function request(config: IKitConfig, options: RequestOptions): Promise<UnknownJSON> {
  const res = await fetch(
    `${SCHEME}//${config.domain}${API_PATH}${options.path}`,
    getFetchOptions(config, options)
  )

  let data

  // No Content response header
  if (res.status !== 204) {
    data = await parseData(res)
  } else {
    data = {}
  }

  if (!res.ok) {
    throw new IKitAPIError(res.statusText, res)
  }

  return data
}
