import loaderUtils from 'next/dist/compiled/loader-utils'
import sizeOf from 'image-size'
import { processBuffer } from '../../../server/lib/squoosh/main'

const BLUR_IMG_SIZE = 8
const BLUR_QUALITY = 70
const VALID_BLUR_EXT = ['jpeg', 'png', 'webp']

function nextImageLoader(content) {
  const imageLoaderSpan = this.currentTraceSpan.traceChild('next-image-loader')
  return imageLoaderSpan.traceAsyncFn(async () => {
    const isServer = loaderUtils.getOptions(this).isServer
    const context = this.rootContext
    const opts = { context, content }
    const interpolatedName = loaderUtils.interpolateName(
      this,
      '/static/image/[path][name].[hash].[ext]',
      opts
    )

    let extension = loaderUtils.interpolateName(this, '[ext]', opts)
    if (extension === 'jpg') {
      extension = 'jpeg'
    }

    const imageSizeSpan = imageLoaderSpan.traceChild('image-size-calculation')
    const imageSize = imageSizeSpan.traceFn(() => sizeOf(content))
    let blurDataURL
    if (VALID_BLUR_EXT.includes(extension)) {
      // Shrink the image's largest dimension
      const resizeOperationOpts =
        imageSize.width >= imageSize.height
          ? { type: 'resize', width: BLUR_IMG_SIZE }
          : { type: 'resize', height: BLUR_IMG_SIZE }

      const resizeImageSpan = imageLoaderSpan.traceChild('image-resize')
      const resizedImage = await resizeImageSpan.traceAsyncFn(() =>
        processBuffer(content, [resizeOperationOpts], extension, BLUR_QUALITY)
      )
      const blurDataURLSpan = imageLoaderSpan.traceChild(
        'image-base64-tostring'
      )
      blurDataURL = blurDataURLSpan.traceFn(
        () =>
          `data:image/${extension};base64,${resizedImage.toString('base64')}`
      )
    }

    const stringifiedData = imageLoaderSpan
      .traceChild('image-data-stringify')
      .traceFn(() =>
        JSON.stringify({
          src: '/_next' + interpolatedName,
          height: imageSize.height,
          width: imageSize.width,
          blurDataURL,
        })
      )

    if (!isServer) {
      this.emitFile(interpolatedName, content, null)
    }

    return `export default ${stringifiedData};`
  })
}
export const raw = true
export default nextImageLoader
