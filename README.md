# Bedrock Video RAG

> Based on [this blog post](https://levelup.gitconnected.com/using-rag-on-media-content-with-bedrock-knowledge-bases-and-amazon-transcribe-92abea166e68)

## Learnings

- Using the `qualifier` option is a neat way to distinguish between different bootstraps for different stacks.

  - I could not find any way to have a _central place_ to put the `qualifier` option in.

    - I have to specify it when running the `bootstrap` command and also have it defined in the code via `qualifier` property on the `DefaultStackSynthesizer`. Not ideal

- The S3 events are sent to the _default_ EventBridge bus.

- Transforming S3 files and saving them to a new location is surprisingly involved.

  - You can use AWS Athena in conjunction with AWS Glue.

    - First, you have to create a database in AWS Glue.

    - Then, you can use that database to query the S3 via AWS Athena.

    - By default, AWS Athena will save the query results in `.csv` format. You can change the format [via the `UNLOAD` statement].

- **You can extract and save AWS Athena query results to another S3 bucket**.

  - I came up with the following query for getting `transcript` property from `transcriptions` array.

    ```sql
    UNLOAD(
      select
          array_join(array_agg(transcriptItem.transcript), '') as fullTranscription
      from
          transcriptions
      CROSS JOIN UNNEST(results.transcripts) as t(transcriptItem)
    )
    TO 'your bucket here'
    with (format = 'TEXTFILE', compression = 'NONE')
    ```

    Notice that I can even specify the format in which to save the results. Pretty neat!

- While working on similar workflow a while back, [I was executing the AWS Athena query directly](https://github.com/WojciechMatuszewski/serverless-video-transcribe-fun/blob/main/lib/serverless-transcribe-stack.ts#L343).

  - I found a blog post where [they create a _"Prepared statement"_](https://aws.amazon.com/blogs/compute/building-a-low-code-speech-you-know-counter-using-aws-step-functions/) first, then execute it in the context of a workgroup.

    - Here [is the link to the code this blog post is based on](https://github.com/aws-samples/aws-stepfunctions-examples/blob/main/sam/app-low-code-you-know-counter/template.yaml#L245).

- **I had issues querying _formatted_ `.json` files in AWS Athena**.

  - Athena complained that the file is malformed, but it was valid JSON, just with extra whitespace (formatted via `Prettier`).

- The Amazon Bedrock service is still unavailable for Ireland region. Interesting that it takes Amazon so long to enable this service for most regions.

- **When building the Amazon Bedrock knowledge base** the _format_ of the **value held in the secrets manager for the Pinecone API key needed to be `apiKey: VALUE`**.

  - I wonder why such constraint. Why not accept the _value_ of the secret as the _apiKey_?

- When syncing the knowledge base, **I was hitting errors saying that the _vector database encountered an error_**

  - It turns out, **there was a mismatch between the _dimensions_ setting I had in Pinecone and Bedrock**!
