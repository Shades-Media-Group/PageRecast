import type { Asset, RecastFile } from './types'

/**
 * Joins several captures into one file so a single paste imports every frame.
 * Capture and asset ids get a per-file prefix so they stay unique, and each
 * frame label names its page so the plugin can tell them apart.
 */
export function mergeFiles(files: RecastFile[]): RecastFile {
  if (files.length === 1) return files[0]!
  const assets: Record<string, Asset> = {}
  const captures = files.flatMap((file, index) => {
    const prefix = `p${index + 1}-`
    for (const [id, asset] of Object.entries(file.assets)) assets[prefix + id] = asset
    const page = file.source.title || file.source.url
    return file.captures.map((capture) => ({
      ...JSON.parse(
        JSON.stringify(capture, (key, value) =>
          (key === 'asset' || key === 'screenshot') && typeof value === 'string'
            ? prefix + value
            : value,
        ),
      ),
      id: prefix + capture.id,
      label: page ? `${page} · ${capture.label}` : capture.label,
    }))
  })
  const [first] = files
  const fontSources = Object.assign({}, ...files.map((f) => f.fontSources ?? {}))
  return {
    ...first!,
    source: { ...first!.source, title: `${files.length} pages` },
    captures,
    assets,
    ...(Object.keys(fontSources).length ? { fontSources } : {}),
  }
}
