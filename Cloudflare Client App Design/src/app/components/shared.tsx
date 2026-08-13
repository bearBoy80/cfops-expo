import { createContext, useContext } from "react";
import { ChevronRight, ChevronsUpDown, Check, Plus, Layers } from "lucide-react";
import { accounts, type Account } from "./data";

// ── Global multi-account context ─────────────────────────────────────────────────
// `account` is either "all" (aggregate view across every connected account) or an id.
// `boundIds` are the Cloudflare accounts the user has actually connected.
type AccountState = {
  account: string; setAccount: (id: string) => void;
  boundIds: string[]; setBoundIds: (ids: string[]) => void;
};
export const AccountCtx = createContext<AccountState>({
  account: "all", setAccount: () => {}, boundIds: [], setBoundIds: () => {},
});
export const useAccount = () => useContext(AccountCtx);

// ── Theme (dark / light) ─────────────────────────────────────────────────────────
type ThemeMode = "dark" | "light";
export const ThemeCtx = createContext<{ theme: ThemeMode; setTheme: (t: ThemeMode) => void }>({
  theme: "dark", setTheme: () => {},
});
export const useTheme = () => useContext(ThemeCtx);

export const findAccount = (id: string): Account | undefined => accounts.find(a => a.id === id);
export const accountName = (id: string) => id === "all" ? "All Accounts" : (findAccount(id)?.name ?? id);

// Accounts the user has bound (connected), in canonical order.
export function useBoundAccounts(): Account[] {
  const { boundIds } = useAccount();
  return accounts.filter(a => boundIds.includes(a.id));
}

// Returns a filter that narrows any resource list (items with an `account` field)
// to the currently-bound accounts, further scoped to the active account selection.
export function useScopedFilter() {
  const { account, boundIds } = useAccount();
  return <T extends { account: string }>(list: T[]): T[] =>
    list.filter(x => boundIds.includes(x.account) && (account === "all" || x.account === account));
}

// Centered empty state with an optional call-to-action.
export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: {
  icon: React.ElementType; title: string; subtitle: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-10 py-16">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(246,130,31,0.12)" }}>
        <Icon size={30} style={{ color: "#f6821f" }} />
      </div>
      <div className="text-[18px] font-semibold text-white">{title}</div>
      <div className="text-[14px] mt-1.5 leading-relaxed" style={{ color: "rgba(var(--app-label),0.5)" }}>{subtitle}</div>
      {actionLabel && (
        <button onClick={onAction} className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full active:opacity-80" style={{ background: "#f6821f" }}>
          <Plus size={16} className="text-white on-accent" />
          <span className="text-[14px] font-semibold text-white on-accent">{actionLabel}</span>
        </button>
      )}
    </div>
  );
}

// Small colored account badge (short initials chip)
export function AccountChip({ id, size = 18 }: { id: string; size?: number }) {
  const a = findAccount(id);
  if (!a) return null;
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-bold text-white on-accent shrink-0"
      style={{ width: size, height: size, background: a.color, fontSize: size * 0.44 }}
    >
      {a.short}
    </span>
  );
}

// Persistent global context bar (account scope switcher) shown above every screen.
export function AccountBar({ onOpen }: { onOpen: () => void }) {
  const { account } = useAccount();
  const bound = useBoundAccounts();
  const all = account === "all";
  const a = findAccount(account);
  return (
    <button
      onClick={onOpen}
      className="shrink-0 w-full flex items-center gap-2.5 px-4 py-2 active:opacity-70"
      style={{ background: "var(--app-bg)", borderBottom: "1px solid rgba(var(--app-hairline),0.07)" }}
    >
      {all ? (
        <span className="inline-flex items-center justify-center rounded-md w-[22px] h-[22px] shrink-0" style={{ background: "rgba(246,130,31,0.18)" }}>
          <Layers size={13} style={{ color: "#f6821f" }} />
        </span>
      ) : (
        <AccountChip id={account} size={22} />
      )}
      <div className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(var(--app-label),0.4)" }}>Managing</span>
        <span className="text-[14px] font-semibold text-white truncate">
          {bound.length === 0 ? "No accounts" : all ? "All Accounts" : a?.name}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <span className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>
          {bound.length === 0 ? "Connect one" : all ? `${bound.length} account${bound.length === 1 ? "" : "s"}` : a?.plan}
        </span>
        <ChevronsUpDown size={15} style={{ color: "rgba(var(--app-label),0.4)" }} />
      </div>
    </button>
  );
}

