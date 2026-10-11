import { keyframes, styled } from '../../tokens/stitches.config'
import { reducedMotion } from './motion'

// Placeholder rows shown while a list loads, shaped like the rows that will
// replace them so nothing jumps when they arrive.

const breathe = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.55 },
})

const List = styled('div', {
  width: '100%',
  border: '1px solid $stLine',
  borderRadius: '$md',
  background: '$stSurface',
  overflow: 'hidden',
  animation: `${breathe} 1.6s ease-in-out infinite`,
  [reducedMotion]: { animation: 'none' },
  '& > * + *': { borderTop: '1px solid $stLine' },
  '@mdDown': { borderRadius: 0, borderLeft: 'none', borderRight: 'none' },
})

const Row = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '16px',
  alignItems: 'center',
  padding: '16px',
})

const Lines = styled('div', { display: 'grid', gap: '9px' })

const Bar = styled('span', {
  display: 'block',
  height: '10px',
  borderRadius: '5px',
  background: '$stSunken',
  variants: {
    title: { true: { height: '14px', borderRadius: '7px' } },
  },
})

const Thumb = styled('span', {
  width: '88px',
  height: '60px',
  borderRadius: '$sm',
  background: '$stSunken',
  '@smDown': { width: '64px', height: '48px' },
})

const WIDTHS = [
  ['72%', '58%', '28%'],
  ['54%', '80%', '22%'],
  ['66%', '49%', '31%'],
  ['80%', '62%', '25%'],
  ['48%', '70%', '20%'],
]

export function ListSkeleton(props: { rows?: number }): JSX.Element {
  const rows = WIDTHS.slice(0, props.rows ?? WIDTHS.length)
  return (
    <List aria-busy="true" aria-label="Loading">
      {rows.map(([title, dek, meta], index) => (
        <Row key={index}>
          <Lines>
            <Bar title style={{ width: title }} />
            <Bar style={{ width: dek }} />
            <Bar style={{ width: meta, height: '8px' }} />
          </Lines>
          <Thumb />
        </Row>
      ))}
    </List>
  )
}
