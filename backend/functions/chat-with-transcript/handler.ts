import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand
} from "@aws-sdk/client-bedrock-agent-runtime";
import { z } from "zod";
import { JSONParserSchema } from "../lib/schema.ts";

const client = new BedrockAgentRuntimeClient({});

const BodySchema = JSONParserSchema.pipe(
  z.object({
    text: z.string()
  })
);

const PathParametersSchema = z.object({
  id: z.string()
});

export const handler: APIGatewayProxyHandlerV2 = async ({
  body,
  pathParameters
}) => {
  const parsedPathParameters = PathParametersSchema.safeParse(pathParameters);
  if (!parsedPathParameters.success) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Malformed path parameters",
        errors: parsedPathParameters.error.flatten()
      })
    };
  }

  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Malformed body",
        errors: parsedBody.error.flatten()
      })
    };
  }

  const result = await client.send(
    new RetrieveAndGenerateCommand({
      input: {
        text: parsedBody.data.text
      },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
          modelArn: process.env.MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
              filter: {
                equals: {
                  key: "source",
                  value: parsedPathParameters.data.id
                }
              }
            }
          }
        }
      }
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ text: result.output?.text })
  };
};
