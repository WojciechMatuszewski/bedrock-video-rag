import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { JSONParserSchema } from "../lib/schema.ts";

const s3Client = new S3Client({});

type Input = {
  transcriptFilePath: string;
  transcriptFileId: string;
  bucketName: string;
};

const TranscriptFileSchema = z.object({
  results: z.object({
    transcripts: z.array(z.object({ transcript: z.string() }))
  })
});

const TranscriptFileS3Schema = JSONParserSchema.pipe(TranscriptFileSchema);

export const handler = async ({
  bucketName,
  transcriptFilePath,
  transcriptFileId
}: Input) => {
  const transcriptFile = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: transcriptFilePath
    })
  );
  if (!transcriptFile.Body) {
    console.warn("No body in fetched data");
    return;
  }

  const fileContent = await transcriptFile.Body.transformToString();
  const parsedFileContent = TranscriptFileS3Schema.safeParse(fileContent);
  if (!parsedFileContent.success) {
    console.warn("Failed to parse the file", parsedFileContent.error.flatten());
    return;
  }

  const {
    data: {
      results: { transcripts }
    }
  } = parsedFileContent;

  const combinedTranscriptsChunks = transcripts
    .map(({ transcript }) => transcript)
    .join("");

  const transcriptDataPath = `data/${transcriptFileId}`;
  const transcriptMetadataPath = `data/${transcriptFileId}.metadata.json`;

  await Promise.all([
    s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: transcriptDataPath,
        Body: combinedTranscriptsChunks
      })
    ),
    s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: transcriptMetadataPath,
        Body: JSON.stringify({
          metadataAttributes: {
            source: transcriptFileId
          }
        })
      })
    )
  ]);
};
