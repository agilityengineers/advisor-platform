import { Link } from "wouter";
import { Button } from "@/components/ui";

export function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-6 text-center">
      <div className="font-display text-[64px] font-bold leading-none text-line">404</div>
      <h1 className="mt-4 font-display text-[22px] font-bold text-navy">That page isn't here</h1>
      <p className="mt-2 text-body">Check the address, or head back to the start.</p>
      <Link href="/" className="mt-6">
        <Button variant="secondary">Go home</Button>
      </Link>
    </main>
  );
}
