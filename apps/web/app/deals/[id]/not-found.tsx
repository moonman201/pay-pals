import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function DealNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-navy">No deal at this link</h1>
      <p className="mt-2 text-sm text-muted">Demo deals live in server memory and are gone after a restart. Start a new one from the home page.</p>
      <Link href="/" className={`${buttonClass("primary")} mt-6`}>
        Back to Pay Pals
      </Link>
    </main>
  );
}
