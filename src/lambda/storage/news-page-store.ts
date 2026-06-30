import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { formatTokyoDateParts } from "../shared/date.js";

const s3Client = new S3Client({});

/** 生成済みニュース HTML を S3 に保存し、公開 URL を返却 */
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

/** 日付別ニュース HTML の S3 object key 生成 */
export function createNewsHtmlKey(date: Date): string {
  const { year, month, day } = formatTokyoDateParts(date);
  return `news/${year}/${month}/${day}/index.html`;
}
