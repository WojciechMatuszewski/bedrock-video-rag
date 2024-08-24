import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb"; // ES6 import
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"; // ES6 import
import { z } from "zod";

const client = DynamoDBDocumentClient.from(new DynamoDB({}));

const DBTranscriptSchema = z.array(
  z
    .object({
      sk: z.string(),
      fileName: z.string()
    })
    .transform((data) => {
      return {
        id: data.sk,
        fileName: data.fileName
      };
    })
);

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const { Items = [] } = await client.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeValues: {
        ":pk": "transcription"
      },
      ExpressionAttributeNames: {
        "#pk": "pk"
      }
    })
  );
  const parsedData = DBTranscriptSchema.safeParse(Items);
  if (!parsedData.success) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Malformed entries",
        errors: parsedData.error.flatten()
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ transcripts: parsedData.data })
  };
};
