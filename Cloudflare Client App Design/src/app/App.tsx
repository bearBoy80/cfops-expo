import { useState } from "react";
import {
  Globe, Zap, Shield, BarChart2, ChevronRight,
  Activity, AlertTriangle, CheckCircle, Clock,
  Bell, Search, Plus, MoreHorizontal, ArrowUpRight,
  HardDrive, Wifi, TrendingUp, TrendingDown,
  Server, Code, Settings, RefreshCw, XCircle,
  Play, Pause, Trash2, ChevronLeft, Info, Lock,
  Database, FileText, Cpu, X, DollarSign
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { Database as DatabaseIcon, MoreHorizontal as MoreIcon, Gauge, GitBranch } from "lucide-react";
import {
  Status, statusCfg, Pill, ChevronDisc, SectionLabel, ListRow, Card, MetricTile,
  AccountCtx, AccountBar, AccountSheet, AccountChip, useAccount,
  useBoundAccounts, useScopedFilter, EmptyState,
} from "./components/shared";
import { ThemeCtx, useTheme } from "./components/shared";
import { StorageScreen } from "./components/storage";
import {
  MoreScreen, CertsScreen, CacheScreen,
  AlertsScreen, LoadBalancingScreen, AuditScreen, BillingScreen,
} from "./components/more";
import { pagesProjects, accounts } from "./components/data";
import { Onboarding } from "./components/onboarding";

// ── Data ─────────────────────────────────────────────────────────────────────

const requestData = [
  { t: "00", v: 14200 }, { t: "04", v: 9800 }, { t: "08", v: 28600 },
  { t: "10", v: 42100 }, { t: "12", v: 51300 }, { t: "14", v: 48700 },
  { t: "16", v: 53200 }, { t: "18", v: 46800 }, { t: "20", v: 38400 },
  { t: "22", v: 24900 },
];

const zones = [
  { name: "acme.com", account: "acme", status: "active", plan: "Enterprise", requests: "1.24B", threats: "24.8K", cache: "82%", ssl: "Full (strict)" },
  { name: "acme-staging.com", account: "acme", status: "active", plan: "Pro", requests: "18.4M", threats: "892", cache: "71%", ssl: "Full" },
  { name: "api.globex.io", account: "globex", status: "active", plan: "Business", requests: "340M", threats: "5.1K", cache: "34%", ssl: "Full (strict)" },
  { name: "initech.net", account: "initech", status: "pending", plan: "Pro", requests: "2.1M", threats: "67", cache: "48%", ssl: "Flexible" },
  { name: "hooli.com", account: "hooli", status: "active", plan: "Enterprise", requests: "4.8B", threats: "112K", cache: "88%", ssl: "Full (strict)" },
];

const workers = [
  { name: "api-gateway", account: "acme", status: "active", requests: "2.4M/day", cpu: "12ms", mem: "128MB", ver: "v47", route: "api.acme.com/*" },
  { name: "auth-middleware", account: "acme", status: "active", requests: "1.8M/day", cpu: "8ms", mem: "64MB", ver: "v23", route: "*.acme.com/auth/*" },
  { name: "image-optimizer", account: "globex", status: "active", requests: "890K/day", cpu: "45ms", mem: "256MB", ver: "v12", route: "cdn.globex.com/img/*" },
  { name: "geo-redirect", account: "hooli", status: "active", requests: "340K/day", cpu: "3ms", mem: "32MB", ver: "v8", route: "hooli.com/*" },
  { name: "rate-limiter", account: "hooli", status: "paused", requests: "0/day", cpu: "—", mem: "32MB", ver: "v5", route: "api.hooli.com/v1/*" },
  { name: "ab-testing", account: "initech", status: "error", requests: "120K/day", cpu: "timeout", mem: "128MB", ver: "v3", route: "initech.net/landing" },
];

const dnsRecords = [
  { type: "A", name: "acme.com", content: "104.21.45.67", proxied: true },
  { type: "A", name: "www", content: "104.21.45.67", proxied: true },
  { type: "CNAME", name: "api", content: "api-lb.acme.com", proxied: true },
  { type: "CNAME", name: "cdn", content: "d3k4l9.cloudfront.net", proxied: false },
  { type: "MX", name: "acme.com", content: "aspmx.l.google.com", proxied: false },
  { type: "TXT", name: "acme.com", content: "v=spf1 include:_spf.google.com ~all", proxied: false },
];

const firewallEvents = [
  { action: "block", rule: "CF-DDOS-L7", ip: "185.220.101.45", cc: "RU", path: "/wp-admin/xmlrpc.php", time: "16:42" },
  { action: "challenge", rule: "RATE-001", ip: "45.142.212.100", cc: "DE", path: "/api/v1/auth/login", time: "16:41" },
  { action: "block", rule: "WAF-SQL-01", ip: "103.211.55.23", cc: "CN", path: "/search?q=1' OR '1", time: "16:41" },
  { action: "block", rule: "CF-DDOS-L7", ip: "194.165.16.78", cc: "UA", path: "/wp-login.php", time: "16:41" },
  { action: "log", rule: "MONITOR-BOT", ip: "66.249.66.34", cc: "US", path: "/sitemap.xml", time: "16:41" },
  { action: "block", rule: "WAF-XSS-02", ip: "91.108.4.29", cc: "NL", path: "/comment?body=<script>", time: "16:40" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const dnsTypeColor: Record<string, string> = {
  A: "#f6821f", AAAA: "#bf5af2", CNAME: "#0a84ff",
  MX: "#30d158", TXT: "#ffd60a", NS: "#ff453a",
};

// ── Screens ───────────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { account, setAccount } = useAccount();
  const bound = useBoundAccounts();
  const all = account === "all";
  const acct = bound.find(a => a.id === account);
  const issues = bound.filter(a => a.status !== "healthy");
  const totalZones = bound.reduce((s, a) => s + a.zones, 0);

  if (bound.length === 0) {
    return (
      <div className="flex-1 flex flex-col" style={{ background: "var(--app-bg)" }}>
        <div className="px-4 pt-3 pb-2">
          <div className="text-[28px] font-bold text-white tracking-tight">Overview</div>
        </div>
        <EmptyState
          icon={Globe}
          title="No accounts connected"
          subtitle="Bind a Cloudflare account to see aggregated traffic, threats and spend across your whole organization."
          actionLabel="Connect Account"
          onAction={() => onNavigate("more")}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      {/* Large title */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[28px] font-bold text-white tracking-tight">{all ? "Overview" : acct?.name}</div>
        <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>
          {all ? `${bound.length} accounts · ${totalZones} zones` : `${acct?.plan} · ${acct?.zones} zones`}
        </div>
      </div>

      {/* Status */}
      <div className="px-4 mb-4">
        {all && issues.length > 0 ? (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(255,214,10,0.12)" }}>
            <span className="w-2 h-2 rounded-full bg-[#ffd60a] animate-pulse shrink-0" />
            <span className="text-[13px] font-medium text-[#ffd60a]">{issues.length} accounts need attention</span>
            <span className="ml-auto text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>16:42 UTC</span>
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(48,209,88,0.12)" }}>
            <span className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse shrink-0" />
            <span className="text-[13px] font-medium text-[#30d158]">All systems operational</span>
            <span className="ml-auto text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>16:42 UTC</span>
          </div>
        )}
      </div>

      {/* Metric tiles */}
      <div className="px-4 flex gap-3 mb-3">
        <MetricTile label="Requests" value={all ? "6.4B" : acct!.requests} sub="+8.2% today" color="#f6821f" icon={Activity} />
        <MetricTile label="Threats Blocked" value={all ? "143K" : acct!.threats} sub="+15% today" color="#ff453a" icon={Shield} />
      </div>
      <div className="px-4 flex gap-3 mb-4">
        <MetricTile label="Bandwidth Saved" value={all ? "18.9 TB" : "4.2 TB"} sub="84% cache hit" color="#0a84ff" icon={HardDrive} />
        <MetricTile label={all ? "Monthly Spend" : "Avg Response"} value={all ? "$12.4K" : "38ms"} sub={all ? "across accounts" : "-4ms today"} color="#30d158" icon={all ? DollarSign : Clock} />
      </div>

      {/* Per-account health (global view only) */}
      {all && (
        <>
          <SectionLabel>Accounts</SectionLabel>
          <Card>
            {bound.map((a, i) => {
              const dot = a.status === "healthy" ? "#30d158" : a.status === "degraded" ? "#ffd60a" : "#ff453a";
              return (
                <ListRow key={a.id} last={i === bound.length - 1} onPress={() => setAccount(a.id)}
                  left={
                    <div className="flex items-center gap-3">
                      <AccountChip id={a.id} size={30} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-medium text-white">{a.name}</span>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                        </div>
                        <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{a.plan} · {a.zones} zones · {a.requests} req</div>
                      </div>
                    </div>
                  }
                  right={<span className="text-[13px] font-semibold" style={{ color: "#f6821f" }}>{a.spend}</span>}
                />
              );
            })}
          </Card>
        </>
      )}

      {/* Chart */}
      <div className="px-4 mb-2">
        <div className="rounded-2xl p-4" style={{ background: "var(--app-surface)" }}>
          <div className="text-[15px] font-semibold text-white mb-0.5">Requests / 24h</div>
          <div className="text-[11px] mb-3" style={{ color: "rgba(var(--app-label),0.4)" }}>{all ? "All accounts · aggregate" : `${acct?.name} · all traffic`}</div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={requestData} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f6821f" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f6821f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: "rgba(var(--app-label),0.3)", fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "rgba(var(--app-label),0.3)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: "var(--app-surface-2)", border: "none", borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: "rgba(var(--app-label),0.5)" }}
                itemStyle={{ color: "#f6821f" }}
              />
              <Area type="monotone" dataKey="v" name="Req" stroke="#f6821f" strokeWidth={2} fill="url(#g1)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick links */}
      <SectionLabel>Quick Access</SectionLabel>
      <Card>
        {[
          { label: "Workers", sub: "5 active · 1 error", icon: Zap, color: "#ffd60a", tab: "workers" },
          { label: "DNS Records", sub: "acme.com · 8 records", icon: Server, color: "#0a84ff", tab: "dns" },
          { label: "Firewall", sub: "24.8K blocked today", icon: Shield, color: "#ff453a", tab: "firewall" },
          { label: "Analytics", sub: "View traffic insights", icon: BarChart2, color: "#bf5af2", tab: "analytics" },
        ].map((item, i, arr) => (
          <ListRow
            key={item.label}
            last={i === arr.length - 1}
            onPress={() => onNavigate(item.tab)}
            left={
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: item.color + "22" }}>
                  <item.icon size={16} style={{ color: item.color }} />
                </div>
                <div>
                  <div className="text-[15px] font-medium text-white">{item.label}</div>
                  <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>{item.sub}</div>
                </div>
              </div>
            }
          />
        ))}
      </Card>

      {/* Global management */}
      <SectionLabel>Management</SectionLabel>
      <Card>
        {[
          { label: "Alerts", sub: "3 need attention", icon: Bell, color: "#ff453a", to: "alerts" },
          { label: "Analytics", sub: "Traffic & performance", icon: BarChart2, color: "#bf5af2", to: "analytics" },
          { label: "Load Balancing", sub: "2 balancers · 5 pools", icon: Wifi, color: "#0a84ff", to: "lb" },
          { label: "Audit Log", sub: "Last 24 hours", icon: FileText, color: "#8e8e93", to: "audit" },
          { label: "Billing", sub: "$12.4K this cycle", icon: DollarSign, color: "#30d158", to: "billing" },
        ].map((item, i, arr) => (
          <ListRow
            key={item.label}
            last={i === arr.length - 1}
            onPress={() => onNavigate(item.to)}
            left={
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: item.color + "22" }}>
                  <item.icon size={16} style={{ color: item.color }} />
                </div>
                <div>
                  <div className="text-[15px] font-medium text-white">{item.label}</div>
                  <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.45)" }}>{item.sub}</div>
                </div>
              </div>
            }
          />
        ))}
      </Card>

      {/* Recent activity */}
      <SectionLabel>Recent Events</SectionLabel>
      <Card>
        {firewallEvents.slice(0, 3).map((e, i) => (
          <ListRow
            key={i}
            last={i === 2}
            left={
              <div className="flex items-center gap-3">
                <Pill status={e.action as Status} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-white truncate">{e.rule}</div>
                  <div className="text-[11px] truncate" style={{ color: "rgba(var(--app-label),0.4)" }}>{e.ip} · {e.cc} · {e.time}</div>
                </div>
              </div>
            }
          />
        ))}
      </Card>
    </div>
  );
}

