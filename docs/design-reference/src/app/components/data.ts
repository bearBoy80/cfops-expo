// ── Managed accounts ─────────────────────────────────────────────────────────────
// The app aggregates resources across every connected Cloudflare account.
export type Account = {
  id: string; name: string; short: string; color: string;
  plan: string; zones: number; requests: string; threats: string;
  spend: string; status: "healthy" | "degraded" | "down";
};

export const accounts: Account[] = [
  { id: "acme",    name: "Acme Corp",     short: "AC", color: "#f6821f", plan: "Enterprise", zones: 2, requests: "1.26B", threats: "25.7K", spend: "$2,480", status: "degraded" },
  { id: "globex",  name: "Globex Inc",    short: "GX", color: "#0a84ff", plan: "Business",   zones: 1, requests: "340M",  threats: "5.1K",  spend: "$680",   status: "healthy" },
  { id: "initech", name: "Initech",       short: "IT", color: "#bf5af2", plan: "Pro",        zones: 1, requests: "2.1M",  threats: "67",    spend: "$45",    status: "healthy" },
  { id: "hooli",   name: "Hooli",         short: "HL", color: "#30d158", plan: "Enterprise", zones: 3, requests: "4.8B",  threats: "112K",  spend: "$9,240", status: "down" },
];

// ── Members per account ───────────────────────────────────────────────────────────
export const accountMembers: Record<string, { name: string; email: string; role: string }[]> = {
  acme: [
    { name: "Sarah Anderson", email: "sarah@acme.com", role: "Super Admin" },
    { name: "Mike Chen", email: "mike@acme.com", role: "Administrator" },
    { name: "Priya Nair", email: "priya@acme.com", role: "Deploy" },
  ],
  globex: [
    { name: "Tom Reyes", email: "tom@globex.com", role: "Super Admin" },
    { name: "Lena Fox", email: "lena@globex.com", role: "Analytics" },
  ],
  initech: [
    { name: "Bill Lumbergh", email: "bill@initech.net", role: "Super Admin" },
  ],
  hooli: [
    { name: "Gavin Belson", email: "gavin@hooli.com", role: "Super Admin" },
    { name: "Denpok Singh", email: "denpok@hooli.com", role: "Administrator" },
    { name: "Deploy Bot", email: "ci@hooli.com", role: "Deploy" },
  ],
};

// ── API tokens per account ──────────────────────────────────────────────────────
export const accountTokens: Record<string, { name: string; scope: string; lastUsed: string }[]> = {
  acme: [
    { name: "ci-deploy", scope: "Workers:Edit", lastUsed: "2m ago" },
    { name: "terraform", scope: "Zone:Edit", lastUsed: "1h ago" },
    { name: "monitoring", scope: "Analytics:Read", lastUsed: "5m ago" },
  ],
  globex: [
    { name: "gh-actions", scope: "Pages:Edit", lastUsed: "3h ago" },
  ],
  initech: [],
  hooli: [
    { name: "deploy-bot", scope: "Workers:Edit", lastUsed: "12m ago" },
    { name: "backup", scope: "R2:Edit", lastUsed: "1d ago" },
  ],
};

// ── R2 object storage ───────────────────────────────────────────────────────────
export const r2Buckets = [
  { name: "acme-assets", account: "acme", region: "WNAM", objects: "1.24M", size: "842 GB", classA: "4.2M", classB: "38.1M", egress: "$0.00", public: true },
  { name: "user-uploads", account: "acme", region: "ENAM", objects: "8.9M", size: "2.1 TB", classA: "12.8M", classB: "104M", egress: "$0.00", public: false },
  { name: "db-backups", account: "globex", region: "WEUR", objects: "3.4K", size: "1.8 TB", classA: "3.4K", classB: "12K", egress: "$0.00", public: false },
  { name: "video-transcode", account: "hooli", region: "APAC", objects: "62K", size: "6.4 TB", classA: "890K", classB: "5.2M", egress: "$0.00", public: true },
];

export const r2Objects = [
  { key: "images/hero-2026.webp", size: "248 KB", modified: "2h ago" },
  { key: "images/og-card.png", size: "1.2 MB", modified: "5h ago" },
  { key: "css/app.a3f9.css", size: "84 KB", modified: "1d ago" },
  { key: "js/bundle.c72e.js", size: "412 KB", modified: "1d ago" },
  { key: "fonts/inter-var.woff2", size: "96 KB", modified: "3d ago" },
  { key: "downloads/press-kit.zip", size: "18.4 MB", modified: "1w ago" },
];

// ── KV namespaces ───────────────────────────────────────────────────────────────
export const kvNamespaces = [
  { name: "SESSIONS", keys: "482K", reads: "12.4M/day", writes: "890K/day", size: "1.2 GB" },
  { name: "FEATURE_FLAGS", keys: "1.2K", reads: "8.9M/day", writes: "340/day", size: "4 MB" },
  { name: "GEO_CACHE", keys: "68K", reads: "24.1M/day", writes: "62K/day", size: "218 MB" },
  { name: "RATE_LIMITS", keys: "212K", reads: "18.7M/day", writes: "18.7M/day", size: "84 MB" },
];

// ── D1 databases ────────────────────────────────────────────────────────────────
export const d1Databases = [
  { name: "acme-prod", size: "4.2 GB", tables: 42, reads: "8.4M/day", writes: "620K/day", region: "ENAM" },
  { name: "analytics-edge", size: "18.1 GB", tables: 12, reads: "42M/day", writes: "3.1M/day", region: "WNAM" },
  { name: "sessions-db", size: "890 MB", tables: 6, reads: "12M/day", writes: "890K/day", region: "WEUR" },
];