// Bottom-sheet account picker overlay.
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account, setAccount } = useAccount();
  const bound = useBoundAccounts();
  if (!open) return null;
  const pick = (id: string) => { setAccount(id); onClose(); };
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative rounded-t-3xl pb-8 pt-2"
        style={{ background: "var(--app-surface)", maxHeight: "80%" }}
      >
        <div className="mx-auto w-9 h-1 rounded-full mb-2" style={{ background: "rgba(var(--app-hairline),0.2)" }} />
        <div className="px-5 py-2 text-[17px] font-semibold text-white">Switch Account</div>
        <div className="overflow-y-auto">
          {bound.length > 0 && (
            <button onClick={() => pick("all")} className="w-full flex items-center gap-3 px-5 py-3 active:bg-white/5"
              style={{ borderBottom: "1px solid rgba(var(--app-hairline),0.06)" }}>
              <span className="inline-flex items-center justify-center rounded-lg w-9 h-9 shrink-0" style={{ background: "rgba(246,130,31,0.18)" }}>
                <Layers size={18} style={{ color: "#f6821f" }} />
              </span>
              <div className="flex-1 text-left">
                <div className="text-[15px] font-medium text-white">All Accounts</div>
                <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>Aggregate global view</div>
              </div>
              {account === "all" && <Check size={18} style={{ color: "#f6821f" }} />}
            </button>
          )}
          {bound.length === 0 && (
            <div className="px-5 py-4 text-[13px]" style={{ color: "rgba(var(--app-label),0.45)" }}>
              No Cloudflare accounts connected yet.
            </div>
          )}
          {bound.map((a) => (
            <button key={a.id} onClick={() => pick(a.id)} className="w-full flex items-center gap-3 px-5 py-3 active:bg-white/5"
              style={{ borderBottom: "1px solid rgba(var(--app-hairline),0.06)" }}>
              <AccountChip id={a.id} size={36} />
              <div className="flex-1 text-left min-w-0">
                <div className="text-[15px] font-medium text-white truncate">{a.name}</div>
                <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>{a.plan} · {a.zones} zones</div>
              </div>
              {account === a.id && <Check size={18} style={{ color: "#f6821f" }} />}
            </button>
          ))}
          <button onClick={onClose} className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-white/5">
            <span className="inline-flex items-center justify-center rounded-lg w-9 h-9 shrink-0" style={{ background: "rgba(118,118,128,0.24)" }}>
              <Plus size={18} className="text-white" />
            </span>
            <span className="text-[15px] font-medium" style={{ color: "#f6821f" }}>Connect Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status system ──────────────────────────────────────────────────────────────

export type Status =
  | "active" | "paused" | "error" | "pending"
  | "block" | "challenge" | "log"
  | "healthy" | "degraded" | "down"
  | "valid" | "expiring" | "expired"
  | "success" | "building" | "failed"
  | "critical" | "warning" | "info";

export const statusCfg: Record<Status, { color: string; bg: string; label: string }> = {
  active:    { color: "#30d158", bg: "rgba(48,209,88,0.15)",  label: "Active" },
  paused:    { color: "#ffd60a", bg: "rgba(255,214,10,0.15)", label: "Paused" },
  error:     { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "Error" },
  pending:   { color: "#0a84ff", bg: "rgba(10,132,255,0.15)", label: "Pending" },
  block:     { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "BLOCK" },
  challenge: { color: "#ffd60a", bg: "rgba(255,214,10,0.15)", label: "CHAL" },
  log:       { color: "#0a84ff", bg: "rgba(10,132,255,0.15)", label: "LOG" },
  healthy:   { color: "#30d158", bg: "rgba(48,209,88,0.15)",  label: "Healthy" },
  degraded:  { color: "#ffd60a", bg: "rgba(255,214,10,0.15)", label: "Degraded" },
  down:      { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "Down" },
  valid:     { color: "#30d158", bg: "rgba(48,209,88,0.15)",  label: "Valid" },
  expiring:  { color: "#ffd60a", bg: "rgba(255,214,10,0.15)", label: "Expiring" },
  expired:   { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "Expired" },
  success:   { color: "#30d158", bg: "rgba(48,209,88,0.15)",  label: "Live" },
  building:  { color: "#0a84ff", bg: "rgba(10,132,255,0.15)", label: "Building" },
  failed:    { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "Failed" },
  critical:  { color: "#ff453a", bg: "rgba(255,69,58,0.15)",  label: "Critical" },
  warning:   { color: "#ffd60a", bg: "rgba(255,214,10,0.15)", label: "Warning" },
  info:      { color: "#0a84ff", bg: "rgba(10,132,255,0.15)", label: "Info" },
};

