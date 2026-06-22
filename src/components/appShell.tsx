import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSearch,
  FileText,
  Headphones,
  Menu,
  Mic,
  ScrollText,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { loadUiPrefs, saveUiPrefs } from "../lib/store";

export type PrimaryRouteName = "home" | "live" | "mock" | "jd" | "questions" | "resume" | "records" | "authLogin" | "authRegister" | "onboarding" | "growth" | "account" | "legalTerms" | "legalPrivacy";

type NavItem = {
  id: PrimaryRouteName;
  label: string;
  icon: typeof Headphones;
};

const PRIMARY_NAV: NavItem[] = [
  { id: "home", label: "岗位台", icon: BriefcaseBusiness },
  { id: "live", label: "实时助手", icon: Headphones },
  { id: "mock", label: "模拟面试", icon: Mic },
  { id: "jd", label: "JD 解析", icon: FileSearch },
  { id: "questions", label: "问题库", icon: ScrollText },
  { id: "resume", label: "简历", icon: FileText },
  { id: "records", label: "面试记录", icon: ClipboardList },
  { id: "growth", label: "成长", icon: TrendingUp },
];

const NAV_GROUPS: Array<{ title?: string; items: NavItem[] }> = [
  { title: "面试准备主线", items: PRIMARY_NAV.slice(0, 3) },
  { title: "资料库", items: PRIMARY_NAV.slice(3, 6) },
  { items: PRIMARY_NAV.slice(6, 7) },
  { items: PRIMARY_NAV.slice(7) },
];

const MOBILE_NAV_BREAKPOINT = 760;

function useMobileNav() {
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.innerWidth <= MOBILE_NAV_BREAKPOINT));

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_NAV_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}

export function AppShell({
  activeNav,
  accountName,
  onNavigate,
  onAccount,
  children,
}: {
  activeNav: PrimaryRouteName;
  accountName: string;
  onNavigate: (route: PrimaryRouteName) => void;
  onAccount: () => void;
  children: ReactNode;
}) {
  const isMobile = useMobileNav();
  const [desktopPrefs, setDesktopPrefs] = useState(() => loadUiPrefs());
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const expanded = isMobile ? true : desktopPrefs.desktopSidebarExpanded;

  useEffect(() => {
    if (isMobile) return;
    saveUiPrefs(desktopPrefs);
  }, [desktopPrefs, isMobile]);

  const closeMobileDrawer = () => setMobileDrawerOpen(false);

  const sidebar = (
    <>
      <div className="shell-brand">
        <button className="shell-brand-button" type="button" onClick={() => onNavigate("home")} aria-label="返回岗位台">
          <span className="shell-brand-mark" aria-hidden="true">
            <BriefcaseBusiness size={18} />
          </span>
          {(expanded || isMobile) && (
            <span className="shell-brand-copy">
              <strong>AI 求职台</strong>
              <small>面试准备主线</small>
            </span>
          )}
        </button>
        {!isMobile ? (
          <button
            className="shell-collapse-button"
            type="button"
            onClick={() =>
              setDesktopPrefs((current) => ({
                desktopSidebarExpanded: !current.desktopSidebarExpanded,
                desktopSidebarTouched: true,
              }))
            }
            aria-label={expanded ? "收起侧边栏" : "展开侧边栏"}
          >
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : null}
      </div>

      <nav className="shell-nav" aria-label="主导航">
        {NAV_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.title ?? `group-${groupIndex}`}>
            {groupIndex > 0 ? <div className="shell-nav-divider" aria-hidden="true" /> : null}
            {group.title && (expanded || isMobile) ? <span className="shell-nav-group-label">{group.title}</span> : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeNav;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={active ? "shell-nav-item active" : "shell-nav-item"}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => {
                    onNavigate(item.id);
                    closeMobileDrawer();
                  }}
                >
                  <span className="shell-nav-icon">
                    <Icon size={18} />
                  </span>
                  {expanded || isMobile ? <span className="shell-nav-label">{item.label}</span> : null}
                </button>
              );
            })}
          </Fragment>
        ))}
      </nav>

      <button className="shell-account" type="button" onClick={onAccount} aria-label={`${accountName || "候选人"}，打开账户与数据`}>
        <span className="shell-nav-icon">
          <UserRound size={18} />
        </span>
        {(expanded || isMobile) && (
          <span className="shell-account-copy">
            <strong>{accountName || "候选人"}</strong>
            <small>账户与数据</small>
          </span>
        )}
      </button>
    </>
  );

  return (
    <div className={`app-shell app-shell-v3${expanded ? " expanded" : ""}${isMobile ? " mobile" : ""}`}>
      <a className="skip-link" href="#main-content">
        跳到内容
      </a>

      {isMobile ? (
        <>
          <header className="mobile-topbar">
            <button className="mobile-topbar-button" type="button" onClick={() => setMobileDrawerOpen(true)} aria-label="打开导航菜单">
              <Menu size={18} />
            </button>
            <div className="mobile-topbar-copy">
              <strong>AI 求职台</strong>
              <small>{PRIMARY_NAV.find((item) => item.id === activeNav)?.label ?? "岗位台"}</small>
            </div>
            <button className="mobile-topbar-button" type="button" onClick={onAccount} aria-label="打开账户与数据">
              <UserRound size={18} />
            </button>
          </header>

          {mobileDrawerOpen ? (
            <div className="mobile-drawer-backdrop" role="presentation" onClick={closeMobileDrawer}>
              <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="主导航抽屉" onClick={(event) => event.stopPropagation()}>
                {sidebar}
              </aside>
            </div>
          ) : null}
        </>
      ) : (
        <aside className={`shell-sidebar${expanded ? " expanded" : " collapsed"}`}>{sidebar}</aside>
      )}

      <main className="main main-v3" id="main-content">
        {children}
      </main>
    </div>
  );
}
