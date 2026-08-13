import { useState } from "react";
import {
  Database, Box, Table2, Plus, Globe, Lock, Upload,
  ArrowDownToLine, ArrowUpFromLine, FileText, Copy,
} from "lucide-react";
import {
  Screen, Header, SectionLabel, Card, ListRow, MetricTile, Pill, UsageBar,
  useAccount, AccountChip, useBoundAccounts, useScopedFilter, EmptyState,
} from "./shared";
import { r2Buckets, r2Objects, kvNamespaces, d1Databases } from "./data";

function R2BucketDetail({ bucket, onBack }: { bucket: (typeof r2Buckets)[0]; onBack: () => void }) {
  return (
    <Screen>
      <Header title={bucket.name} subtitle={`R2 · ${bucket.region}`} onBack={onBack} backLabel="Storage" />
      <div className="px-4 mb-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: bucket.public ? "rgba(48,209,88,0.15)" : "rgba(var(--app-label),0.1)" }}>
          {bucket.public ? <Globe size={12} style={{ color: "#30d158" }} /> : <Lock size={12} style={{ color: "rgba(var(--app-label),0.6)" }} />}
          <span className="text-[11px] font-medium" style={{ color: bucket.public ? "#30d158" : "rgba(var(--app-label),0.6)" }}>
            {bucket.public ? "Public bucket" : "Private bucket"}
          </span>
        </div>
      </div>

      <div className="px-4 flex gap-3 mt-3 mb-1">
        <MetricTile label="Objects" value={bucket.objects} color="#f6821f" icon={Box} />
        <MetricTile label="Stored" value={bucket.size} color="#0a84ff" icon={Database} />
      </div>
      <div className="px-4 flex gap-3 mb-1">
        <MetricTile label="Class A ops" value={bucket.classA} sub="writes / lists" color="#bf5af2" icon={ArrowUpFromLine} />
        <MetricTile label="Class B ops" value={bucket.classB} sub="reads" color="#30d158" icon={ArrowDownToLine} />
      </div>

      <SectionLabel>Egress</SectionLabel>
      <Card>
        <ListRow chevron={false} last
          left={<span className="text-[15px] text-white">Data transfer out</span>}
          right={<span className="text-[15px] font-semibold" style={{ color: "#30d158" }}>{bucket.egress}</span>}
        />
      </Card>

      <SectionLabel>Objects</SectionLabel>
      <Card>
        {r2Objects.map((o, i) => (
          <ListRow key={o.key} last={i === r2Objects.length - 1} chevron={false}
            left={
              <div className="flex items-center gap-3">
                <FileText size={16} style={{ color: "rgba(var(--app-label),0.4)" }} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-[14px] font-mono text-white truncate">{o.key}</div>
                  <div className="text-[11px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{o.size} · {o.modified}</div>
                </div>
              </div>
            }
            right={<Copy size={14} style={{ color: "#f6821f" }} />}
          />
        ))}
      </Card>

      <SectionLabel>Actions</SectionLabel>
      <Card>
        <ListRow chevron={false}
          left={<div className="flex items-center gap-2"><Upload size={15} style={{ color: "#0a84ff" }} /><span className="text-[15px]" style={{ color: "#0a84ff" }}>Upload object</span></div>} />
        <ListRow chevron={false}
          left={<span className="text-[15px]" style={{ color: "#0a84ff" }}>Connect custom domain</span>} />
        <ListRow chevron={false} last
          left={<span className="text-[15px]" style={{ color: "#ff453a" }}>Delete bucket</span>} />
      </Card>
    </Screen>
  );
}

