export function delay (ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), ms)
  })
}

function noop () {}

export async function onWindowClose(window: Window, fn = noop, pollDelay = 200): Promise<void> {
  while (window != null && !window.closed) {
    await delay(pollDelay)
  }
  fn()
}

export async function silent(fn: Function): Promise<void> {
  try {
    await fn()
  } catch (e) {
    console.error(e)
  }
}

type filterMsg<T> = (msg: unknown) => msg is T

export function captureMessages<T>(origin: string, filter: filterMsg<T>): T[] {
  const messages: T[] = []
  window.addEventListener('message', (event) => {
    console.debug(`incoming message`, event)
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

export function domReady (document: Document, fn: Function) {
  if (document.readyState !== 'loading') {
    fn()
    return
  }
  const listener = () => {
    fn()
    document.removeEventListener('DOMContentLoaded', listener)
  }
  document.addEventListener('DOMContentLoaded', listener)
}
