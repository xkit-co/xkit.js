import createXkit from './index'

// Global Augmentation: https://www.typescriptlang.org/docs/handbook/declaration-merging.html#global-augmentation

declare global {
  interface Window {
    xkit: {
      init: (domain: string) => void
    }
  }
}

window.xkit = window.xkit ?? {}

window.xkit.init = function (domain: string) {
  Object.assign(this, createXkit(domain))
}
