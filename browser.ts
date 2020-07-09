import xkit from './index'
// @ts-ignore
window.xkit = xkit(window.location.hostname)
window.xkit.reset = function (...args) {
  window.xkit = xkit(...args)
}
