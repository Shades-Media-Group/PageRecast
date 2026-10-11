import { toBase64, type RecastFile } from '@pagerecast/scene'
import type { LineupFrame } from '@pagerecast/ui'
import type { HistoryEntry } from '../store'

/** A history entry plus a small crop of every frame it holds. */
export type Entry = HistoryEntry & { frames?: LineupFrame[] }

const THUMB_WIDTH = 480

/**
 * The top of each frame's own screenshot, one viewport tall, as a small JPEG:
 * what the result and the history list show instead of a drawing.
 */
export async function frameThumbs(file: RecastFile): Promise<LineupFrame[]> {
  return Promise.all(
    file.captures.map(async (capture) => {
      const height = Math.round(Math.min(capture.viewport.height, capture.height))
      const frame: LineupFrame = {
        width: capture.viewport.width,
        theme: capture.theme,
        height,
        label: capture.label,
      }
      const asset = capture.screenshot ? file.assets[capture.screenshot] : undefined
      if (asset?.kind !== 'image' || !asset.data) return frame
      try {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:${asset.mime};base64,${asset.data}`)).blob(),
        )
        const ratio = bitmap.width / capture.width
        const sourceHeight = Math.min(bitmap.height, height * ratio)
        const width = Math.min(THUMB_WIDTH, bitmap.width)
        const scale = width / bitmap.width
        const canvas = new OffscreenCanvas(width, Math.max(1, Math.round(sourceHeight * scale)))
        canvas
          .getContext('2d')!
          .drawImage(bitmap, 0, 0, bitmap.width, sourceHeight, 0, 0, canvas.width, canvas.height)
        bitmap.close()
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
        frame.src = `data:image/jpeg;base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`
      } catch {
        // A frame without its crop is drawn as an empty frame.
      }
      return frame
    }),
  )
}
