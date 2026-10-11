// Type-checks the published `pagerecast` declarations the way an npm consumer sees them.
import { capture, decode, encode, info, tokens, type CaptureOptions } from 'pagerecast'

const options: CaptureOptions = { widths: [1440, 390], theme: 'both' }
const file = await capture('e2e/fixtures/kitchen-sink.html', options)
const bytes: Uint8Array = await encode(file)
const back = await decode(bytes)
const css: string = tokens(back, 'css')
const layers: number = info(back).captures[0]!.layers
console.log(JSON.stringify({ css: css.length, layers, root: back.captures[0]!.root.type }))
