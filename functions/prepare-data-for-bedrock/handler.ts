import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});

type Input = {};

export const handler = async () => {
  const transcriptFile = await s3Client.send(
    new GetObjectCommand({
      Bucket: "",
      Key: ""
    })
  );
};
