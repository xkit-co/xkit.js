export function delay (ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), ms)
  })
}

function noop () {}
function allTrue () { return true }

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

export function captureMessages(origin, filter = allTrue) {
  const messages = []
  window.addEventListener('message', (event) => {
    console.debug(`incoming message`, event)
    if (event.origin === origin && filter(event.data, event)) {
      messages.push(event.data)
    }
  })
  return messages
}
