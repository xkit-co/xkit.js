import { AuthorizedConfig } from './lib/config'
import { login, getAccessToken, logout } from './lib/api/session'

function bindConfig(config: AuthorizedConfig, fn: Function): Function {
  return fn.bind(null, config)
}

type FunctionMap = Record<string, Function>

function bindAll(config: AuthorizedConfig, fnMap: FunctionMap): FunctionMap {
  return Object.entries(fnMap).reduce((bindMap: FunctionMap, [name, fn]: [string, Function]) => {
    bindMap[name] = bindConfig(config, fn)
    return bindMap
  }, {})
}

function xkit(domain: string): FunctionMap {
  return bindAll({ domain }, {
    login,
    getAccessToken,
    logout
  })
}

export default xkit
