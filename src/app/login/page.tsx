import { sanitizeReturnTo } from "@/lib/auth/oidc";

const ERRORS: Record<string, string> = {
  state: "Your sign-in session expired or was invalid. Please try again.",
  auth: "We couldn't verify your identity. Please try again.",
  access_denied: "Sign-in was cancelled.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = sanitizeReturnTo(sp.returnTo);
  const href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const error = sp.error ? (ERRORS[sp.error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-sm rounded-xl border p-8 text-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1 className="font-bold text-2xl mb-1" style={{ color: "var(--primary)" }}>
          Job<span style={{ color: "var(--accent)" }}>Flow</span>
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Tailored resumes + application tracking
        </p>
        {error && (
          <p className="text-sm mb-4 rounded-md px-3 py-2" style={{ background: "#fef2f2", color: "#b91c1c" }}>
            {error}
          </p>
        )}
        <a
          href={href}
          className="block w-full rounded-md px-4 py-2.5 font-medium text-white hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Sign in with Authentik
        </a>
      </div>
    </div>
  );
}