// ── SSL / TLS certificates ──────────────────────────────────────────────────────
export const certificates = [
  { host: "acme.com", type: "Universal", issuer: "Let's Encrypt", days: 62, status: "valid" as const },
  { host: "*.acme.com", type: "Advanced", issuer: "Google Trust", days: 14, status: "expiring" as const },
  { host: "api.acme.io", type: "Universal", issuer: "Let's Encrypt", days: 88, status: "valid" as const },
  { host: "legacy.acme.net", type: "Custom", issuer: "DigiCert", days: 3, status: "expiring" as const },
  { host: "old.acme.dev", type: "Custom", issuer: "DigiCert", days: -2, status: "expired" as const },
];

// ── Alerts / Notifications ──────────────────────────────────────────────────────
export const alerts = [
  { title: "5xx error rate spike", detail: "api.acme.com · 2.4% (threshold 1%)", sev: "critical" as const, time: "3m ago", icon: "activity" },
  { title: "Certificate expiring soon", detail: "legacy.acme.net · 3 days left", sev: "warning" as const, time: "1h ago", icon: "lock" },
  { title: "Worker CPU limit reached", detail: "ab-testing · exceeded 50ms wall time", sev: "critical" as const, time: "2h ago", icon: "zap" },
  { title: "Origin health degraded", detail: "lb-primary · 2/4 pools unhealthy", sev: "warning" as const, time: "4h ago", icon: "server" },
  { title: "R2 egress $0 confirmed", detail: "Monthly usage report available", sev: "info" as const, time: "1d ago", icon: "database" },
  { title: "DDoS attack mitigated", detail: "acme.com · 2.1M req/s peak absorbed", sev: "info" as const, time: "1d ago", icon: "shield" },
];

// ── Load balancing / health checks ──────────────────────────────────────────────
export const loadBalancers = [
  {
    name: "lb-primary", host: "api.acme.com", status: "degraded" as const, steering: "Dynamic (RTT)",
    pools: [
      { name: "us-east-pool", status: "healthy" as const, origins: "4/4", latency: "12ms" },
      { name: "us-west-pool", status: "healthy" as const, origins: "4/4", latency: "18ms" },
      { name: "eu-pool", status: "degraded" as const, origins: "3/4", latency: "42ms" },
      { name: "apac-pool", status: "down" as const, origins: "0/2", latency: "—" },
    ],
  },
  {
    name: "lb-static", host: "cdn.acme.com", status: "healthy" as const, steering: "Geo",
    pools: [
      { name: "global-pool", status: "healthy" as const, origins: "6/6", latency: "8ms" },
    ],
  },
];

// ── Pages deployments ───────────────────────────────────────────────────────────
export const pagesProjects = [
  { name: "acme-marketing", account: "acme", domain: "acme.com", status: "success" as const, branch: "main", commit: "a3f9c72", when: "12m ago", framework: "Next.js" },
  { name: "acme-docs", account: "acme", domain: "docs.acme.com", status: "building" as const, branch: "feat/search", commit: "e81b4d0", when: "just now", framework: "Astro" },
  { name: "globex-blog", account: "globex", domain: "blog.globex.com", status: "success" as const, branch: "main", commit: "7c2e991", when: "3h ago", framework: "Hugo" },
  { name: "hooli-app", account: "hooli", domain: "app.hooli.com", status: "failed" as const, branch: "fix/build", commit: "b04f18a", when: "5h ago", framework: "Vite" },
];

// ── Cache ───────────────────────────────────────────────────────────────────────
export const cacheStats = [
  { label: "Cache Hit Ratio", val: "82.4%", color: "#0a84ff" },
  { label: "Bandwidth Saved", val: "4.2 TB", color: "#30d158" },
  { label: "Cached Requests", val: "1.02B", color: "#f6821f" },
  { label: "Edge Storage", val: "218 GB", color: "#bf5af2" },
];

// ── Audit log ───────────────────────────────────────────────────────────────────
export const auditLog = [
  { actor: "sarah@acme.com", action: "Updated firewall rule WAF-SQL-01", when: "16:38", ip: "203.0.113.9" },
  { actor: "api-token:ci-deploy", action: "Deployed Worker api-gateway v47", when: "16:12", ip: "198.51.100.4" },
  { actor: "mike@acme.com", action: "Purged cache for acme.com", when: "15:47", ip: "203.0.113.22" },
  { actor: "sarah@acme.com", action: "Created DNS record api.acme.com", when: "14:20", ip: "203.0.113.9" },
  { actor: "api-token:terraform", action: "Modified R2 bucket policy user-uploads", when: "11:03", ip: "198.51.100.9" },
  { actor: "admin@acme.com", action: "Added member dev@acme.com (role: Deploy)", when: "09:15", ip: "203.0.113.1" },
];

// ── Billing / usage ─────────────────────────────────────────────────────────────
export const billing = {
  plan: "Enterprise",
  cycle: "Jul 1 – Jul 31",
  total: "$2,480.00",
  items: [
    { label: "Workers", usage: "142M requests", cost: "$71.00", pct: 42 },
    { label: "R2 Storage", usage: "11.2 TB · $0 egress", cost: "$168.00", pct: 68 },
    { label: "D1", usage: "62M rows read", cost: "$24.80", pct: 28 },
    { label: "KV", usage: "89M operations", cost: "$44.50", pct: 51 },
    { label: "Load Balancing", usage: "2 LBs · 5 pools", cost: "$15.00", pct: 20 },
  ],
};