function ZonesScreen({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { account } = useAccount();
  const scoped = useScopedFilter();
  const [selected, setSelected] = useState<(typeof zones)[0] | null>(null);
  const [zoneRoute, setZoneRoute] = useState<"ssl" | "cache" | null>(null);
  const visibleZones = scoped(zones);

  if (selected && zoneRoute === "ssl")
    return <CertsScreen onBack={() => setZoneRoute(null)} backLabel={selected.name} scope={selected.name} />;
  if (selected && zoneRoute === "cache")
    return <CacheScreen onBack={() => setZoneRoute(null)} backLabel={selected.name} scope={selected.name} />;

  if (selected) {
    return (
      <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 px-2 pt-2 pb-1 active:opacity-60" style={{ color: "#f6821f" }}>
          <ChevronLeft size={18} /> <span className="text-[17px]">Zones</span>
        </button>
        <div className="px-4 pt-1 pb-4">
          <div className="text-[28px] font-bold text-white tracking-tight">{selected.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <AccountChip id={selected.account} size={18} />
            <span className="text-[13px]" style={{ color: "rgba(var(--app-label),0.5)" }}>{accounts.find(a => a.id === selected.account)?.name}</span>
            <Pill status={selected.status as Status} />
          </div>
        </div>
        <SectionLabel>Zone Details</SectionLabel>
        <Card>
          {[
            { label: "Plan", val: selected.plan },
            { label: "SSL Mode", val: selected.ssl },
            { label: "Cache Ratio", val: selected.cache },
          ].map((r, i, arr) => (
            <ListRow key={r.label} chevron={false} last={i === arr.length - 1}
              left={<span className="text-[15px] text-white">{r.label}</span>}
              right={<span className="text-[15px]" style={{ color: "rgba(var(--app-label),0.5)" }}>{r.val}</span>}
            />
          ))}
        </Card>
        <SectionLabel>Traffic (30d)</SectionLabel>
        <Card>
          {[
            { label: "Total Requests", val: selected.requests, color: "#f6821f" },
            { label: "Threats Blocked", val: selected.threats, color: "#ff453a" },
          ].map((r, i, arr) => (
            <ListRow key={r.label} chevron={false} last={i === arr.length - 1}
              left={<span className="text-[15px] text-white">{r.label}</span>}
              right={<span className="text-[15px] font-semibold" style={{ color: r.color }}>{r.val}</span>}
            />
          ))}
        </Card>
        <SectionLabel>Services</SectionLabel>
        <Card>
          {[
            { label: "DNS", icon: Server, color: "#0a84ff", stat: "8 records", go: () => onOpenTab("dns") },
            { label: "SSL / TLS", icon: Lock, color: "#ffd60a", stat: selected.ssl, go: () => setZoneRoute("ssl") },
            { label: "Cache", icon: Gauge, color: "#f6821f", stat: selected.cache, go: () => setZoneRoute("cache") },
            { label: "Firewall", icon: Shield, color: "#ff453a", stat: `${selected.threats} blocked`, go: () => onOpenTab("firewall") },
            { label: "Analytics", icon: BarChart2, color: "#bf5af2", stat: `${selected.requests} req`, go: () => onOpenTab("analytics") },
          ].map((s, i, arr) => (
            <ListRow key={s.label} last={i === arr.length - 1} onPress={s.go}
              left={
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0" style={{ background: s.color }}>
                    <s.icon size={16} className="text-white on-accent" strokeWidth={2.1} />
                  </div>
                  <span className="text-[16px] text-white">{s.label}</span>
                </div>
              }
              right={<span className="text-[14px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{s.stat}</span>}
            />
          ))}
        </Card>
        <SectionLabel>Actions</SectionLabel>
        <Card>
          <ListRow left={<span className="text-[15px]" style={{ color: "#0a84ff" }}>Purge Cache</span>} last={false} />
          <ListRow left={<span className="text-[15px]" style={{ color: "#0a84ff" }}>Pause Zone</span>} last={false} />
          <ListRow left={<span className="text-[15px]" style={{ color: "#ff453a" }}>Remove Zone</span>} chevron={false} last />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      <div className="px-4 pt-3 pb-2 flex items-end justify-between">
        <div>
          <div className="text-[28px] font-bold text-white tracking-tight">Zones</div>
          <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>
            {visibleZones.length} zones{account === "all" ? " · all accounts" : ""}
          </div>
        </div>
        <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#f6821f" }}>
          <Plus size={16} className="text-white on-accent" />
        </button>
      </div>
      {/* Search bar */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(118,118,128,0.24)" }}>
          <Search size={14} style={{ color: "rgba(var(--app-label),0.5)" }} />
          <input placeholder="Search zones..." className="bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none flex-1" />
        </div>
      </div>
      {visibleZones.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No zones"
          subtitle="Connect a Cloudflare account to manage its zones here."
          actionLabel="Connect Account"
          onAction={() => onOpenTab("more")}
        />
      ) : (
      <Card>
        {visibleZones.map((z, i) => (
          <ListRow key={z.name} last={i === visibleZones.length - 1} onPress={() => setSelected(z)}
            left={
              <div className="flex items-center gap-3">
                {account === "all" && <AccountChip id={z.account} size={26} />}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-medium text-white">{z.name}</span>
                    <Pill status={z.status as Status} />
                  </div>
                  <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>
                    {z.plan} · {z.requests} req · {z.cache} cache
                  </div>
                </div>
              </div>
            }
          />
        ))}
      </Card>
      )}
    </div>
  );
}

function WorkersScreen({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { account } = useAccount();
  const bound = useBoundAccounts();
  const scoped = useScopedFilter();
  const [sub, setSub] = useState<"workers" | "pages">("workers");
  const vWorkers = scoped(workers);
  const vPages = scoped(pagesProjects);

  if (bound.length === 0) {
    return (
      <div className="flex-1 flex flex-col" style={{ background: "var(--app-bg)" }}>
        <div className="px-4 pt-3 pb-2">
          <div className="text-[28px] font-bold text-white tracking-tight">Compute</div>
        </div>
        <EmptyState
          icon={Zap}
          title="No compute resources"
          subtitle="Connect a Cloudflare account to view its Workers and Pages projects."
          actionLabel="Connect Account"
          onAction={() => onOpenTab("more")}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      <div className="px-4 pt-3 pb-2 flex items-end justify-between">
        <div>
          <div className="text-[28px] font-bold text-white tracking-tight">Compute</div>
          <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>Workers · Pages</div>
        </div>
        <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#f6821f" }}>
          <Plus size={16} className="text-white on-accent" />
        </button>
      </div>

      {/* Segmented control */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(118,118,128,0.24)" }}>
          {([["workers", "Workers"], ["pages", "Pages"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSub(id)}
              className="flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={sub === id ? { background: "#f6821f", color: "#fff" } : { color: "rgba(var(--app-label),0.6)" }}
            >{label}</button>
          ))}
        </div>
      </div>

      {sub === "workers" && (
        <>
          <div className="px-4 flex gap-3 mb-1">
            <MetricTile label="Active" value={String(vWorkers.filter(w => w.status === "active").length)} color="#30d158" />
            <MetricTile label="Paused" value={String(vWorkers.filter(w => w.status === "paused").length)} color="#ffd60a" />
            <MetricTile label="Errors" value={String(vWorkers.filter(w => w.status === "error").length)} color="#ff453a" />
          </div>
          <SectionLabel>Workers · {vWorkers.length}</SectionLabel>
          <Card>
            {vWorkers.map((w, i) => (
              <ListRow key={w.name} last={i === vWorkers.length - 1}
                left={
                  <div className="flex items-center gap-3">
                    {account === "all" && <AccountChip id={w.account} size={26} />}
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[15px] font-medium text-white">{w.name}</span>
                        <Pill status={w.status as Status} />
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        {w.route}
                      </div>
                      <div className="text-[11px] mt-0.5 flex gap-3" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <span>{w.requests}</span>
                        <span>CPU {w.cpu}</span>
                        <span>{w.mem}</span>
                        <span>{w.ver}</span>
                      </div>
                    </div>
                  </div>
                }
              />
            ))}
          </Card>
        </>
      )}

      {sub === "pages" && (
        <>
          <SectionLabel>Projects · {vPages.length}</SectionLabel>
          <Card>
            {vPages.map((p, i) => (
              <ListRow key={p.name} last={i === vPages.length - 1}
                left={
                  <div className="flex items-center gap-3">
                    {account === "all" && <AccountChip id={p.account} size={26} />}
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[15px] font-medium text-white">{p.name}</span>
                        <Pill status={p.status as Status} />
                      </div>
                      <div className="text-[11px] mb-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>{p.domain} · {p.framework}</div>
                      <div className="text-[11px] font-mono flex items-center gap-1.5" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <GitBranch size={10} /> {p.branch} · {p.commit} · {p.when}
                      </div>
                    </div>
                  </div>
                }
              />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function DNSScreen() {
  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      <div className="px-4 pt-3 pb-2 flex items-end justify-between">
        <div>
          <div className="text-[28px] font-bold text-white tracking-tight">DNS</div>
          <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>acme.com · {dnsRecords.length} records</div>
        </div>
        <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#f6821f" }}>
          <Plus size={16} className="text-white on-accent" />
        </button>
      </div>
      {/* Zone selector */}
      <div className="px-4 mb-4">
        <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "var(--app-surface)" }}>
          <span className="text-[15px] text-white">acme.com</span>
          <div className="flex items-center gap-1" style={{ color: "#f6821f" }}>
            <span className="text-[13px]">Change</span>
            <ChevronRight size={14} />
          </div>
        </button>
      </div>
      <SectionLabel>Records</SectionLabel>
      <Card>
        {dnsRecords.map((r, i) => (
          <ListRow key={`${r.type}-${r.name}-${i}`} last={i === dnsRecords.length - 1}
            left={
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-bold w-12 text-center py-0.5 rounded-md shrink-0" style={{ color: dnsTypeColor[r.type] ?? "#fff", background: (dnsTypeColor[r.type] ?? "#fff") + "22" }}>
                  {r.type}
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-white truncate">{r.name}</div>
                  <div className="text-[11px] font-mono truncate" style={{ color: "rgba(var(--app-label),0.4)" }}>{r.content}</div>
                </div>
              </div>
            }
            right={
              r.proxied
                ? <Wifi size={14} style={{ color: "#f6821f" }} />
                : <Wifi size={14} style={{ color: "rgba(var(--app-label),0.25)" }} />
            }
          />
        ))}
      </Card>
    </div>
  );
}

function FirewallScreen() {
  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      <div className="px-4 pt-3 pb-2">
        <div className="text-[28px] font-bold text-white tracking-tight">Firewall</div>
        <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>WAF · DDoS · Rate Limit</div>
      </div>
      {/* Stats */}
      <div className="px-4 flex gap-3 mb-4">
        <MetricTile label="Blocked" value="24.8K" sub="today" color="#ff453a" icon={XCircle} />
        <MetricTile label="Challenged" value="3.2K" sub="71% passed" color="#ffd60a" icon={AlertTriangle} />
        <MetricTile label="Rules" value="18" sub="2 paused" color="#0a84ff" icon={Shield} />
      </div>
      {/* Live badge */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ff453a] animate-pulse" />
          <span className="text-[13px] font-semibold" style={{ color: "#ff453a" }}>Live Events</span>
        </div>
      </div>
      <Card>
        {firewallEvents.map((e, i) => (
          <ListRow key={i} last={i === firewallEvents.length - 1} chevron={false}
            left={
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill status={e.action as Status} />
                  <span className="text-[13px] font-medium text-white">{e.rule}</span>
                  <span className="ml-auto text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{e.time}</span>
                </div>
                <div className="text-[11px] font-mono flex gap-2" style={{ color: "rgba(var(--app-label),0.4)" }}>
                  <span>{e.ip}</span>
                  <span className="px-1 rounded" style={{ background: "rgba(var(--app-hairline),0.06)" }}>{e.cc}</span>
                  <span className="truncate max-w-[140px]">{e.path}</span>
                </div>
              </div>
            }
          />
        ))}
      </Card>
    </div>
  );
}

function AnalyticsScreen() {
  const [range, setRange] = useState("24h");
  return (
    <div className="flex-1 overflow-y-auto pb-6" style={{ background: "var(--app-bg)" }}>
      <div className="px-4 pt-3 pb-3">
        <div className="text-[28px] font-bold text-white tracking-tight">Analytics</div>
        <div className="text-[13px] mt-0.5" style={{ color: "rgba(var(--app-label),0.5)" }}>All zones · acme-corp</div>
      </div>
      {/* Time range pills */}
      <div className="px-4 mb-4">
        <div className="flex gap-2">
          {["1h", "24h", "7d", "30d"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-all"
              style={range === r
                ? { background: "#f6821f", color: "#fff" }
                : { background: "rgba(118,118,128,0.2)", color: "rgba(var(--app-label),0.6)" }
              }
            >{r}</button>
          ))}
        </div>
      </div>
      {/* Chart */}
      <div className="px-4 mb-4">
        <div className="rounded-2xl p-4" style={{ background: "var(--app-surface)" }}>
          <div className="text-[15px] font-semibold text-white mb-0.5">Request Volume</div>
          <div className="text-[25px] font-bold text-white">1.24B</div>
          <div className="text-[12px] text-[#30d158] mb-3">↑ 8.2% vs previous period</div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={requestData} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f6821f" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f6821f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: "rgba(var(--app-label),0.3)", fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "rgba(var(--app-label),0.3)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ background: "var(--app-surface-2)", border: "none", borderRadius: 10, fontSize: 11 }} itemStyle={{ color: "#f6821f" }} />
              <Area type="monotone" dataKey="v" name="Requests" stroke="#f6821f" strokeWidth={2} fill="url(#g2)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <SectionLabel>Breakdown</SectionLabel>
      <Card>
        {[
          { label: "Cache Hit Rate", val: "82.4%", color: "#0a84ff", up: true },
          { label: "Threats Blocked", val: "24.8K", color: "#ff453a", up: true },
          { label: "Unique Visitors", val: "8.4M", color: "#30d158", up: true },
          { label: "Error Rate", val: "0.08%", color: "#30d158", up: false },
        ].map((item, i, arr) => (
          <ListRow key={item.label} chevron={false} last={i === arr.length - 1}
            left={<span className="text-[15px] text-white">{item.label}</span>}
            right={
              <div className="flex items-center gap-1.5">
                {item.up ? <TrendingUp size={12} style={{ color: item.color }} /> : <TrendingDown size={12} style={{ color: item.color }} />}
                <span className="text-[15px] font-semibold" style={{ color: item.color }}>{item.val}</span>
              </div>
            }
          />
        ))}
      </Card>
    </div>
  );
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "home", label: "Home", icon: Activity },
  { id: "zones", label: "Zones", icon: Globe },
  { id: "storage", label: "Storage", icon: DatabaseIcon },
  { id: "workers", label: "Compute", icon: Zap },
  { id: "more", label: "More", icon: MoreIcon },
];

// Screens reachable from Home (quick access + management) but not in the tab bar → highlight "Home"
const HOME_SCREENS = ["dns", "firewall", "analytics", "alerts", "lb", "audit", "billing"];

// ── iPhone Frame ──────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [account, setAccount] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [boundIds, setBoundIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const navigate = (to: string) => setActiveTab(to);

  const screenMap: Record<string, React.ReactNode> = {
    home: <HomeScreen onNavigate={navigate} />,
    zones: <ZonesScreen onOpenTab={navigate} />,
    storage: <StorageScreen onConnect={() => navigate("more")} />,
    workers: <WorkersScreen onOpenTab={navigate} />,
    more: <MoreScreen />,
    dns: <DNSScreen />,
    firewall: <FirewallScreen />,
    analytics: <AnalyticsScreen />,
    alerts: <AlertsScreen onBack={() => navigate("home")} backLabel="Home" />,
    lb: <LoadBalancingScreen onBack={() => navigate("home")} backLabel="Home" />,
    audit: <AuditScreen onBack={() => navigate("home")} backLabel="Home" />,
    billing: <BillingScreen onBack={() => navigate("home")} backLabel="Home" />,
  };

  // Screens opened from Home keep the "Home" tab lit
  const highlightTab = HOME_SCREENS.includes(activeTab) ? "home" : activeTab;

  return (
    <AccountCtx.Provider value={{ account, setAccount, boundIds, setBoundIds }}>
    <ThemeCtx.Provider value={{ theme, setTheme }}>
    <div className="size-full flex items-center justify-center bg-background" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
      {/* iPhone 15 Pro frame */}
      <div
        className={`relative flex flex-col overflow-hidden shadow-2xl app-theme app-${theme}`}
        style={{
          width: 390,
          height: 844,
          borderRadius: 54,
          background: "#000",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 40px 120px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        {/* Side buttons (decorative) */}
        <div className="absolute -left-[3px] top-[120px] w-[3px] h-10 rounded-l-full" style={{ background: "#1a1a1a" }} />
        <div className="absolute -left-[3px] top-[170px] w-[3px] h-14 rounded-l-full" style={{ background: "#1a1a1a" }} />
        <div className="absolute -left-[3px] top-[234px] w-[3px] h-14 rounded-l-full" style={{ background: "#1a1a1a" }} />
        <div className="absolute -right-[3px] top-[160px] w-[3px] h-20 rounded-r-full" style={{ background: "#1a1a1a" }} />

        {/* Status bar */}
        <div className="shrink-0 flex items-center justify-between px-8 pt-4 pb-2" style={{ background: "var(--app-bg)" }}>
          <span className="text-[15px] font-semibold text-white">9:41</span>
          {/* Dynamic island */}
          <div className="absolute left-1/2 -translate-x-1/2 top-3 w-28 h-8 rounded-full" style={{ background: "#000", border: "1px solid #111" }} />
          <div className="flex items-center gap-1.5 text-white" style={{ color: "rgb(var(--app-text))" }}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.3"/></svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.4C10.5 2.4 12.7 3.5 14.2 5.2L15.5 3.9C13.6 1.8 10.9 0.5 8 0.5C5.1 0.5 2.4 1.8 0.5 3.9L1.8 5.2C3.3 3.5 5.5 2.4 8 2.4Z"/><path d="M8 5.2C9.7 5.2 11.2 5.9 12.3 7L13.6 5.7C12.1 4.3 10.1 3.4 8 3.4C5.9 3.4 3.9 4.3 2.4 5.7L3.7 7C4.8 5.9 6.3 5.2 8 5.2Z"/><circle cx="8" cy="10" r="1.5"/></svg>
            <div className="flex items-center gap-0.5">
              <div className="w-6 h-3 rounded-sm p-0.5 flex" style={{ border: "1px solid currentColor", opacity: 0.9 }}>
                <div className="w-4/5 h-full rounded-[1px]" style={{ background: "currentColor" }} />
              </div>
              <div className="w-0.5 h-1.5 rounded-r-sm" style={{ background: "currentColor", opacity: 0.4 }} />
            </div>
          </div>
        </div>

        {!onboarded ? (
          <Onboarding onDone={(ids) => { setBoundIds(ids); setOnboarded(true); }} />
        ) : (
        <>
        {/* Global account scope switcher */}
        <AccountBar onOpen={() => setSheetOpen(true)} />

        {/* App content */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--app-bg)" }}>
          {screenMap[activeTab] ?? screenMap.home}
        </div>

        {/* Account picker sheet */}
        <AccountSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

        {/* Tab bar */}
        <div
          className="shrink-0 flex items-center gap-1 px-3 pt-2.5 pb-8"
          style={{ background: "var(--app-tabbar)", borderTop: "1px solid rgba(var(--app-hairline),0.07)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = highlightTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center justify-center transition-all active:scale-90"
                style={{ height: 48 }}
              >
                <div
                  className="flex items-center justify-center rounded-full transition-all duration-300"
                  style={{
                    width: active ? 56 : 40,
                    height: 32,
                    background: active ? "rgba(246,130,31,0.16)" : "transparent",
                  }}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.4 : 1.9}
                    style={{ color: active ? "#f6821f" : "rgba(var(--app-label),0.5)" }}
                  />
                </div>
                <span
                  className="mt-1 text-[10px] tracking-tight transition-colors"
                  style={{
                    color: active ? "#f6821f" : "rgba(var(--app-label),0.5)",
                    fontWeight: active ? 600 : 500,
                  }}
                >{label}</span>
              </button>
            );
          })}
        </div>
        </>
        )}
      </div>
    </div>
    </ThemeCtx.Provider>
    </AccountCtx.Provider>
  );
}
