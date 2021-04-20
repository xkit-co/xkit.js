import createXkit from './index'
// @ts-expect-error
window.xkit = window.xkit || {}
// @ts-expect-error
window.xkit.init = function (domain: string) {
  Object.assign(this, createXkit(domain))
}
