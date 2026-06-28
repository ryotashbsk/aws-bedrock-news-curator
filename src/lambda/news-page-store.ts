import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { formatTokyoDateParts } from "./date.js";

const s3Client = new S3Client({});

export async function uploadNewsHtml(input: {
  readonly bucketName: string;
  readonly publicBaseUrl: string;
  readonly date: Date;
  readonly html: string;
}): Promise<string> {
  const key = createNewsHtmlKey(input.date);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: input.bucketName,
      Key: key,
      Body: input.html,
      ContentType: "text/html; charset=utf-8",
      CacheControl: "public, max-age=300",
    }),
  );

  return `${input.publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export function createNewsHtmlKey(date: Date): string {
  const { year, month, day } = formatTokyoDateParts(date);
  return `news/${year}/${month}/${day}/index.html`;
}
