import { useState } from "react";
import {
  Lock, Bell, CreditCard,
  Server, Shield, BarChart2, Zap, Database, Activity,
  RefreshCw, CheckCircle, Settings, Smartphone, Mail,
  Webhook, Moon, Fingerprint, KeyRound, LogOut, Plus,
  Globe, DollarSign, Unplug,
} from "lucide-react";
import {
  Screen, Header, SectionLabel, Card, ListRow, MetricTile, Pill, UsageBar, ToggleRow, Toggle,
  AccountChip, useAccount, Status, useTheme,
} from "./shared";
import {
  certificates, alerts, loadBalancers, cacheStats, auditLog, billing, accounts,
  accountMembers, accountTokens,
} from "./data";

const alertIcon: Record<string, React.ElementType> = {
  activity: Activity, lock: Lock, zap: Zap, server: Server, database: Database, shield: Shield,
};

// ── SSL / TLS certificates ───────────────────────────────────────────────────────
export function CertsScreen({ onBack, backLabel = "More", scope }: { onBack: () => void; backLabel?: string; scope?: string }) {
  const expiringSoon = certificates.filter(c => c.status !== "valid").length;
  return (
    <Screen>
      <Header title="SSL / TLS" subtitle={scope ?? `${certificates.length} certificates`} onBack={onBack} backLabel={backLabel} />
      <div className="px-4 flex gap-3 mb-1">
        <MetricTile label="Valid" value={String(certificates.filter(c => c.status === "valid").length)} color="#30d158" />
        <MetricTile label="Expiring" value={String(certificates.filter(c => c.status === "expiring").length)} color="#ffd60a" />
        <MetricTile label="Expired" value={String(certificates.filter(c => c.status === "expired").length)} color="#ff453a" />
      </div>
      {expiringSoon > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: "rgba(255,214,10,0.12)" }}>
            <Lock size={14} style={{ color: "#ffd60a" }} />
            <span className="text-[12px] font-medium" style={{ color: "#ffd60a" }}>{expiringSoon} certificate(s) need attention</span>
          </div>
        </div>
      )}
      <SectionLabel>Certificates</SectionLabel>
      <Card>
        {certificates.map((c, i) => (
          <ListRow key={c.host} last={i === certificates.length - 1} chevron={false}
            left={
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[15px] font-mono font-medium text-white">{c.host}</span>
                  <Pill status={c.status as Status} />
                </div>
                <div className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{c.type} · {c.issuer}</div>
              </div>
            }
            right={
              <span className="text-[13px] font-semibold" style={{ color: c.days < 0 ? "#ff453a" : c.days <= 14 ? "#ffd60a" : "#30d158" }}>
                {c.days < 0 ? `Expired ${-c.days}d` : `${c.days}d left`}
              </span>
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────────
export function AlertsScreen({ onBack, backLabel = "More" }: { onBack: () => void; backLabel?: string }) {
  return (
    <Screen>
      <Header title="Alerts" subtitle={`${alerts.length} notifications`} onBack={onBack} backLabel={backLabel} />
      <SectionLabel>Active</SectionLabel>
      <Card>
        {alerts.map((a, i) => {
          const Icon = alertIcon[a.icon] ?? Bell;
          const color = a.sev === "critical" ? "#ff453a" : a.sev === "warning" ? "#ffd60a" : "#0a84ff";
          return (
            <ListRow key={a.title + i} last={i === alerts.length - 1}
              left={
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "22" }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-white truncate">{a.title}</span>
                      <Pill status={a.sev as Status} />
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "rgba(var(--app-label),0.4)" }}>{a.detail} · {a.time}</div>
                  </div>
                </div>
              }
            />
          );
        })}
      </Card>
    </Screen>
  );
}

// ── Load balancing ─────────────────────────────────────────────────────────────
export function LoadBalancingScreen({ onBack, backLabel = "More" }: { onBack: () => void; backLabel?: string }) {
  return (
    <Screen>
      <Header title="Load Balancing" subtitle={`${loadBalancers.length} balancers`} onBack={onBack} backLabel={backLabel} />
      {loadBalancers.map((lb) => (
        <div key={lb.name}>
          <div className="px-4 pt-5 pb-1.5 flex items-center gap-2">
            <span className="text-[12px] font-semibold tracking-wider uppercase" style={{ color: "#ebebf599" }}>{lb.name}</span>
            <Pill status={lb.status as Status} />
            <span className="ml-auto text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{lb.steering}</span>
          </div>
          <Card>
            {lb.pools.map((p, i) => {
              const color = p.status === "healthy" ? "#30d158" : p.status === "degraded" ? "#ffd60a" : "#ff453a";
              return (
                <ListRow key={p.name} last={i === lb.pools.length - 1} chevron={false}
                  left={
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <div>
                        <div className="text-[14px] font-medium text-white">{p.name}</div>
                        <div className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{lb.host} · {p.origins} origins</div>
                      </div>
                    </div>
                  }
                  right={<span className="text-[13px] font-mono" style={{ color }}>{p.latency}</span>}
                />
              );
            })}
          </Card>
        </div>
      ))}
    </Screen>
  );
}

// ── Cache ─────────────────────────────────────────────────────────────────────
export function CacheScreen({ onBack, backLabel = "More", scope = "acme.com" }: { onBack: () => void; backLabel?: string; scope?: string }) {
  const [purged, setPurged] = useState(false);
  return (
    <Screen>
      <Header title="Cache" subtitle={scope} onBack={onBack} backLabel={backLabel} />
      <div className="px-4 flex gap-3 mb-1 mt-1 flex-wrap">
        {cacheStats.map((s) => (
          <div key={s.label} className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: "var(--app-surface)", width: "calc(50% - 6px)" }}>
            <div className="text-[22px] font-bold leading-none tracking-tight" style={{ color: s.color }}>{s.val}</div>
            <div className="text-[11px] font-medium text-white/90">{s.label}</div>
          </div>
        ))}
      </div>
      <SectionLabel>Actions</SectionLabel>
      <Card>
        <ListRow chevron={false} onPress={() => { setPurged(true); setTimeout(() => setPurged(false), 2000); }}
          left={
            <div className="flex items-center gap-2">
              {purged ? <CheckCircle size={15} style={{ color: "#30d158" }} /> : <RefreshCw size={15} style={{ color: "#f6821f" }} />}
              <span className="text-[15px]" style={{ color: purged ? "#30d158" : "#f6821f" }}>{purged ? "Cache purged" : "Purge Everything"}</span>
            </div>
          } />
        <ListRow left={<span className="text-[15px] text-white">Purge by URL</span>} />
        <ListRow left={<span className="text-[15px] text-white">Purge by Tag / Prefix</span>} />
        <ListRow last left={<span className="text-[15px] text-white">Cache Configuration</span>} />
      </Card>
    </Screen>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
export function AuditScreen({ onBack, backLabel = "More" }: { onBack: () => void; backLabel?: string }) {
  return (
    <Screen>
      <Header title="Audit Log" subtitle="Last 24 hours" onBack={onBack} backLabel={backLabel} />
      <SectionLabel>Activity</SectionLabel>
      <Card>
        {auditLog.map((l, i) => (
          <ListRow key={i} last={i === auditLog.length - 1} chevron={false}
            left={
              <div>
                <div className="text-[14px] text-white mb-0.5">{l.action}</div>
                <div className="text-[11px] font-mono flex gap-2" style={{ color: "rgba(var(--app-label),0.4)" }}>
                  <span style={{ color: "#f6821f" }}>{l.actor}</span>
                  <span>· {l.ip} · {l.when}</span>
                </div>
              </div>
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

// ── Billing ──────────────────────────────────────────────────────────────────
export function BillingScreen({ onBack, backLabel = "More" }: { onBack: () => void; backLabel?: string }) {
  return (
    <Screen>
      <Header title="Billing" subtitle={`${billing.plan} · ${billing.cycle}`} onBack={onBack} backLabel={backLabel} />
      <div className="px-4 mt-1 mb-1">
        <div className="rounded-2xl p-4" style={{ background: "var(--app-surface)" }}>
          <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.5)" }}>Estimated this cycle</div>
          <div className="text-[32px] font-bold text-white tracking-tight">{billing.total}</div>
        </div>
      </div>
      <SectionLabel>Usage by product</SectionLabel>
      <Card>
        {billing.items.map((it, i) => (
          <div key={it.label} className="px-4 py-3" style={{ borderBottom: i === billing.items.length - 1 ? "none" : "1px solid rgba(var(--app-hairline),0.06)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[15px] text-white">{it.label}</span>
              <span className="text-[15px] font-semibold" style={{ color: "#f6821f" }}>{it.cost}</span>
            </div>
            <div className="text-[11px] mb-2" style={{ color: "rgba(var(--app-label),0.4)" }}>{it.usage}</div>
            <UsageBar pct={it.pct} />
          </div>
        ))}
      </Card>
    </Screen>
  );
}

// ── Notification preferences ─────────────────────────────────────────────────
function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [channels, setChannels] = useState({ push: true, email: true, webhook: false });
  const [events, setEvents] = useState({
    security: true, availability: true, certs: true, workers: true, billing: false, weekly: true,
  });
  const [quiet, setQuiet] = useState(true);

  return (
    <Screen>
      <Header title="Notifications" subtitle="Delivery & event preferences" onBack={onBack} backLabel="Settings" />

      <SectionLabel>Delivery Channels</SectionLabel>
      <Card>
        <ToggleRow icon={Smartphone} color="#f6821f" label="Push Notifications" sub="This device" on={channels.push} onChange={(v) => setChannels({ ...channels, push: v })} />
        <ToggleRow icon={Mail} color="#0a84ff" label="Email" sub="ops@acme.com" on={channels.email} onChange={(v) => setChannels({ ...channels, email: v })} />
        <ToggleRow icon={Webhook} color="#bf5af2" label="Webhook / Slack" sub="#cloudflare-alerts" last on={channels.webhook} onChange={(v) => setChannels({ ...channels, webhook: v })} />
      </Card>

      <SectionLabel>Alert Me About</SectionLabel>
      <Card>
        <ToggleRow icon={Shield} color="#ff453a" label="Security Events" sub="DDoS, WAF, spikes" on={events.security} onChange={(v) => setEvents({ ...events, security: v })} />
        <ToggleRow icon={Activity} color="#30d158" label="Availability" sub="5xx rate, origin health" on={events.availability} onChange={(v) => setEvents({ ...events, availability: v })} />
        <ToggleRow icon={Lock} color="#ffd60a" label="Certificate Expiry" sub="≤ 14 days remaining" on={events.certs} onChange={(v) => setEvents({ ...events, certs: v })} />
        <ToggleRow icon={Zap} color="#f6821f" label="Worker Errors" sub="Exceptions, CPU limits" on={events.workers} onChange={(v) => setEvents({ ...events, workers: v })} />
        <ToggleRow icon={CreditCard} color="#30d158" label="Billing & Usage" sub="Threshold alerts" on={events.billing} onChange={(v) => setEvents({ ...events, billing: v })} />
        <ToggleRow icon={BarChart2} color="#bf5af2" label="Weekly Summary" sub="Every Monday 09:00" last on={events.weekly} onChange={(v) => setEvents({ ...events, weekly: v })} />
      </Card>

      <SectionLabel>Do Not Disturb</SectionLabel>
      <Card>
        <ToggleRow icon={Moon} color="#0a84ff" label="Quiet Hours" sub="22:00 – 07:00 · critical only" last on={quiet} onChange={setQuiet} />
      </Card>
      <div className="px-4 pt-2 text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>
        Critical incidents always bypass quiet hours and are delivered immediately.
      </div>
    </Screen>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsScreen({ onBack, onOpenNotifications }: { onBack: () => void; onOpenNotifications: () => void }) {
  const [analytics2fa, setAnalytics2fa] = useState(true);
  const [biometric, setBiometric] = useState(true);
  const { theme, setTheme } = useTheme();

  return (
    <Screen>
      <Header title="Settings" subtitle="Your profile & app preferences" onBack={onBack} backLabel="More" />

      {/* Account card */}
      <div className="px-4 mt-1 mb-1">
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--app-surface)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-[18px] font-bold text-white on-accent" style={{ background: "linear-gradient(135deg,#f6821f,#ff453a)" }}>
            SA
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-white">Sarah Anderson</div>
            <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.5)" }}>sarah@acme.com · Super Admin</div>
          </div>
        </div>
      </div>

      <SectionLabel>Preferences</SectionLabel>
      <Card>
        <ListRow onPress={onOpenNotifications}
          left={
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,69,58,0.15)" }}>
                <Bell size={16} style={{ color: "#ff453a" }} />
              </div>
              <span className="text-[15px] font-medium text-white">Notifications</span>
            </div>
          }
          right={<span className="text-[13px]" style={{ color: "rgba(var(--app-label),0.4)" }}>3 channels</span>}
        />
        <ToggleRow icon={Moon} color="#0a84ff" label="Dark Appearance" last on={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
      </Card>

      <SectionLabel>Sign-in Security</SectionLabel>
      <Card>
        <ToggleRow icon={Fingerprint} color="#30d158" label="Face ID / Biometrics" sub="Unlock app" on={biometric} onChange={setBiometric} />
        <ToggleRow icon={Shield} color="#f6821f" label="Two-Factor Auth" sub="Authenticator app" last on={analytics2fa} onChange={setAnalytics2fa} />
      </Card>

      <div className="px-4 pt-2 text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>
        Members, API tokens and billing are managed per account under More → Connected Accounts.
      </div>

      <SectionLabel>General</SectionLabel>
      <Card>
        <ListRow last left={<span className="text-[15px] text-white">Help & Support</span>} />
      </Card>

      <div className="px-4 mt-4">
        <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl active:opacity-70" style={{ background: "var(--app-surface)" }}>
          <LogOut size={16} style={{ color: "#ff453a" }} />
          <span className="text-[15px] font-medium" style={{ color: "#ff453a" }}>Sign Out</span>
        </button>
      </div>
      <div className="px-4 pt-4 text-center text-[11px]" style={{ color: "rgba(var(--app-label),0.3)" }}>
        Cloudflare Console · v2.4.0 (build 1842)
      </div>
    </Screen>
  );
}

// ── Account detail ─────────────────────────────────────────────────────────────
export function AccountDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const { account: scope, setAccount, boundIds, setBoundIds } = useAccount();
  const a = accounts.find(x => x.id === id);
  if (!a) return null;
  const members = accountMembers[id] ?? [];
  const tokens = accountTokens[id] ?? [];
  const isScope = scope === id;
  const dot = a.status === "healthy" ? "#30d158" : a.status === "degraded" ? "#ffd60a" : "#ff453a";
  const statusLabel = a.status === "healthy" ? "Healthy" : a.status === "degraded" ? "Degraded" : "Down";

  return (
    <Screen>
      <Header title={a.name} subtitle={`${a.plan} · ${a.zones} zones`} onBack={onBack} backLabel="More" />

      {/* Identity */}
      <div className="px-4 mt-1 mb-1">
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--app-surface)" }}>
          <AccountChip id={a.id} size={48} />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-white">{a.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
              <span className="text-[12px]" style={{ color: "rgba(var(--app-label),0.6)" }}>{statusLabel} · {a.plan}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scope toggle */}
      <div className="px-4 mb-1">
        <button
          onClick={() => setAccount(isScope ? "all" : a.id)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl active:opacity-70"
          style={{ background: isScope ? "rgba(48,209,88,0.15)" : "#f6821f" }}
        >
          {isScope ? (
            <>
              <CheckCircle size={16} style={{ color: "#30d158" }} />
              <span className="text-[15px] font-medium" style={{ color: "#30d158" }}>Currently in scope</span>
            </>
          ) : (
            <span className="text-[15px] font-medium text-white on-accent">Set as active scope</span>
          )}
        </button>
      </div>

      {/* Overview */}
      <div className="px-4 flex gap-3 mt-2 mb-1">
        <MetricTile label="Zones" value={String(a.zones)} color="#0a84ff" icon={Globe} />
        <MetricTile label="Requests" value={a.requests} color="#f6821f" icon={Activity} />
      </div>
      <div className="px-4 flex gap-3 mb-1">
        <MetricTile label="Threats" value={a.threats} color="#ff453a" icon={Shield} />
        <MetricTile label="Spend / mo" value={a.spend} color="#30d158" icon={DollarSign} />
      </div>

      {/* Members */}
      <SectionLabel>Members · {members.length}</SectionLabel>
      <Card>
        {members.map((m, i) => (
          <ListRow key={m.email} last={false}
            left={
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold text-white" style={{ background: "rgba(191,90,242,0.3)" }}>
                  {m.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <div className="text-[15px] font-medium text-white">{m.name}</div>
                  <div className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{m.email}</div>
                </div>
              </div>
            }
            right={<span className="text-[12px]" style={{ color: "rgba(var(--app-label),0.5)" }}>{m.role}</span>}
          />
        ))}
        <ListRow last chevron={false}
          left={
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(246,130,31,0.15)" }}>
                <Plus size={15} style={{ color: "#f6821f" }} />
              </div>
              <span className="text-[15px] font-medium" style={{ color: "#f6821f" }}>Invite Member</span>
            </div>
          }
        />
      </Card>

      {/* API Tokens */}
      <SectionLabel>API Tokens · {tokens.length}</SectionLabel>
      <Card>
        {tokens.length === 0 && (
          <ListRow chevron={false} last
            left={<span className="text-[14px]" style={{ color: "rgba(var(--app-label),0.4)" }}>No tokens for this account</span>} />
        )}
        {tokens.map((t, i) => (
          <ListRow key={t.name} last={i === tokens.length - 1}
            left={
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(10,132,255,0.15)" }}>
                  <KeyRound size={16} style={{ color: "#0a84ff" }} />
                </div>
                <div>
                  <div className="text-[15px] font-mono font-medium text-white">{t.name}</div>
                  <div className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{t.scope} · used {t.lastUsed}</div>
                </div>
              </div>
            }
          />
        ))}
      </Card>

      {/* Configuration */}
      <SectionLabel>Configuration</SectionLabel>
      <Card>
        <ListRow left={<span className="text-[15px] text-white">Billing & Usage</span>} right={<span className="text-[13px]" style={{ color: "#f6821f" }}>{a.spend}/mo</span>} />
        <ListRow left={<span className="text-[15px] text-white">Data Region</span>} right={<span className="text-[13px]" style={{ color: "rgba(var(--app-label),0.4)" }}>Auto</span>} />
        <ListRow last left={<span className="text-[15px] text-white">Default Zone</span>} right={<span className="text-[13px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{a.zones > 0 ? "Configured" : "—"}</span>} />
      </Card>

      {/* Danger */}
      <div className="px-4 mt-4">
        <button
          onClick={() => {
            if (scope === id) setAccount("all");
            setBoundIds(boundIds.filter(x => x !== id));
            onBack();
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl active:opacity-70"
          style={{ background: "var(--app-surface)" }}
        >
          <Unplug size={16} style={{ color: "#ff453a" }} />
          <span className="text-[15px] font-medium" style={{ color: "#ff453a" }}>Disconnect Account</span>
        </button>
      </div>
      <div className="h-6" />
    </Screen>
  );
}

// ── More hub ─────────────────────────────────────────────────────────────────
export function MoreScreen() {
  const [route, setRoute] = useState<"settings" | "notifications" | null>(null);
  const [acctId, setAcctId] = useState<string | null>(null);
  const { boundIds, setBoundIds } = useAccount();
  const bound = accounts.filter(a => boundIds.includes(a.id));
  const unbound = accounts.filter(a => !boundIds.includes(a.id));

  const back = () => setRoute(null);
  if (acctId) return <AccountDetailScreen id={acctId} onBack={() => setAcctId(null)} />;
  if (route === "notifications") return <NotificationsScreen onBack={() => setRoute("settings")} />;
  if (route === "settings") return <SettingsScreen onBack={back} onOpenNotifications={() => setRoute("notifications")} />;

  const activeAlerts = alerts.filter(a => a.sev !== "info").length;

  type Svc = { label: string; icon: React.ElementType; color: string; stat?: string; go: () => void };

  const Row = ({ item, last }: { item: Svc; last: boolean }) => (
    <ListRow
      last={last}
      onPress={item.go}
      left={
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0" style={{ background: item.color }}>
            <item.icon size={16} className="text-white on-accent" strokeWidth={2.1} />
          </div>
          <span className="text-[16px] text-white">{item.label}</span>
        </div>
      }
      right={item.stat ? <span className="text-[15px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{item.stat}</span> : undefined}
    />
  );

  return (
    <Screen>
      <div className="px-4 pt-3 pb-2">
        <div className="text-[28px] font-bold text-white tracking-tight">More</div>
      </div>

      {/* Profile */}
      <Card>
        <ListRow
          onPress={() => setRoute("settings")}
          last
          left={
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-[16px] font-bold text-white on-accent" style={{ background: "linear-gradient(135deg,#f6821f,#ff453a)" }}>SA</div>
              <div>
                <div className="text-[16px] font-semibold text-white">Sarah Anderson</div>
                <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.5)" }}>sarah@acme.com</div>
              </div>
            </div>
          }
        />
      </Card>

      {/* Connected accounts */}
      <SectionLabel>Connected Accounts · {bound.length}</SectionLabel>
      <Card>
        {bound.length === 0 && (
          <ListRow chevron={false} last={false}
            left={
              <div className="py-1">
                <div className="text-[14px] font-medium text-white">No accounts connected</div>
                <div className="text-[12px] mt-0.5" style={{ color: "rgba(var(--app-label),0.4)" }}>Bind a Cloudflare account to start managing it.</div>
              </div>
            }
          />
        )}
        {bound.map((a) => {
          const dot = a.status === "healthy" ? "#30d158" : a.status === "degraded" ? "#ffd60a" : "#ff453a";
          return (
            <ListRow key={a.id} last={false} onPress={() => setAcctId(a.id)}
              left={
                <div className="flex items-center gap-3">
                  <AccountChip id={a.id} size={32} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-white">{a.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                    </div>
                    <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{a.plan} · {a.zones} zones · {a.spend}/mo</div>
                  </div>
                </div>
              }
            />
          );
        })}
        <ListRow last chevron={false}
          onPress={unbound.length > 0 ? () => setBoundIds([...boundIds, unbound[0].id]) : undefined}
          left={
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(246,130,31,0.15)" }}>
                <Plus size={16} style={{ color: "#f6821f" }} />
              </div>
              <span className="text-[15px] font-medium" style={{ color: "#f6821f" }}>
                {unbound.length > 0 ? "Connect Account" : "All accounts connected"}
              </span>
            </div>
          }
        />
      </Card>

      <SectionLabel>App</SectionLabel>
      <Card>
        <Row item={{ label: "Notifications", icon: Bell, color: "#ff453a", stat: activeAlerts ? `${activeAlerts}` : undefined, go: () => setRoute("notifications") }} last={false} />
        <Row item={{ label: "Settings", icon: Settings, color: "#8e8e93", go: () => setRoute("settings") }} last />
      </Card>

      <div className="px-4 pt-6 text-center text-[11px]" style={{ color: "rgba(var(--app-label),0.3)" }}>
        Cloudflare Console · v2.4.0
      </div>
      <div className="h-4" />
    </Screen>
  );
}
