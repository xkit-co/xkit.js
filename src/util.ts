export function delay (ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), ms)
  })
}

function noop () {}

export async function onWindowClose (window: Window, fn = noop, pollDelay = 200): Promise<void> {
  while (window != null && !window.closed) {
    await delay(pollDelay)
  }
  fn()
}

export async function silent (fn: Function): Promise<void> {
  try {
    await fn()
  } catch (e) {
    logger.error(e)
  }
}

type filterMsg<T> = (msg: unknown) => msg is T

export function captureMessages<T> (origin: string, filter: filterMsg<T>): T[] {
  const messages: T[] = []
  window.addEventListener('message', (event) => {
    logger.debug('incoming message', event)
    if (event.origin === origin && filter(event.data)) {
      messages.push(event.data)
    }
  })
  return messages
}

// thx: https://fettblog.eu/typescript-hasownproperty/
export function hasOwnProperty<X extends {}, Y extends PropertyKey>
(obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop)
}

export const logger = {
  info: console.log.bind(console, 'Xkit:'),
  error: console.error.bind(console, 'Xkit:'),
  warn: console.warn.bind(console, 'Xkit:'),
  debug: process.env.NODE_ENV === 'development' ? console.debug.bind(console, 'Xkit:') : noop
}

export function deprecate<T> (fn: (...args: unknown[]) => T, name?: string, alternative?: string): (...args: unknown[]) => T {
  return function (...args: unknown[]): T {
    deprecationWarning(name, alternative)
    return fn.call(this, ...args)
  }
}

export function deprecationWarning (name?: string, alternative?: string): void {
  logger.warn(`${name || 'this function'} is deprecated.${alternative ? ` Use ${alternative} instead.` : ''}`)
}