export function Pill({ status, label }: { status: Status; label?: string }) {
  const c = statusCfg[status];
  return (
    <span style={{ color: c.color, background: c.bg }} className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide">
      {label ?? c.label}
    </span>
  );
}

// ── Layout primitives (iOS) ─────────────────────────────────────────────────────

export function ChevronDisc() {
  return <ChevronRight size={13} className="text-[#48484a]" />;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-1.5 text-[12px] font-semibold tracking-wider uppercase" style={{ color: "#ebebf599" }}>
      {children}
    </div>
  );
}

export function ListRow({ left, right, chevron = true, last = false, onPress }: {
  left: React.ReactNode; right?: React.ReactNode; chevron?: boolean; last?: boolean; onPress?: () => void;
}) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5 transition-colors text-left"
      style={{ borderBottom: last ? "none" : "1px solid rgba(var(--app-hairline),0.06)" }}
    >
      <div className="flex-1 min-w-0">{left}</div>
      {right && <div className="shrink-0 text-right">{right}</div>}
      {chevron && <ChevronDisc />}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-4 rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--app-surface)" }}>
      {children}
    </div>
  );
}

export function MetricTile({ label, value, sub, color = "#f6821f", icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="flex-1 rounded-2xl p-4 flex flex-col gap-1" style={{ background: "var(--app-surface)", minWidth: 0 }}>
      {Icon && <Icon size={16} style={{ color }} className="mb-1" />}
      <div className="text-[22px] font-bold leading-none tracking-tight" style={{ color }}>{value}</div>
      <div className="text-[11px] font-medium text-white/90 leading-tight">{label}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>{sub}</div>}
    </div>
  );
}

// Large-title header with optional back button + trailing action
export function Header({ title, subtitle, onBack, backLabel, action }: {
  title: string; subtitle?: string; onBack?: () => void; backLabel?: string; action?: React.ReactNode;
}) {
  return (
    <>
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 px-2 pt-2 pb-1 active:opacity-60" style={{ color: "#f6821f" }}>
          <ChevronRight size={18} style={{ transform: "rotate(180deg)" }} /> <span className="text-[17px]">{backLabel ?? "Back"}</span>
        </button>
      )}
      <div className={`px-4 ${onBack ? "pt-1" : "pt-3"} pb-2 flex items-end justify-between`}>
        <div className="min-w-0">
          <div className="text-[28px] font-bold text-white tracking-tight truncate">{title}</div>
          {subtitle && <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>{subtitle}</div>}
        </div>
        {action && <div className="shrink-0 pb-1">{action}</div>}
      </div>
    </>
  );
}

// Thin horizontal usage/progress bar
export function UsageBar({ pct, color = "#f6821f" }: { pct: number; color?: string }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(var(--app-hairline),0.08)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export const Screen = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>{children}</div>
);

// iOS-style toggle switch
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative rounded-full transition-colors shrink-0"
      style={{ width: 51, height: 31, background: on ? "#30d158" : "rgba(120,120,128,0.32)" }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white transition-all"
        style={{ width: 27, height: 27, left: on ? 22 : 2, boxShadow: "0 2px 4px rgba(0,0,0,0.25)" }}
      />
    </button>
  );
}

// A list row dedicated to a toggle setting (no chevron, no press-navigation)
export function ToggleRow({ icon: Icon, color = "#f6821f", label, sub, on, onChange, last = false }: {
  icon?: React.ElementType; color?: string; label: string; sub?: string;
  on: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div
      className="w-full flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: last ? "none" : "1px solid rgba(var(--app-hairline),0.06)" }}
    >
      {Icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "22" }}>
          <Icon size={16} style={{ color }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-white">{label}</div>
        {sub && <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
