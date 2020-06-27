'use strict'

const execa = require('execa')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const probe = require('ffmpeg-probe')
const rmfr = require('rmfr')
const tempy = require('tempy')

const noop = () => { }

module.exports = async (opts) => {
  const {
    log = noop,

    // general output options
    quality = 2,
    width,
    height,
    input,
    output,

    numFrames,
    numFramesPercent = 0.05,

    // image strip options
    padding = 0,
    margin = 0,
    cols,
    rows = 1,
    color,

    // gif options
    gifski = {
      fps: 10,
      quality: 80,
      fast: false
    }
  } = opts

  const info = await probe(input)
  const numFramesTotal = parseInt(info.streams[0].nb_frames)
  const ext = path.extname(output).slice(1).toLowerCase()
  const isGIF = (ext === 'gif')

  let numFramesToCapture = numFrames || numFramesPercent * numFramesTotal
  if (!isGIF && rows > 0 && cols > 0) {
    numFramesToCapture = rows * cols
  }
  numFramesToCapture = Math.max(1, Math.min(numFramesTotal, numFramesToCapture)) | 0
  const nthFrame = (numFramesTotal / numFramesToCapture) | 0

  const tempDir = isGIF && tempy.directory()
  const tempOutput = isGIF
    ? path.join(tempDir, 'frame-%d.png')
    : output

  const result = {
    output,
    numFrames: numFramesToCapture
  }

  await new Promise((resolve, reject) => {
    let scale = null
    let tile = null

    if (width && height) {
      result.width = width | 0
      result.height = height | 0
      scale = `scale=${width}:${height}`
    } else if (width) {
      result.width = width | 0
      result.height = (info.height * width / info.width) | 0
      scale = `scale=${width}:-1`
    } else if (height) {
      result.height = height | 0
      result.width = (info.width * height / info.height) | 0
      scale = `scale=-1:${height}`
    } else {
      result.width = info.width
      result.height = info.height
    }

    if (!isGIF) {
      const numRows = Math.max(1, rows | 0)
      const numCols = Math.max(1, Math.ceil(cols || numFramesToCapture / numRows))

      tile = [
        `tile=${numCols}x${numRows}`,
        padding && `padding=${padding}`,
        margin && `margin=${margin}`,
        color && `color=${color}`
      ].filter(Boolean).join(':')

      result.rows = numRows
      result.cols = numCols
      result.padding = padding
      result.margin = margin
    }

    const filter = [
      `select=not(mod(n\\,${nthFrame}))`,
      scale,
      tile
    ].filter(Boolean).join(',')

    ffmpeg(input)
      .outputOptions(isGIF ? [
        '-vsync', 'vfr'
      ] : [
        '-vframes', 1
      ])
      .outputOptions([
        '-q:v', quality,
        '-vf', filter
      ])
      .output('/tmp/1210ec2361654445d9a760a48bc70c24/frame-%d.png')
      .on('start', (cmd) => log && log({ cmd }))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })


  return result
}
