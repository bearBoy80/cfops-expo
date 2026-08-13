import { useState } from "react";
import {
  Cloud, ArrowRight, Check, Mail, Lock, User, Building2,
  Layers, ShieldCheck, KeyRound, Globe, Activity, Sparkles,
} from "lucide-react";
import { accounts } from "./data";

type Step = "welcome" | "create" | "connect" | "done";

// Primary pill button pinned to the bottom of a step.
function PrimaryButton({ label, onClick, disabled, icon: Icon }: {
  label: string; onClick: () => void; disabled?: boolean; icon?: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl active:opacity-80 transition-opacity"
      style={{ background: disabled ? "rgba(246,130,31,0.35)" : "#f6821f" }}
    >
      <span className="text-[16px] font-semibold text-white on-accent">{label}</span>
      {Icon && <Icon size={18} className="text-white on-accent" />}
    </button>
  );
}

// Labeled text field with a leading icon.
function Field({ icon: Icon, ...props }: { icon: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: "var(--app-surface)" }}>
      <Icon size={17} style={{ color: "rgba(var(--app-label),0.5)" }} className="shrink-0" />
      <input
        {...props}
        className="bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none flex-1"
      />
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["welcome", "create", "connect", "done"];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1.5 py-3">
      {order.map((s, i) => (
        <span
          key={s}
          className="rounded-full transition-all"
          style={{
            width: i === idx ? 20 : 6,
            height: 6,
            background: i <= idx ? "#f6821f" : "rgba(var(--app-hairline),0.18)",
          }}
        />
      ))}
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: (boundIds: string[]) => void }) {
  const [step, setStep] = useState<Step>("welcome");

  // Step 2 — console account
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const createValid = org.trim() && name.trim() && email.includes("@") && password.length >= 6;

  // Step 3 — bound Cloudflare accounts
  const [authorized, setAuthorized] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--app-bg)" }}>
      {/* ── Welcome ─────────────────────────────────────────── */}
      {step === "welcome" && (
        <div className="flex-1 flex flex-col px-6">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div
              className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-6"
              style={{ background: "linear-gradient(135deg,#f6821f,#ff453a)", boxShadow: "0 20px 50px rgba(246,130,31,0.35)" }}
            >
              <Cloud size={40} className="text-white on-accent" strokeWidth={2.2} />
            </div>
            <div className="text-[30px] font-bold text-white tracking-tight leading-tight">Cloudflare Console</div>
            <div className="text-[15px] mt-2 leading-relaxed" style={{ color: "rgba(var(--app-label),0.55)" }}>
              One place to manage every Cloudflare account you operate — zones, Workers, storage and security, all in a single global view.
            </div>

            <div className="mt-8 w-full flex flex-col gap-3">
              {[
                { icon: Building2, color: "#f6821f", text: "Create your team's console account" },
                { icon: Layers, color: "#0a84ff", text: "Bind multiple Cloudflare accounts" },
                { icon: Activity, color: "#30d158", text: "Monitor & manage everything globally" },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--app-surface)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: f.color + "22" }}>
                    <f.icon size={18} style={{ color: f.color }} />
                  </div>
                  <span className="text-[14px] text-white text-left">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pb-8">
            <StepDots step={step} />
            <PrimaryButton label="Get Started" icon={ArrowRight} onClick={() => setStep("create")} />
          </div>
        </div>
      )}

      {/* ── Create account ──────────────────────────────────── */}
      {step === "create" && (
        <div className="flex-1 flex flex-col px-6 overflow-y-auto">
          <div className="pt-6">
            <div className="text-[27px] font-bold text-white tracking-tight">Create your account</div>
            <div className="text-[14px] mt-1.5" style={{ color: "rgba(var(--app-label),0.55)" }}>
              This is your console account — the workspace you'll use to bind and manage your Cloudflare accounts.
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <Field icon={Building2} placeholder="Organization / team name" value={org} onChange={(e) => setOrg(e.target.value)} />
            <Field icon={User} placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Field icon={Mail} type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div>
              <Field icon={Lock} type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
              {password.length > 0 && password.length < 6 && (
                <div className="text-[12px] mt-1.5 px-1" style={{ color: "#ff453a" }}>
                  Password must be at least 6 characters ({password.length}/6)
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 px-1">
            <ShieldCheck size={14} style={{ color: "#30d158" }} className="shrink-0" />
            <span className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>
              We never store your Cloudflare password — accounts are bound via scoped API tokens.
            </span>
          </div>

          <div className="flex-1" />
          <div className="pb-8 pt-4">
            {!createValid && (
              <div className="text-center text-[12px] pb-2" style={{ color: "rgba(var(--app-label),0.4)" }}>
                Fill in all fields (email + 6-character password) to continue
              </div>
            )}
            <StepDots step={step} />
            <PrimaryButton label="Create Account" icon={ArrowRight} disabled={!createValid} onClick={() => setStep("connect")} />
            <button onClick={() => setStep("welcome")} className="w-full text-center pt-3 text-[14px]" style={{ color: "rgba(var(--app-label),0.5)" }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Connect Cloudflare accounts ─────────────────────── */}
      {step === "connect" && (
        <div className="flex-1 flex flex-col px-6 overflow-y-auto">
          <div className="pt-6">
            <div className="text-[27px] font-bold text-white tracking-tight">Bind Cloudflare accounts</div>
            <div className="text-[14px] mt-1.5" style={{ color: "rgba(var(--app-label),0.55)" }}>
              {authorized
                ? "Select the accounts you'd like to manage from this console."
                : "Authorize access to import the Cloudflare accounts you operate."}
            </div>
          </div>

          {!authorized ? (
            <div className="flex-1 flex flex-col justify-center gap-3">
              <button
                onClick={() => { setAuthorized(true); setSelected(accounts.map((a) => a.id)); }}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 active:opacity-80"
                style={{ background: "var(--app-surface)", border: "1px solid rgba(246,130,31,0.4)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(246,130,31,0.15)" }}>
                  <Cloud size={20} style={{ color: "#f6821f" }} />
                </div>
                <div className="text-left flex-1">
                  <div className="text-[15px] font-semibold text-white">Authorize with Cloudflare</div>
                  <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>OAuth · imports all your accounts</div>
                </div>
                <ArrowRight size={18} style={{ color: "#f6821f" }} />
              </button>

              <button
                onClick={() => { setAuthorized(true); setSelected(accounts.map((a) => a.id)); }}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 active:opacity-80"
                style={{ background: "var(--app-surface)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(10,132,255,0.15)" }}>
                  <KeyRound size={20} style={{ color: "#0a84ff" }} />
                </div>
                <div className="text-left flex-1">
                  <div className="text-[15px] font-semibold text-white">Use an API token</div>
                  <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>Paste a scoped token instead</div>
                </div>
                <ArrowRight size={18} style={{ color: "rgba(var(--app-label),0.4)" }} />
              </button>
            </div>
          ) : (
            <div className="flex-1 mt-5">
              <div className="text-[12px] font-semibold tracking-wider uppercase mb-2" style={{ color: "#ebebf599" }}>
                {accounts.length} accounts found
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--app-surface)" }}>
                {accounts.map((a, i) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5 text-left"
                      style={{ borderBottom: i === accounts.length - 1 ? "none" : "1px solid rgba(var(--app-hairline),0.06)" }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-md font-bold text-white on-accent shrink-0"
                        style={{ width: 34, height: 34, background: a.color, fontSize: 14 }}
                      >
                        {a.short}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-white truncate">{a.name}</div>
                        <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>{a.plan} · {a.zones} zones</div>
                      </div>
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors"
                        style={{ background: on ? "#f6821f" : "transparent", border: on ? "none" : "1.5px solid rgba(var(--app-hairline),0.25)" }}
                      >
                        {on && <Check size={14} className="text-white on-accent" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pb-8 pt-4">
            <StepDots step={step} />
            <PrimaryButton
              label={authorized ? `Bind ${selected.length} account${selected.length === 1 ? "" : "s"}` : "Skip for now"}
              icon={authorized ? Check : undefined}
              disabled={authorized && selected.length === 0}
              onClick={() => setStep("done")}
            />
            <button onClick={() => setStep("create")} className="w-full text-center pt-3 text-[14px]" style={{ color: "rgba(var(--app-label),0.5)" }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Done ────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="flex-1 flex flex-col px-6">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ background: "rgba(48,209,88,0.15)" }}
            >
              <Check size={44} style={{ color: "#30d158" }} strokeWidth={2.6} />
            </div>
            <div className="text-[28px] font-bold text-white tracking-tight">You're all set</div>
            <div className="text-[15px] mt-2 leading-relaxed" style={{ color: "rgba(var(--app-label),0.55)" }}>
              {selected.length > 0
                ? `${selected.length} Cloudflare account${selected.length === 1 ? "" : "s"} bound to ${org || "your console"}. You can add more anytime from More → Connected Accounts.`
                : `Your console is ready. Bind your first Cloudflare account anytime from More → Connected Accounts.`}
            </div>
            <div className="flex items-center gap-1.5 mt-5">
              <Sparkles size={15} style={{ color: "#f6821f" }} />
              <span className="text-[13px]" style={{ color: "rgba(var(--app-label),0.5)" }}>Managing everything from one place</span>
            </div>
          </div>
          <div className="pb-8">
            <StepDots step={step} />
            <PrimaryButton label="Enter Console" icon={ArrowRight} onClick={() => onDone(selected)} />
          </div>
        </div>
      )}
    </div>
  );
}
