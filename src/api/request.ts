import { IKitConfig } from '../config'

const API_PATH = '/api/platform_user'
// Theoretically we can support http in development, but with Cookie policies
// as they are, we are better off going all https
const SCHEME = 'https:'


interface UnknownJSON {
  [index: string]: unknown
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  path: string,
  method?: RequestMethod,
  body?: UnknownJSON
}

interface FetchOptions {
  headers: Partial<Record<'Accept' | 'Authorization' | 'Content-Type', string>>,
  credentials?: 'include',
  method?: RequestMethod
  body?: string
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

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
    fetchOptions.headers['Content-Type'] = 'application/json'
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

async function friendlyFetch(url: string, options: FetchOptions): Promise<ReturnType<typeof fetch>> {
  try {
    const res = await fetch(url, options)
    return res
  } catch (e) {
    if (e.message === "Failed to fetch") {
      console.warn(
`Xkit: Request failed.
If the error message above indicates a CORS policy error, you may need to configure the Valid Web Origins to include "${window.location.origin}"
More info here: https://docs.xkit.co/docs/configure-xkit#website-origin
Settings: https://app.xkit.co/settings`)
    }
    throw e
  }
}

export async function request(config: IKitConfig, options: RequestOptions): Promise<UnknownJSON> {
  const res = await friendlyFetch(
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
