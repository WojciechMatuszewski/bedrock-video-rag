"use server";

import { z } from "zod";

const TranscriptsSchema = z.object({
  transcripts: z.array(
    z.object({
      id: z.string(),
      fileName: z.string()
    })
  )
});

export async function getTranscripts() {
  const url = new URL("/transcripts", process.env.API_ROOT_URL);

  const response = await fetch(url);
  const result = await response.json();

  return TranscriptsSchema.parse(result).transcripts;
}

const ChatWithTranscriptSchema = z.object({
  text: z.string()
});

export async function chatWithTranscript({
  transcriptId,
  text
}: {
  transcriptId: string;
  text: string;
}) {
  const url = new URL(
    `/transcript/${transcriptId}/chat`,
    process.env.API_ROOT_URL
  );

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ text })
  });
  const result = await response.json();

  return ChatWithTranscriptSchema.parse(result);
}

export async function chatWithTranscriptAction(
  prevState: Array<{ text: string }>,
  formData: FormData
) {
  const { transcriptId, text } = Object.fromEntries(formData.entries());

  const response = await chatWithTranscript({ transcriptId, text });

  return prevState.concat(response);
}
