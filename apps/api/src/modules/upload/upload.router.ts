import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as Minio from 'minio'

const BUCKET = 'titan-uploads'
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
// Только изображения. Расширение берём из MIME, не из имени файла (анти-подмена).
// SVG не допускаем — может содержать активный скрипт.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function getMinioClient() {
  const endpoint = process.env['MINIO_ENDPOINT'] ?? 'minio'
  const port = parseInt(process.env['MINIO_PORT'] ?? '9000')
  const accessKey = process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin'
  const secretKey = process.env['MINIO_SECRET_KEY'] ?? 'minioadmin'
  return new Minio.Client({ endPoint: endpoint, port, useSSL: false, accessKey, secretKey })
}

export const uploadRouter = new Hono<AppEnv>()
uploadRouter.use('*', requireAuth, requireRole('owner', 'staff'))

uploadRouter.post('/image', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'No file provided' }, 400)

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) return c.json({ error: 'Допустимы только изображения: JPEG, PNG, WebP, GIF' }, 400)
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'Файл больше 2 МБ' }, 400)

  const objectName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  try {
    const client = getMinioClient()
    // Ensure bucket exists
    const exists = await client.bucketExists(BUCKET)
    if (!exists) {
      await client.makeBucket(BUCKET)
      await client.setBucketPolicy(BUCKET, JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }],
      }))
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await client.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': file.type })

    const publicUrl = `${process.env['MINIO_PUBLIC_URL'] ?? 'http://localhost:9000'}/${BUCKET}/${objectName}`
    return c.json({ url: publicUrl })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})
