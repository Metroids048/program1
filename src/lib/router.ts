export type AppRoute =
  | { name: "home"; path: "/" }
  | { name: "live"; path: "/live" }
  | { name: "mock"; path: "/mock" }
  | { name: "jd"; path: "/jd" }
  | { name: "questions"; path: "/questions" }
  | { name: "resume"; path: "/resume" }
  | { name: "records"; path: "/records" }
  | { name: "recordDetail"; path: `/records/${string}`; recordId: string }
  | { name: "authLogin"; path: "/auth/login"; returnTo?: string }
  | { name: "authRegister"; path: "/auth/register"; returnTo?: string }
  | { name: "forgotPassword"; path: "/forgot-password" }
  | { name: "resetPassword"; path: "/reset-password"; token?: string }
  | { name: "verifyEmail"; path: "/verify-email"; token?: string }
  | { name: "onboarding"; path: "/onboarding" }
  | { name: "account"; path: "/account" }
  | { name: "legalTerms"; path: "/legal/terms" }
  | { name: "legalPrivacy"; path: "/legal/privacy" }
  | { name: "termsOfService"; path: "/terms-of-service" }
  | { name: "privacyPolicy"; path: "/privacy-policy" }
  | { name: "notFound"; path: "/404" }
  | { name: "serverError"; path: "/500" };

export function parseRoute(pathname: string): AppRoute {
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  if (pathname === "/live") return { name: "live", path: "/live" };
  if (pathname === "/mock") return { name: "mock", path: "/mock" };
  if (pathname === "/jd") return { name: "jd", path: "/jd" };
  if (pathname === "/questions") return { name: "questions", path: "/questions" };
  if (pathname === "/resume") return { name: "resume", path: "/resume" };
  if (pathname === "/records") return { name: "records", path: "/records" };
  if (pathname === "/auth/login") return { name: "authLogin", path: "/auth/login", returnTo: search.get("returnTo") ?? undefined };
  if (pathname === "/auth/register") return { name: "authRegister", path: "/auth/register", returnTo: search.get("returnTo") ?? undefined };
  if (pathname === "/forgot-password") return { name: "forgotPassword", path: "/forgot-password" };
  if (pathname === "/reset-password") return { name: "resetPassword", path: "/reset-password", token: search.get("token") ?? undefined };
  if (pathname === "/verify-email") return { name: "verifyEmail", path: "/verify-email", token: search.get("token") ?? undefined };
  if (pathname === "/onboarding") return { name: "onboarding", path: "/onboarding" };
  if (pathname === "/account") return { name: "account", path: "/account" };
  if (pathname === "/legal/terms") return { name: "legalTerms", path: "/legal/terms" };
  if (pathname === "/legal/privacy") return { name: "legalPrivacy", path: "/legal/privacy" };
  if (pathname === "/terms-of-service") return { name: "termsOfService", path: "/terms-of-service" };
  if (pathname === "/privacy-policy") return { name: "privacyPolicy", path: "/privacy-policy" };
  if (pathname === "/404") return { name: "notFound", path: "/404" };
  if (pathname === "/500") return { name: "serverError", path: "/500" };
  if (pathname.startsWith("/records/")) {
    const recordId = decodeURIComponent(pathname.slice("/records/".length));
    return { name: "recordDetail", path: `/records/${recordId}`, recordId };
  }
  return pathname === "/" ? { name: "home", path: "/" } : { name: "notFound", path: "/404" };
}

export function navigateTo(path: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const method = options?.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
