import Image from "next/image";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { isSetupNeeded } from "@/lib/dashboard/setup";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Only reachable during the empty-account window -- once the first
  // account exists, this page has nothing left to do.
  if (!(await isSetupNeeded())) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 rounded-2xl bg-white px-6 py-5 shadow-lg shadow-black/30">
              <Image
                src="/cinc/logo.png"
                alt="Cinc"
                width={84}
                height={94}
                priority
                unoptimized
              />
            </div>
            <h1 className="text-lg font-medium tracking-tight text-text">dashboard setup</h1>
            <p className="mt-1 text-sm text-muted">
              Create the first Platform Admin account using the one-time token
              printed to the server&apos;s log at startup.
            </p>
          </div>
          <SetupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
