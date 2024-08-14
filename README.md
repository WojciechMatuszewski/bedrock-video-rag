# Bedrock Video RAG

> Based on [this blog post](https://levelup.gitconnected.com/using-rag-on-media-content-with-bedrock-knowledge-bases-and-amazon-transcribe-92abea166e68)

## Learnings

- Using the `qualifier` option is a neat way to distinguish between different bootstraps for different stacks.

  - I could not find any way to have a _central place_ to put the `qualifier` option in.

    - I have to specify it when running the `bootstrap` command and also have it defined in the code via `qualifier` property on the `DefaultStackSynthesizer`. Not ideal

- The S3 events are sent to the _default_ EventBridge bus.
