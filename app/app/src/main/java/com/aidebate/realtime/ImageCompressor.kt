package com.aidebate.realtime

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.math.max

data class CompressedImageResult(
    val base64Data: String,
    val thumbnailBitmap: Bitmap,
    val sizeInBytes: Int
)

object ImageCompressor {

    private const val MAX_DIMENSION = 1280
    private const val JPEG_QUALITY = 85

    suspend fun compressUri(context: Context, uri: Uri): CompressedImageResult? = withContext(Dispatchers.IO) {
        try {
            val contentResolver = context.contentResolver

            // 1. Read bounds and orientation
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, options)
            }

            if (options.outWidth <= 0 || options.outHeight <= 0) {
                return@withContext null
            }

            // 2. Read Exif orientation
            var orientation = ExifInterface.ORIENTATION_NORMAL
            try {
                contentResolver.openInputStream(uri)?.use { stream ->
                    val exif = ExifInterface(stream)
                    orientation = exif.getAttributeInt(
                        ExifInterface.TAG_ORIENTATION,
                        ExifInterface.ORIENTATION_NORMAL
                    )
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // 3. Compute sample size
            val maxEdge = max(options.outWidth, options.outHeight)
            var inSampleSize = 1
            while (maxEdge / inSampleSize > MAX_DIMENSION * 1.5) {
                inSampleSize *= 2
            }

            // 4. Decode actual bitmap with inSampleSize
            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val rawBitmap: Bitmap = contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOptions)
            } ?: return@withContext null

            // 5. Apply rotation if needed
            val rotatedBitmap = rotateBitmapIfRequired(rawBitmap, orientation)

            // 6. Scale down if longest edge > MAX_DIMENSION
            val currentMax = max(rotatedBitmap.width, rotatedBitmap.height)
            val finalBitmap = if (currentMax > MAX_DIMENSION) {
                val scale = MAX_DIMENSION.toFloat() / currentMax
                val targetW = (rotatedBitmap.width * scale).toInt()
                val targetH = (rotatedBitmap.height * scale).toInt()
                Bitmap.createScaledBitmap(rotatedBitmap, targetW, targetH, true).also {
                    if (it != rotatedBitmap && !rotatedBitmap.isRecycled) {
                        rotatedBitmap.recycle()
                    }
                }
            } else {
                rotatedBitmap
            }

            // 7. Compress to JPEG
            val baos = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            val jpegBytes = baos.toByteArray()
            val base64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

            // 8. Generate a lightweight thumbnail (160px max edge) for UI display
            val thumbScale = 160f / max(finalBitmap.width, finalBitmap.height).coerceAtLeast(1)
            val thumbW = (finalBitmap.width * thumbScale).toInt().coerceAtLeast(1)
            val thumbH = (finalBitmap.height * thumbScale).toInt().coerceAtLeast(1)
            val thumbnail = Bitmap.createScaledBitmap(finalBitmap, thumbW, thumbH, true)

            // Clean up main bitmap to free memory
            if (!finalBitmap.isRecycled) {
                finalBitmap.recycle()
            }

            CompressedImageResult(
                base64Data = base64,
                thumbnailBitmap = thumbnail,
                sizeInBytes = jpegBytes.size
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun rotateBitmapIfRequired(bitmap: Bitmap, orientation: Int): Bitmap {
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }
        if (degrees == 0) return bitmap

        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated != bitmap && !bitmap.isRecycled) {
            bitmap.recycle()
        }
        return rotated
    }
}
