export type AppRoute =
  | { name: "home"; path: "/" }
  | { name: "jobs"; path: "/jobs" }
  | { name: "positionDetail"; path: `/jobs/${string}`; positionId: string }
  | { name: "conversation"; path: `/conversations/${string}`; sessionId: string }
  | { name: "live"; path: "/live" }
  | { name: "livePosition"; path: `/live/${string}`; positionId: string }
  | { name: "mock"; path: "/mock" }
  | { name: "mockSetup"; path: `/mock/setup/${string}`; positionId: string }
  | { name: "mockRoom"; path: `/mock/room/${string}`; sessionId: string }
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

  if (pathname === "/" || pathname === "") return { name: "home", path: "/" };
  if (pathname === "/jd") return { name: "jd", path: "/jd" };
  if (pathname === "/questions") return { name: "questions", path: "/questions" };
  if (pathname === "/resume") return { name: "resume", path: "/resume" };
  if (pathname === "/live") return { name: "live", path: "/live" };
  if (pathname === "/mock") return { name: "mock", path: "/mock" };

  // /jobs/:positionId
  if (pathname.startsWith("/jobs/")) {
    const positionId = decodeURIComponent(pathname.slice("/jobs/".length));
    return { name: "positionDetail", path: `/jobs/${positionId}`, positionId };
  }
  if (pathname === "/jobs") return { name: "jobs", path: "/jobs" };

  // /conversations/:sessionId
  if (pathname.startsWith("/conversations/")) {
    const sessionId = decodeURIComponent(pathname.slice("/conversations/".length));
    return { name: "conversation", path: `/conversations/${sessionId}`, sessionId };
  }

  // /live/:positionId
  if (pathname.startsWith("/live/")) {
    const positionId = decodeURIComponent(pathname.slice("/live/".length));
    return { name: "livePosition", path: `/live/${positionId}`, positionId };
  }

  // /mock/setup/:positionId
  if (pathname.startsWith("/mock/setup/")) {
    const positionId = decodeURIComponent(pathname.slice("/mock/setup/".length));
    return { name: "mockSetup", path: `/mock/setup/${positionId}`, positionId };
  }

  // /mock/room/:sessionId
  if (pathname.startsWith("/mock/room/")) {
    const sessionId = decodeURIComponent(pathname.slice("/mock/room/".length));
    return { name: "mockRoom", path: `/mock/room/${sessionId}`, sessionId };
  }

  // /records/:recordId
  if (pathname.startsWith("/records/")) {
    const recordId = decodeURIComponent(pathname.slice("/records/".length));
    return { name: "recordDetail", path: `/records/${recordId}`, recordId };
  }
  if (pathname === "/records") return { name: "records", path: "/records" };

  // auth
  if (pathname === "/auth/login") return { name: "authLogin", path: "/auth/login", returnTo: search.get("returnTo") ?? undefined };
  if (pathname === "/auth/register") return { name: "authRegister", path: "/auth/register", returnTo: search.get("returnTo") ?? undefined };
  if (pathname === "/forgot-password") return { name: "forgotPassword", path: "/forgot-password" };
  if (pathname === "/reset-password") return { name: "resetPassword", path: "/reset-password", token: search.get("token") ?? undefined };
  if (pathname === "/verify-email") return { name: "verifyEmail", path: "/verify-email", token: search.get("token") ?? undefined };

  // onboarding / account / legal
  if (pathname === "/onboarding") return { name: "onboarding", path: "/onboarding" };
  if (pathname === "/account") return { name: "account", path: "/account" };
  if (pathname === "/legal/terms") return { name: "legalTerms", path: "/legal/terms" };
  if (pathname === "/legal/privacy") return { name: "legalPrivacy", path: "/legal/privacy" };
  if (pathname === "/terms-of-service") return { name: "termsOfService", path: "/terms-of-service" };
  if (pathname === "/privacy-policy") return { name: "privacyPolicy", path: "/privacy-policy" };

  // error pages
  if (pathname === "/404") return { name: "notFound", path: "/404" };
  if (pathname === "/500") return { name: "serverError", path: "/500" };

  return { name: "notFound", path: "/404" };
}

export function navigateTo(path: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const method = options?.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
