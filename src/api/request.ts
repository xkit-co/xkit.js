import { IKitConfig } from '../config'
import { logger } from '../util'
// tsc looks for the common root of all the imported files and this import
// changes it from xkit-js/src/ to xkit-js/ which affects the structure
// of the output dir. We fix that by manually moving the build files one
// level up in the build script.
import { version } from '../../package.json'

const API_PATH = '/api/platform_user'
// Theoretically we can support http in development, but with Cookie policies
// as they are, we are better off going all https
const SCHEME = 'https:'

export interface UnknownJSON {
  [index: string]: unknown
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  path: string
  method?: RequestMethod
  body?: UnknownJSON
}

export class IKitAPIError extends Error {
  name: string
  message: string
  statusCode: number
  statusText: string
  debugMessage?: string

  constructor (message: string, res: Response, debugMessage?: string) {
    super()
    // Sigh: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, IKitAPIError.prototype)
    this.name = 'IKitAPIError'
    this.message = message
    this.statusCode = res.status
    this.statusText = res.statusText
    this.debugMessage = debugMessage
    if (process.env.NODE_ENV === 'development') {
      if (this.debugMessage != null) {
        this.message = `${this.message} (debug: ${this.debugMessage})`
      }
    }
  }
}

function getFetchOptions (config: IKitConfig, options: RequestOptions): RequestInit {
  const headers: Record<string, string> = {
    'Xkit-Js-Version': version,
    Accept: 'application/json'
  }

  const fetchOptions: RequestInit = {
    // So that cookies get sent and included, and returned cookies are not ignored.
    credentials: 'include'
  }

  if (options.body != null) {
    fetchOptions.body = JSON.stringify(options.body)
    headers['Content-Type'] = 'application/json'
  }

  if (options.method != null) {
    fetchOptions.method = options.method
  }

  if (config.token != null) {
    headers.Authorization = `Bearer ${config.token}`
  }

  return { headers, ...fetchOptions }
}

async function parseData <T> (res: Response): Promise<T> {
  let data

  try {
    data = await res.json()
    if (data == null) {
      throw new Error('No data in response')
    }
  } catch (e) {
    if (!res.ok) {
      throw new IKitAPIError(res.statusText, res, e.message)
    }
    throw new IKitAPIError(e.message, res)
  }
  if (data.error != null) {
    throw new IKitAPIError(data.error, res)
  }

  return data
}

async function friendlyFetch (url: string, options: RequestInit): Promise<ReturnType<typeof fetch>> {
  try {
    const res = await fetch(url, options)
    return res
  } catch (e) {
    if (e.message === 'Failed to fetch') {
      logger.warn(
`Request failed.
If the error message above indicates a CORS policy error, you may need to configure the Valid Web Origins to include "${window.location.origin}"
More info here: https://docs.xkit.co/docs/configure-xkit#website-origin
Settings: https://app.xkit.co/settings`)
    }
    throw e
  }
}

export async function request <T> (config: IKitConfig, options: RequestOptions): Promise<T | UnknownJSON> {
  const res = await friendlyFetch(
    `${SCHEME}//${config.domain}${API_PATH}${options.path}`,
    getFetchOptions(config, options)
  )

  if (!res.ok) {
    throw new IKitAPIError(res.statusText, res)
  }

  // No Content response header
  if (res.status !== 204) {
    return await parseData<T>(res)
  }

  return {}
}
