import * as React from 'react'
import * as ReactDOM from 'react-dom'
import unified, { Processor } from 'unified'
import parse from 'remark-parse'
import remark2react from 'remark-react'
import { theme } from './theme'
import {
  Pane,
  Heading,
  Paragraph,
  Link,
  Strong,
  Code,
  OrderedList,
  UnorderedList,
  ListItem,
  ThemeProvider
} from 'evergreen-ui'

// TODO: add full set of markdown html elements
type MarkdownElements =
  | 'code'
  | 'p'
  | 'ul'
  | 'ol'
  | 'li'
  | 'a'
  | 'strong'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'

type RemarkComponents = Record<MarkdownElements, React.Component>

const mediumComponents: RemarkComponents = {
  code: Code,
  p: props => <Paragraph marginTop="default" {...props} />,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  a: Link,
  strong: Strong,
  h1: props => <Heading marginTop="default" size={800} {...props} />,
  h2: props => <Heading marginTop="default" size={700} {...props} />,
  h3: props => <Heading marginTop="default" size={600} {...props} />,
  h4: props => <Heading marginTop="default" size={500} {...props} />,
  h5: props => <Heading marginTop="default" size={400} {...props} />,
  h6: props => <Heading marginTop="default" size={300} {...props} />
}

const largeComponents: RemarkComponents = Object.assign({}, mediumComponents, {
  code: props => <Code size={500} {...props} />,
  p: props => <Paragraph marginTop="default" size={500} {...props} />,
  ul: props => <UnorderedList size={500} {...props} />,
  ol: props => <OrderedList size={500} {...props} />,
  a: props => <Link size={500} {...props} />,
  strong: props => <Strong size={500} {...props} />,
  h1: props => <Heading marginTop="default" size={900} {...props} />,
  h2: props => <Heading marginTop="default" size={800} {...props} />,
  h3: props => <Heading marginTop="default" size={700} {...props} />,
  h4: props => <Heading marginTop="default" size={600} {...props} />,
  h5: props => <Heading marginTop="default" size={500} {...props} />,
  h6: props => <Heading marginTop="default" size={400} {...props} />
})

const smallComponents: RemarkComponents = Object.assign({}, mediumComponents, {
  code: props => <Code size={300} {...props} />,
  p: props => <Paragraph marginTop="default" size={300} {...props} />,
  ul: props => <UnorderedList size={300} {...props} />,
  ol: props => <OrderedList size={300} {...props} />,
  a: props => <Link size={300} {...props} />,
  strong: props => <Strong size={300} {...props} />,
  h1: props => <Heading marginTop="default" size={600} {...props} />,
  h2: props => <Heading marginTop="default" size={500} {...props} />,
  h3: props => <Heading marginTop="default" size={400} {...props} />,
  h4: props => <Heading marginTop="default" size={300} {...props} />,
  h5: props => <Heading marginTop="default" size={200} {...props} />,
  h6: props => <Heading marginTop="default" size={100} {...props} />
})

enum Sizes {
  small = 'small',
  medium = 'medium',
  large = 'large'
}

type Processors = Record<Sizes, Processor>

const ParentProcessor = unified().use(parse)

const PROCESSORS: Processors = {
  [Sizes.small]: ParentProcessor().use(remark2react, { remarkReactComponents: smallComponents}),
  [Sizes.medium]: ParentProcessor().use(remark2react, { remarkReactComponents: mediumComponents}),
  [Sizes.large]: ParentProcessor().use(remark2react, { remarkReactComponents: largeComponents})
}

// Credit: https://github.com/fernandopasik/react-children-utilities/blob/master/src/lib/onlyText.ts
function childToString(child?: React.Element | boolean | {} | null): string {
  if (child == null) {
    return ''
  }

  if (!(child instanceof Array) && !React.isValidElement(child)) {
    if (typeof child === 'object' || typeof child === 'boolean') {
      return ''
    }
  }

  return (child as string | number).toString()
}

function childrenToText(children?: React.Element): string {
  if (!(children instanceof Array) && !React.isValidElement(children)) {
    return childToString(children)
  }

  const stringChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return childrenToText(child.props.children)
    }
    return childToString(child)
  })

  // We are rendering markdown, so we need to preserve line breaks,
  // which we approximate here with separate react children.
  return stringChildren.join('\n')
}

interface MarkdownProps {
  text?: string,
  size?: Sizes,
  children: React.Element
}

export default class Markdown extends React.Component<MarkdownProps> {
  static defaultProps = {
    size: Sizes.medium
  }

  constructor (props: MarkdownProps) {
    super(props)
    if (this.props.text && this.props.children) {
      console.warn(
`The <Markdown> component accepts a \`text\` property, or \`children\` with text content to render.
You have provided both. The \`children\` will be ignored and only the \`text\` will render.`
      )
    }
  }

  render(): React.Element {
    const { text, children, size } = this.props
    const markdownSrc = text ? text : childrenToText(children)
    const processor = PROCESSORS[size]

    return (
      <Pane>
        {processor.processSync(markdownSrc).result}
      </Pane>
    )
  }
}
