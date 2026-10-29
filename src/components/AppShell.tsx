import type { SessionUser } from "@/lib/types";
import { initials } from "@/lib/format";
import Brand from "./ui/BrandMark";
import ThemeToggle from "./ui/ThemeToggle";
import { ToastProvider } from "./ui/Toast";
import LogoutButton from "./LogoutButton";

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand subtitle={user.role === "admin" ? "Administrator console" : "Customer portal"} />
          <div className="topbar-actions">
            <ThemeToggle />
            <div className="user-chip">
              <span className="avatar" aria-hidden="true">
                {initials(user.displayName)}
              </span>
              <span className="user-chip-text">
                <strong>{user.displayName}</strong>
                <span>
                  {user.username} · {user.role === "admin" ? "Administrator" : "Customer"}
                </span>
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </ToastProvider>
  );
}
