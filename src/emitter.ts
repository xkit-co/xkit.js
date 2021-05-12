// Safari polyfill
import { EventTarget as EventTargetShim } from 'event-target-shim'
import { logger } from './util'

export const ENABLE_CONNECTION_EVENT = 'connection:enable'
export const DISABLE_CONNECTION_EVENT = 'connection:disable'
export const REMOVE_CONNECTION_EVENT = 'connection:remove'

type EventCallback<T> = (payload: T) => void
// Namespace listeners by event type
type ListenerTypes = Map<string, Listeners>
// Maps user-supplied listeners with listeners supplied to EventTarget
type Listeners = Map<EventCallback<any>, EventListener>

/**
 * Thin wrapper around EventTarget to make it
 * a bit friendlier
 */
class Emitter {
  target: EventTarget
  listeners: ListenerTypes

  constructor () {
    try {
      this.target = new EventTarget()
    } catch (e) {
      // Shim EventTarget in Safari
      this.target = new EventTargetShim()
    }
    this.listeners = new Map()
  }

  _getListeners (type: string): Listeners {
    let listeners = this.listeners.get(type)

    if (listeners == null) {
      listeners = new Map()
      this.listeners.set(type, listeners)
    }

    return listeners
  }

  on<T> (type: string, fn: EventCallback<T>): void {
    const listeners = this._getListeners(type)
    if (listeners.has(fn)) {
      throw new Error('Can not use the same function for the same type of event more than once.')
    }

    if (type === DISABLE_CONNECTION_EVENT) {
      logger.warn(`The ${DISABLE_CONNECTION_EVENT} event is deprecated. Please migrate to the ${REMOVE_CONNECTION_EVENT}.`)
    }

    const listener = ((event: CustomEvent<T>): void => {
      if (event.type === type) {
        fn(event.detail)
      }
    // https://github.com/Microsoft/TypeScript/issues/28357
    }) as EventListener
    listeners.set(fn, listener)
    this.target.addEventListener(type, listener)
  }

  off<T> (type: string, fn: EventCallback<T>): void {
    const listeners = this._getListeners(type)
    if (!listeners.has(fn)) {
      throw new Error('The supplied function is not a listener on the given type.')
    }
    const listener = listeners.get(fn)
    if (listener != null) {
      this.target.removeEventListener(type, listener)
      listeners.delete(fn)
    }
  }

  emit (type: string, payload?: unknown): void {
    this.target.dispatchEvent(new CustomEvent(type, { detail: payload }))
  }

  removeAllListeners (): void {
    this.listeners.forEach((listeners, type) => {
      listeners.forEach((_, userListener) => {
        this.off(type, userListener)
      })
    })
    this.listeners = new Map()
  }
}

export default Emitter
