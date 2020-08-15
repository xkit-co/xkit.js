import createXkit from './index'
// @ts-ignore
window.xkit = window.xkit || {}
// @ts-ignore
window.xkit.init = function (domain: string) {
  Object.assign(this, createXkit(domain))
}
