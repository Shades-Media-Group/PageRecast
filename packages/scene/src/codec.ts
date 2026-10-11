import { SCENE_FORMAT, SCENE_VERSION, type RecastFile, type SceneNode } from './types'

/** Clipboard payloads start with this prefix so the plugin can recognise them. */
export const CLIPBOARD_PREFIX = 'pagerecast:1:'
export const FILE_EXTENSION = '.recast'

const GZIP_MAGIC = [0x1f, 0x8b]

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A `.recast` file is gzip-compressed JSON. */
export async function encodeFile(file: RecastFile): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(JSON.stringify(file)), new CompressionStream('gzip'))
}

export async function encodeClipboard(file: RecastFile): Promise<string> {
  return CLIPBOARD_PREFIX + toBase64(await encodeFile(file))
}

export class SceneError extends Error {}

/** Accepts gzip bytes, plain JSON bytes, JSON text or a clipboard payload. */
export async function decode(input: Uint8Array | string): Promise<RecastFile> {
  let bytes: Uint8Array
  if (typeof input === 'string') {
    const text = input.trim()
    if (text.startsWith(CLIPBOARD_PREFIX)) {
      try {
        bytes = fromBase64(text.slice(CLIPBOARD_PREFIX.length))
      } catch {
        throw new SceneError(
          'The clipboard capture is incomplete. Copy it again from the extension.',
        )
      }
    } else {
      return validate(parseJson(text))
    }
  } else {
    bytes = input
  }
  if (bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]) {
    try {
      bytes = await pipe(bytes, new DecompressionStream('gzip'))
    } catch {
      throw new SceneError('This file is damaged and could not be unpacked.')
    }
  }
  return validate(parseJson(new TextDecoder().decode(bytes)))
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new SceneError('This is not a PageRecast capture.')
  }
}

export function validate(value: unknown): RecastFile {
  const file = value as Partial<RecastFile> | null
  if (!file || typeof file !== 'object' || file.format !== SCENE_FORMAT) {
    throw new SceneError('This is not a PageRecast capture.')
  }
  if (typeof file.version !== 'number' || file.version > SCENE_VERSION) {
    throw new SceneError(
      'This capture was made by a newer PageRecast. Update the plugin and try again.',
    )
  }
  if (!Array.isArray(file.captures) || file.captures.length === 0) {
    throw new SceneError('This capture is empty.')
  }
  if (!file.assets || typeof file.assets !== 'object') file.assets = {}
  for (const capture of file.captures) if (capture?.root) checkStates(capture.root)
  return file as RecastFile
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const STATES = new Set(['hover', 'focus', 'active'])
const NUMBERS = ['x', 'y', 'width', 'height', 'rotation', 'opacity']
const ARRAYS = ['fills', 'shadows']

function validOverride(o: unknown): boolean {
  return (
    isObject(o) &&
    NUMBERS.every((k) => o[k] === undefined || Number.isFinite(o[k])) &&
    ARRAYS.every((k) => o[k] === undefined || Array.isArray(o[k]))
  )
}

/** Drops malformed `states` instead of failing the import: the layers still build. */
function checkStates(node: SceneNode) {
  if (node.type !== 'frame') return
  const states: unknown = node.states
  if (
    states !== undefined &&
    !(
      isObject(states) &&
      Object.entries(states).every(
        ([state, overrides]) =>
          STATES.has(state) && isObject(overrides) && Object.values(overrides).every(validOverride),
      )
    )
  )
    delete node.states
  if (Array.isArray(node.children)) node.children.forEach(checkStates)
}
