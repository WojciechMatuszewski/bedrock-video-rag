"use client";
import { chatWithTranscriptAction } from "@/lib/network";
import { useParams } from "next/navigation";
import { useFormState } from "react-dom";

export default function TranscriptPage() {
  const { id } = useParams();
  const [state, action] = useFormState(chatWithTranscriptAction, []);

  return (
    <div>
      <ul>
        {state.map((item, index) => {
          return <li key={index}>{item.text}</li>;
        })}
      </ul>
      <form action={action}>
        <fieldset>
          <textarea name="text" id="text"></textarea>
          <input type="hidden" name="transcriptId" value={id} />
          <button type="submit">Submit</button>
        </fieldset>
      </form>
    </div>
  );
}
