import { getTranscripts } from "@/lib/network";
import Link from "next/link";

export default async function Home() {
  const transcripts = await getTranscripts();

  return (
    <section>
      <h2 className="m-0">Available transcripts</h2>
      <ul className={"flex flex-col gap-[6px] ml-[-12px]"}>
        {transcripts.map((transcript) => {
          return (
            <li key={transcript.id} className={""}>
              <Link className={"link"} href={`/transcript/${transcript.id}`}>
                {transcript.fileName}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
