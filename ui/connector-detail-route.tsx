import * as React from 'react'
import * as ReactDOM from 'react-dom'
import ConnectorDetail from './connector-detail'
import { IKitConfig } from '../lib/config'
import { Connector } from '../lib/api/connector'
import { Connection, getConnectionOrConnector } from '../lib/api/connection'
import { toaster } from './toaster'
import { Pane, Spinner } from 'evergreen-ui'
import {
  withConfig,
  ConfigConsumer,
  callWithConfig
} from './config-wrapper'

interface ConnectorDetailRouteProps {
  slug: string
}

interface ConnectorDetailRouteState {
  connector?: Connector,
  connection?: Connection
}

class ConnectorDetailRoute extends React.Component<ConfigConsumer<ConnectorDetailRouteProps>, ConnectorDetailRouteState> {
  constructor (props: ConnectorDetailRouteProps) {
    super(props)
    this.state = {}
  }

  componentDidMount () {
    this.loadConnector()
  }

  async loadConnector (): Promise<void> {
    const { slug } = this.props
    try {
      const connection = await callWithConfig(config => getConnectionOrConnector(config, slug))
      if (connection.enabled != null) {
        this.setState({ connection: connection })
      }
      this.setState({ connector: connection.connector })
    } catch (e) {
      toaster.danger(`Error while loading connector: ${e.message}`)
    }
  }

  render (): React.Element {
    const { connector, connection } = this.state
    if (!connector) {
      return (
        <Pane display="flex" alignItems="center" justifyContent="center" height={150}>
          <Spinner />
        </Pane>
      )
    }
    
    return (
      <ConnectorDetail
        connection={connection}
        connector={connector}
      />
    )
  }
}

export default withConfig(ConnectorDetailRoute)
