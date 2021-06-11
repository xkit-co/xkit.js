export async function delay (ms: number): Promise<boolean> {
  return await new Promise((resolve) => {
    setTimeout(() => resolve(true), ms)
  })
}

function noop (): void {}

export async function onWindowClose (window: Window, fn = noop, pollDelay = 200): Promise<void> {
  /* NOTE: window is not modified in the loop because we
  wait for side effect: Browser being closed by user or by a script
  */
  /* eslint-disable no-unmodified-loop-condition */
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
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

export const logger = {
  info: console.log.bind(console, 'Xkit:'),
  error: console.error.bind(console, 'Xkit:'),
  warn: console.warn.bind(console, 'Xkit:'),
  debug: process.env.NODE_ENV === 'development' ? console.debug.bind(console, 'Xkit:') : noop
}

export function deprecate<T> (fn: (this: any, ...args: unknown[]) => T, name?: string, alternative?: string): (this: any, ...args: unknown[]) => T {
  return function (...args: unknown[]): T {
    deprecationWarning(name, alternative)
    return fn.call(this, ...args)
  }
}

export function deprecationWarning (name?: string, alternative?: string): void {
  logger.warn(`${name ?? 'this function'} is deprecated.${(alternative !== undefined) ? ` Use ${alternative} instead.` : ''}`)
}
