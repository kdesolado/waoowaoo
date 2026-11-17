import { runFfmpegCommand } from './ffmpeg-command'

export const SLIDESHOW_FPS = 30

export type SlideshowMotion = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right'

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`SLIDESHOW_${name}_INVALID`)
}

function zoomExpression(motion: SlideshowMotion): string {
  if (motion === 'zoom_out') return "max(1.0,1.12-on*0.0008)"
  return "min(1.12,1.0+on*0.0008)"
}

function xExpression(motion: SlideshowMotion, frameCount: number): string {
  if (motion === 'pan_left') return `max(0,(iw-iw/zoom)*(1-on/${String(frameCount)}))`
  if (motion === 'pan_right') return `max(0,(iw-iw/zoom)*(on/${String(frameCount)}))`
  return "max(0,(iw-iw/zoom)/2)"
}

/**
 * Turns one approved still into a frame-accurate H.264 clip.  It uses only
 * FFmpeg filters: no image-to-video or motion-generation model is involved.
 */
export async function renderSlideshowImageClip(input: {
  readonly sourcePath: string
  readonly outputPath: string
  readonly width: number
  readonly height: number
  readonly durationSeconds: number
  readonly motion: SlideshowMotion
}): Promise<void> {
  assertFinitePositive(input.width, 'WIDTH')
  assertFinitePositive(input.height, 'HEIGHT')
  assertFinitePositive(input.durationSeconds, 'DURATION')
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width % 2 || input.height % 2) {
    throw new Error('SLIDESHOW_DIMENSIONS_INVALID')
  }
  const frameCount = Math.max(1, Math.round(input.durationSeconds * SLIDESHOW_FPS))
  const filter = [
    `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase`,
    `crop=${input.width}:${input.height}`,
    `zoompan=z='${zoomExpression(input.motion)}':x='${xExpression(input.motion, frameCount)}':y='max(0,(ih-ih/zoom)/2)':d=1:s=${input.width}x${input.height}:fps=${SLIDESHOW_FPS}`,
    `trim=end_frame=${frameCount}`,
    'setpts=PTS-STARTPTS',
    'format=yuv420p',
    'setsar=1',
  ].join(',')
  await runFfmpegCommand('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', String(SLIDESHOW_FPS),
    '-i', input.sourcePath,
    '-frames:v', String(frameCount),
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-movflags', '+faststart',
    input.outputPath,
  ], {
    stage: 'workspace_resource_slideshow_render',
    expectedDurationSeconds: frameCount / SLIDESHOW_FPS,
  })
}
