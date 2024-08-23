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

    **After doing some research, I came to the conclusion that it is impossible to rename the name of the output file**. I can specify the s3 location, but I can't do anything about the filename. That sucks, as I need to create the `FILENAME.metadata.json` file for Amazon Bedrock to scope query results via filters.

    **It looks like I will need to use AWS Lambda Function** to create the metadata file and to extract the transcripts from the AWS Transcribe results.

    **You can find the "Athena `UNLOAD` approach** on [this branch](https://github.com/WojciechMatuszewski/bedrock-video-rag/tree/athena-unload).

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

- When chatting with the knowledge base, you can use [_RetrievalFilters_](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_RetrievalFilter.html) on the metadata to **scope down the answers to be backed by specific asset in the knowledge base**.

- The `.sync` tasks in _Step Functions_ are really useful.

  - If the service you are using does not support those, you have to build "waiter loops" which is not that fun.

  - **Imagine if we could "pause" the state machine and wait for some _EventBridge_ event to happen**. That would be so awesome.

- I got a bit confused when it comes to the `.metadata.json` file and filtering.

  - At first, I though that I can specify the filtering based on the values I see in Pinecone console. But doing so, did not work – the bot could not retrieve the right information.

  - **[This great blog post](https://aws.amazon.com/blogs/machine-learning/knowledge-bases-for-amazon-bedrock-now-supports-metadata-filtering-to-improve-retrieval-accuracy/) cleared a lot of things for me**.

    - One has to use `XXX.metadata.json` file with certain format alongside the "data" file.

      - **The _prefix_ for the `.metadata.json` has to be the complete name of the file alongside the extension**.

        - Keep in mind that the "data" file does not have to have an extension.
