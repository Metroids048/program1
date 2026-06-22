export type AppRoute =
  | { name: "home"; path: "/" }
  | { name: "live"; path: "/live" }
  | { name: "mock"; path: "/mock" }
  | { name: "jd"; path: "/jd" }
  | { name: "questions"; path: "/questions" }
  | { name: "resume"; path: "/resume" }
  | { name: "records"; path: "/records" }
  | { name: "recordDetail"; path: `/records/${string}`; recordId: string }
  | { name: "authLogin"; path: "/auth/login" }
  | { name: "authRegister"; path: "/auth/register" }
  | { name: "onboarding"; path: "/onboarding" }
  | { name: "growth"; path: "/growth" }
  | { name: "account"; path: "/account" }
  | { name: "legalTerms"; path: "/legal/terms" }
  | { name: "legalPrivacy"; path: "/legal/privacy" };

export function parseRoute(pathname: string): AppRoute {
  if (pathname === "/live") return { name: "live", path: "/live" };
  if (pathname === "/mock") return { name: "mock", path: "/mock" };
  if (pathname === "/jd") return { name: "jd", path: "/jd" };
  if (pathname === "/questions") return { name: "questions", path: "/questions" };
  if (pathname === "/resume") return { name: "resume", path: "/resume" };
  if (pathname === "/records") return { name: "records", path: "/records" };
  if (pathname === "/auth/login") return { name: "authLogin", path: "/auth/login" };
  if (pathname === "/auth/register") return { name: "authRegister", path: "/auth/register" };
  if (pathname === "/onboarding") return { name: "onboarding", path: "/onboarding" };
  if (pathname === "/growth") return { name: "growth", path: "/growth" };
  if (pathname === "/account") return { name: "account", path: "/account" };
  if (pathname === "/legal/terms") return { name: "legalTerms", path: "/legal/terms" };
  if (pathname === "/legal/privacy") return { name: "legalPrivacy", path: "/legal/privacy" };
  if (pathname.startsWith("/records/")) {
    const recordId = decodeURIComponent(pathname.slice("/records/".length));
    return { name: "recordDetail", path: `/records/${recordId}`, recordId };
  }
  return { name: "home", path: "/" };
}

export function navigateTo(path: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const method = options?.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
