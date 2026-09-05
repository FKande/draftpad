import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export async function getUploadUrl(key: string, mimeType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    ContentType: mimeType,
  })

  return getSignedUrl(s3, command, { expiresIn: 300 })
}

export async function getObjectMetadata(key: string) {

  const command = new HeadObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key
  })

  const response = await s3.send(command)

  const size = response.ContentLength
  const contentType = response.ContentType

  if (size === undefined || contentType === undefined) {
    throw new Error('S3 object metadata is incomplete')
  }

  return {size, contentType}
}

export async function deleteObject(s3Key: string) {

  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: s3Key
  })

  await s3.send(command)

}


export async function getDownloadUrl(s3Key: string) {

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: s3Key
  })

  return getSignedUrl(s3, command, { expiresIn: 300 })

}
