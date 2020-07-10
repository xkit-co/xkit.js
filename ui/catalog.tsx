import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  Pane,
  Card,
  Heading,
  InboxIcon,
  SearchInput,
  BackButton,
  Spinner,
  Colors,
  majorScale
} from 'evergreen-ui'
import { compareTwoStrings } from 'string-similarity'
import CatalogThumb from './catalog-thumb'
import { IKitConfig } from '../lib/config'
import {
  listConnectors,
  Connector
} from '../lib/api/connector'
import {
  getPlatform,
  Platform
} from '../lib/api/platform'
import { toaster } from './toaster'
import {
  ConfigConsumer,
  withConfig,
  callWithConfig
} from './config-wrapper'

interface CatalogState {
  connectors: Connector[]
  loaded: boolean,
  search: string,
  platform?: Platform
}

const SIMILARITY_MIN = 0.75

class Catalog extends React.Component<ConfigConsumer, CatalogState> {
  constructor (props: ConfigConsumer) {
    super(props)
    this.state = {
      connectors: [],
      loaded: false,
      search: ""
    }
  }

  componentDidMount () {
    this.loadConnectors()
    this.loadPlatform()
  }

  async loadConnectors (): Promise<void> {
    try {
      const connectors = await callWithConfig(config => listConnectors(config))
      this.setState({ connectors })
    } catch (e) {
      toaster.danger(`Error while loading connectors: ${e.message}`)
    } finally {
      this.setState({ loaded: true })
    }
  }

  async loadPlatform (): Promise<void> {
    try {
      const platform = await callWithConfig(getPlatform)
      this.setState({ platform })
    } catch (e) {
      console.debug(`Failed to load platform`, e)
    }
  }

  renderBackButton () {
    const { platform } = this.state
    if (!platform || !platform.website) return

    return (
      <Pane marginTop={majorScale(3)}>
        <BackButton is="a" href={platform.website}>Back to {platform.name}</BackButton>
      </Pane>
    )
  }

  renderConnectors () {
    const { connectors, loaded, search } = this.state
    if (!loaded) {
      return (
        <EmptyCatalog>
          <Spinner margin="auto" />
        </EmptyCatalog>
      )
    }

    const filteredConnectors = connectors.filter(connector => {
      if (!search.length) {
        return true
      }
      return connector.name.toLowerCase().includes(search.toLowerCase()) ||
             (compareTwoStrings(connector.name.toLowerCase(), search.toLowerCase()) > SIMILARITY_MIN)
    })

    if (!filteredConnectors.length) {
      return (
        <EmptyCatalog background="tint1">
          <Heading size={600} textAlign="center">
            <InboxIcon marginRight={majorScale(1)} />
            No Integrations Found
          </Heading>
        </EmptyCatalog>
      )
    }

    return filteredConnectors.map(connector => {
      return (
        <CatalogThumb
          connector={connector}
          key={connector.slug}
          linkTo={this.props.linkTo}
          navigateTo={this.props.navigateTo}
        />
      )
    })
  }

  render () {
    const { search } = this.state
    return (
      <Pane>
        <SearchInput
          marginTop={majorScale(2)}
          placeholder="Search integrations..."
          height={majorScale(6)}
          width="100%"
          onChange={e => this.setState({ search: e.target.value })}
          value={search}
        />
        <Pane
          clearfix
          marginTop={majorScale(3)}
          display="flex"
          flexWrap="wrap"
          marginRight={majorScale(-3)}
          marginBottom={majorScale(-3)}
        >
          {this.renderConnectors()}
        </Pane>
        {this.renderBackButton()}
      </Pane>
    )
  }
}

interface EmptyCatalogProps {
  background?: Colors.background,
  children: React.ReactNode
}

function EmptyCatalog ({ background, children } : EmptyCatalogProps): React.Element {
  return (
    <Card
      flexGrow={1}
      marginRight={majorScale(3)}
      background={background}
      padding={majorScale(2)}
      height={150}
      display="flex"
      flexDirection="column"
      justifyContent="center"
    >
      {children}
    </Card>
  )
}

export default withConfig(Catalog)
