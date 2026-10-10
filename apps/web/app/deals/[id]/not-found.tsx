import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function DealNotFound() {
  return (
    <main className="on-page theme-buyer mx-auto max-w-lg px-4 pb-20 text-center">
      <div className="flex min-h-14 items-center justify-end">
        <ThemeToggle />
      </div>
      <h1 className="mt-12 text-2xl font-bold text-navy">No deal at this link</h1>
      <p className="mt-2 text-sm text-muted">Demo deals live in server memory and are gone after a restart. Start a new one from the home page.</p>
      <Link href="/" className={`${buttonClass("primary")} mt-6`}>
        Back to Pay Pals
      </Link>
    </main>
  );
}
