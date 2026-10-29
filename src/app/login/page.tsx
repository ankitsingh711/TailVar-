import { redirect } from "next/navigation";
import { currentUser } from "@/lib/http";
import { homeFor } from "@/lib/page-auth";
import Brand from "@/components/ui/BrandMark";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <div className="login">
      <aside className="login-aside" aria-hidden="true">
        <Brand />
        <div className="login-pitch">
          <h1>Every rupee of cover, accounted for.</h1>
          <p>
            Issue policies, file claims and decide them. Each claim blocks its share of the sum insured the moment it
            is submitted.
          </p>
        </div>
        <div className="sample-card">
          <div className="row">
            <span className="mono">POL-000001 · sample</span>
            <span style={{ fontSize: "0.75rem", color: "#9cc3c7" }}>01 Jan – 31 Dec 2026</span>
          </div>
          <div className="row">
            <span className="big">₹4,00,000</span>
            <span style={{ fontSize: "0.8125rem", color: "#b9d4d6" }}>claimable of ₹10 L</span>
          </div>
          <div className="meter-bar">
            <span className="pending" style={{ width: "60%" }} />
          </div>
          <div className="legend">
            <span>
              Pending <b>₹6 L</b>
            </span>
            <span>
              Approved <b>₹0</b>
            </span>
            <span>
              Claimable <b>₹4 L</b>
            </span>
          </div>
        </div>
        <p className="login-foot">Demo environment · fictional accounts and data</p>
      </aside>
      <main className="login-main">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <header>
            <h1>Sign in</h1>
            <p>Use your account, or pick a demo account below.</p>
          </header>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
