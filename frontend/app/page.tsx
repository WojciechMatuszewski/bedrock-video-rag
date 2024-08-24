import { getTranscripts } from "@/lib/network";
import Link from "next/link";

export default async function Home() {
  const transcripts = await getTranscripts();

  return (
    <ul>
      {transcripts.map((transcript) => {
        return (
          <li key={transcript.id}>
            <Link href={`/transcript/${transcript.id}`}>
              {transcript.fileName}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