export function StorageScreen({ onConnect }: { onConnect?: () => void }) {
  const { account } = useAccount();
  const bound = useBoundAccounts();
  const scoped = useScopedFilter();
  const [sub, setSub] = useState<"r2" | "kv" | "d1">("r2");
  const [bucket, setBucket] = useState<(typeof r2Buckets)[0] | null>(null);
  const vBuckets = scoped(r2Buckets);

  if (bucket) return <R2BucketDetail bucket={bucket} onBack={() => setBucket(null)} />;

  if (bound.length === 0) {
    return (
      <div className="flex-1 flex flex-col" style={{ background: "var(--app-bg)" }}>
        <div className="px-4 pt-3 pb-2">
          <div className="text-[28px] font-bold text-white tracking-tight">Storage</div>
        </div>
        <EmptyState
          icon={Database}
          title="No storage"
          subtitle="Connect a Cloudflare account to manage its R2 buckets, KV namespaces and D1 databases."
          actionLabel="Connect Account"
          onAction={onConnect}
        />
      </div>
    );
  }

  return (
    <Screen>
      <Header
        title="Storage"
        subtitle="R2 · KV · D1"
        action={
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#f6821f" }}>
            <Plus size={16} className="text-white" />
          </button>
        }
      />

      {/* Segmented control */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(118,118,128,0.24)" }}>
          {([["r2", "R2"], ["kv", "KV"], ["d1", "D1"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSub(id)}
              className="flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={sub === id ? { background: "#f6821f", color: "#fff" } : { color: "rgba(var(--app-label),0.6)" }}
            >{label}</button>
          ))}
        </div>
      </div>

      {sub === "r2" && (
        <>
          <div className="px-4 flex gap-3 mb-1">
            <MetricTile label="Total Stored" value="11.2 TB" color="#f6821f" icon={Database} />
            <MetricTile label="Egress Fees" value="$0.00" sub="always free" color="#30d158" icon={ArrowDownToLine} />
          </div>
          <SectionLabel>Buckets · {vBuckets.length}</SectionLabel>
          <Card>
            {vBuckets.map((b, i) => (
              <ListRow key={b.name} last={i === vBuckets.length - 1} onPress={() => setBucket(b)}
                left={
                  <div className="flex items-center gap-3">
                    {account === "all"
                      ? <AccountChip id={b.account} size={32} />
                      : <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(246,130,31,0.15)" }}>
                          <Box size={16} style={{ color: "#f6821f" }} />
                        </div>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-medium text-white truncate">{b.name}</span>
                        {b.public
                          ? <Globe size={11} style={{ color: "#30d158" }} />
                          : <Lock size={11} style={{ color: "rgba(var(--app-label),0.4)" }} />}
                      </div>
                      <div className="text-[12px]" style={{ color: "rgba(var(--app-label),0.4)" }}>{b.region} · {b.objects} objects · {b.size}</div>
                    </div>
                  </div>
                }
              />
            ))}
          </Card>
        </>
      )}

      {sub === "kv" && (
        <>
          <SectionLabel>Namespaces · {kvNamespaces.length}</SectionLabel>
          <Card>
            {kvNamespaces.map((n, i) => (
              <ListRow key={n.name} last={i === kvNamespaces.length - 1} chevron={false}
                left={
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(10,132,255,0.15)" }}>
                      <Database size={16} style={{ color: "#0a84ff" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-mono font-medium text-white truncate">{n.name}</div>
                      <div className="text-[11px] mt-0.5 flex gap-3" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <span>{n.keys} keys</span><span>{n.size}</span>
                      </div>
                      <div className="text-[11px] flex gap-3" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <span>↓ {n.reads}</span><span>↑ {n.writes}</span>
                      </div>
                    </div>
                  </div>
                }
              />
            ))}
          </Card>
        </>
      )}

      {sub === "d1" && (
        <>
          <SectionLabel>Databases · {d1Databases.length}</SectionLabel>
          <Card>
            {d1Databases.map((d, i) => (
              <ListRow key={d.name} last={i === d1Databases.length - 1} chevron={false}
                left={
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(191,90,242,0.15)" }}>
                      <Table2 size={16} style={{ color: "#bf5af2" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-white truncate">{d.name}</span>
                        <Pill status="active" label={d.region} />
                      </div>
                      <div className="text-[11px] mt-0.5 flex gap-3" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <span>{d.size}</span><span>{d.tables} tables</span>
                      </div>
                      <div className="text-[11px] flex gap-3" style={{ color: "rgba(var(--app-label),0.4)" }}>
                        <span>↓ {d.reads}</span><span>↑ {d.writes}</span>
                      </div>
                    </div>
                  </div>
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
