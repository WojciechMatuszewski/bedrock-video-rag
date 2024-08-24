"use client";

import { chatWithTranscriptAction } from "@/lib/network";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useActionState } from "react";

export default function TranscriptPage() {
  const { id: transcriptId } = useParams();
  const [state, action, isPending] = useActionState(
    chatWithTranscriptAction,
    []
  );

  return (
    <div>
      <Link href={"/"} className={"mb-[12px] block underline"}>
        Go back
      </Link>
      <div className={"flex flex-col gap-[40px]"}>
        <ul className={"flex flex-col gap-[6px]"}>
          {state.map((item, index) => {
            return <li key={index}>{item.text}</li>;
          })}
        </ul>
        <form action={action} className={"flex flex-col gap-[6px] items-start"}>
          {isPending && <p>Loading...</p>}
          <fieldset>
            <textarea className={"border"} name="text" id="text"></textarea>
            <input type="hidden" name="transcriptId" value={transcriptId} />
          </fieldset>
          <button className={"border"} type="submit">
            Submit
          </button>
        </form>
      </div>
    </div>
  );
}
