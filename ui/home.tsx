import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  withConfig,
  ConfigConsumer,
  callWithConfig
} from './config-wrapper'
import {
  Switch,
  Route,
  withRouter
} from 'react-router-dom'
import {
  Heading,
  Spinner,
  majorScale
} from 'evergreen-ui'
import { toaster } from './toaster'
import Catalog from './catalog'
import ConnectorDetailRoute from './connector-detail-route'
import {
  Platform,
  getPlatform
} from '../lib/api/platform'

interface HomeState {
  loading: boolean
  platform?: Platform
}

class Home extends React.Component<ConfigConsumer, HomeState> {
  constructor (props) {
    super(props)
    this.state = {
      loading: true
    }
  }

  componentDidMount (): void {
    if (this.props.config && this.props.config.domain) {
      this.loadPlatform()
    }
  }

  componentDidUpdate (prevProps): void {
    if ((!prevProps.config || !prevProps.config.domain) && (this.props.config && this.props.config.domain)) {
      this.loadPlatform()
    }
  }

  async loadPlatform (): Promise<void> {
    this.setState({ loading: true })
    try {
      const platform = await callWithConfig(getPlatform)
      this.setState({ platform })
    } catch (e) {
      toaster.danger(`Error while loading platform: ${e.message}`)
    } finally {
      this.setState({ loading: false })
    }
  }

  render (): React.Element {
    const {
      title,
      hideTitle,
      config,
      configLoading,
      match
    } = this.props
    const {
      platform,
      loading
    } = this.state
    const finalTitle = loading || configLoading || title ? title : `${platform.name} Integrations`


    if (loading || configLoading) {
      return <Spinner marginX="auto"  marginY={150} size={majorScale(6)} />
    }

    return (
      <>
        {hideTitle ? '' : <Heading size={800} marginBottom={majorScale(2)}>{finalTitle}</Heading>}
        <Switch>
          <Route path={['/', '/connectors']} exact={true}>
            <Catalog
              platform={platform}
            />
          </Route>
          <Route
            path="/connectors/:slug"
            render={({ match }: RouteComponentProps<{slug: string}>) => {
              return (
                <ConnectorDetailRoute
                  slug={match.params.slug}
                />
              )
            }}
          />
        </Switch>
      </>
    )
  }
}

export default withConfig(Home)
