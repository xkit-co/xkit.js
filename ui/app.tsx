import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  ThemeProvider,
  Pane,
  majorScale
} from 'evergreen-ui'
import {
  Route,
  Router,
  BrowserRouter,
  HashRouter,
  MemoryRouter
} from 'react-router-dom'
import { toaster } from './toaster'
import { theme } from './theme'
import { ConfigWrapper } from './config-wrapper'
import Home from './home'

const Routers = Object.freeze({
  'browser': BrowserRouter,
  'hash': HashRouter,
  'memory': MemoryRouter
})

interface AppProps {
  domain: string,
  hideTitle?: boolean,
  title?: string,
  rootPath?: string,
  routerType?: 'browser' | 'hash' | 'memory',
  inheritRouter?: boolean,
  token?: string,
  loginRedirect?: string
}

class App extends React.Component<AppProps, {}> {
  static defaultProps = {
    rootPath: '/',
    routerType: 'browser'
  }

  Router: Router

  constructor (props: AppProps) {
    super(props)

    this.Router = Routers[this.props.routerType]
    this.state = {}
  }

  componentDidMount (): void {
    if (!this.props.domain) {
      console.warn('Domain was not passed to the React App, it will fail to load.')
    }
  }
 
  renderApp () {
    const {
      domain,
      token,
      loginRedirect
    } = this.props

    return (
      <ConfigWrapper domain={domain} token={token} loginRedirect={loginRedirect}>
        <Route path="/" strict={true}>
          <ThemeProvider value={theme}>
            <Pane width="80%" maxWidth={800} margin="auto" marginTop={majorScale(5)}>
              <Home />
            </Pane>
          </ThemeProvider>
        </Route>
      </ConfigWrapper>
    )
  }

  render () {
    const Router = this.Router
    const { rootPath, inheritRouter } = this.props

    if (inheritRouter) {
      return this.renderApp()
    }

    return (
      <Router basename={rootPath}>
        {this.renderApp()}
      </Router>
    )
  }
}

export default App
