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
      <Link href={"/"} className={"link mb-2 block"}>
        Go back
      </Link>
      <article className={""}>
        <h2 className={"m-0 p-0"}>Chat with transcript</h2>
        <section>
          <h3 className={"m-0 p-0"}>Answers</h3>
          <ul className={"flex flex-col gap-[6px] ml-[-12px]"}>
            {state.map((item, index) => {
              return <li key={index}>{item.text}</li>;
            })}
          </ul>
        </section>
        <section>
          <h3 className={"p-0 m-0"}>Prompt the AI</h3>
          <form action={action} className={""}>
            <fieldset>
              <div className={"form-control"}>
                <label className={"label"} htmlFor={"text"}>
                  <span className={"label-text"}>Your query</span>
                </label>
                <textarea
                  className={"textarea textarea-bordered"}
                  name="text"
                  id="text"
                />
              </div>
              <input type="hidden" name="transcriptId" value={transcriptId} />
              <button className={"btn btn-primary mt-4"} type="submit">
                {isPending ? (
                  <span className={"loading loading-spinner"}>Loading</span>
                ) : null}
                {isPending ? "Submitting" : "Submit"}
              </button>
            </fieldset>
          </form>
        </section>
      </article>
    </div>
  );
}
