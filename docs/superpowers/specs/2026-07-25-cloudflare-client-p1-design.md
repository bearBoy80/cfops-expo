# Cloudflare 移动客户端 P1 技术方案

日期：2026-07-25
状态：待用户审阅
设计稿：Figma Make 导出（`Cloudflare Client App Design`，https://www.figma.com/design/cAQhbDTwkwItiWqDGs7GAr/Cloudflare-Client-App-Design）

## 1. 背景与目标

基于已定稿的 Figma 设计（iOS 风格、5 Tab、多账户 Cloudflare 管理客户端），用 Expo 构建 iOS + Android 双端 App。P1 目标：**导航骨架按设计稿全铺，核心链路接真实 Cloudflare API**。

### 已确认的关键决策

| 决策项 | 结论 |
|---|---|
| 平台 | iOS + Android 同时支持 |
| 图表 | Victory Native XL（Skia + Reanimated，GPU 原生渲染，双端一致） |
| Cloudflare 接入 | 官方 `cloudflare` TS SDK；OAuth 优先 + API Token 粘贴兜底 |
| App 账号 | 纯本地账号（无后端），密码安全存储，生物识别解锁 |
| 本地存储 | expo-sqlite（drizzle ORM）+ expo-secure-store（敏感凭证） |
| 数据层 | React Query + SQLite 规范化存储 + 时序累积（方案 A 增强版） |
| 异步解耦 | TanStack Query + p-queue + mitt + 自写 SyncEngine/SyncScheduler |
| P1 范围 | 骨架全铺 + 核心真数据（见 §8） |

### 非目标（P1 不做）

- Storage（R2/KV/D1）、Alerts/LB/Audit/Billing/Certs/Cache 二级页的真实数据（骨架 + EmptyState 占位）
- Pages 项目列表、写操作（Purge Cache / Pause Zone / DNS 编辑等，UI 存在但禁用或 P2）
- App 后台周期同步（expo-background-task）、E2E 测试、多设备同步、推送

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Expo（最新 SDK）+ TypeScript + Expo Router |
| 导航 | NativeTabs 5 Tab，每 Tab 独立 Stack |
| 样式 | NativeWind + 主题 token（映射设计稿 CSS 变量，深/浅色） |
| 图表 | Victory Native XL + @shopify/react-native-skia + react-native-reanimated |
| API | `cloudflare` npm SDK（资源管理）+ 自写 GraphQL Analytics 封装（~50 行，分析数据） |
| 服务端状态 | TanStack Query v5 + SQLite persister |
| 本地存储 | expo-sqlite + drizzle ORM；expo-secure-store |
| 认证 | expo-auth-session（OAuth PKCE）+ expo-local-authentication（生物识别） |
| 异步 | p-queue（并发队列）+ mitt（事件总线）——均为纯 JS，双端无兼容问题 |

**为什么需要 GraphQL 封装**：请求量曲线、防火墙事件等分析数据只在 Cloudflare GraphQL Analytics API 提供（REST zone analytics 已废弃），官方 TS SDK 不覆盖。认证复用同一 token。

## 3. 认证与账户模型

两层，互相独立：

### 3.1 App 本地账号（无服务器）

- 首次启动"注册" = 创建本地档案：设置密码 → 加盐慢哈希后仅存 SecureStore（不落 SQLite、不存明文）
- 解锁：密码 或 Face ID/指纹（expo-local-authentication）
- 作用仅为锁住 App 入口，与 Cloudflare 无关

### 3.2 Cloudflare 账户绑定（登录后，可绑多个）

- **首选 OAuth**：在 CF Dashboard 自助注册 OAuth client（2026-06 起全面开放，见 https://developers.cloudflare.com/fundamentals/oauth/），App 内 expo-auth-session 走 Authorization Code + PKCE（S256），获得 access/refresh token
- **兜底 API Token**：粘贴绑定，`user.tokens.verify` + `accounts.list` 校验并识别账户
- 凭证全部存 SecureStore，按 credential id 分 key；SQLite 只存非敏感元数据（账户名、plan、颜色、认证类型）
- **凭证与账户是多对多**：一份凭证经 `accounts.list` 可能发现多个账户；同一账户也可被多份凭证覆盖（表结构见 §4.3）
- token 刷新收在数据层 token provider，UI 无感知

## 4. 数据层

```
UI (hooks) → TanStack Query → 服务层 queryFn：
                                fetch API → ResourceStore.upsert(...) → 返回数据
                   ↕                              ↓
            内存缓存（UI 响应）          SQLite 规范化表（按资源类型）
```

### 4.1 ResourceStore（按资源可插拔）

- drizzle + expo-sqlite：类型安全表定义 + 迁移
- 每类资源一个 store 模块，统一接口：

```ts
interface ResourceStore<T> {
  upsertMany(accountId: string, rows: T[]): Promise<void>;
  list(accountId: string | 'all', filter?): Promise<Stored<T>[]>; // Stored 带 fetched_at
  clear(accountId: string): Promise<void>; // 账户失去全部凭证时清理
}
```

- 写入时机在服务层 queryFn 内（fetch 成功 → upsert → return），显式、可测试
- 每行带 `account_id` + `fetched_at`：多账户隔离、离线"数据截至 xx"展示、后期 diff/历史；资源归属**账户**，与拉取它的凭证无关
- **P1 落地**：机制 + 两个示范实现（`zones`、`dns_records`）；`workers`、`r2_buckets`、`kv_namespaces`、`d1_databases` 等 P2 按同一模式加表，不动框架

### 4.2 分析时序数据本地累积

```
analytics_daily   account_id · zone_id · date        · requests · threats · bandwidth · cache_hit · visitors · is_final · fetched_at
analytics_hourly  account_id · zone_id · hour_bucket · requests · ...                              · is_final · fetched_at
```

- **定型规则**：bucket 结束时间 < now(UTC) → `is_final = true`，永不重拉、永不覆盖；当前天/小时非 final，每次刷新覆盖
- **增量读取**：图表 queryFn = 本地读 final bucket → 只对缺口 + 非 final 尾部发 GraphQL → upsert 回表 → 返回合并结果
- **时间范围与数据源**：当天/24h 用 hourly（只拉当前小时+缺口）；**7d/30d 用 daily，几乎纯 SQLite，只补拉"今天"一个点**；1h 档为分钟级实时数据（GraphQL `httpRequests1mGroups`），只走内存/快照缓存，不入累积表
- **回填**：绑定成功后后台按 zone 回填近 30 天 daily（一次 GraphQL）；hourly 滚动保留 7 天，daily 永久保留
- 价值：历史数据（如 7月1日访问量）定型后固化本地，超出 Cloudflare 保留期后仍可查
- 防火墙事件流（逐条 event）只做快照缓存不累积；每日拦截计数进 `analytics_daily.threats`

### 4.3 数据表结构设计

分四类：App 域（`credentials`、`cf_accounts`、`account_credentials`、`settings`）、资源域（`zones`、`dns_records`，P1；workers/r2/kv/d1 等 P2 同模式扩展）、时序累积（`analytics_daily`、`analytics_hourly`）、基础设施（`sync_state`、`query_cache`）。drizzle 定义 + drizzle-kit 迁移；时间戳统一 epoch 毫秒 INTEGER。

**凭证与账户分离（多对多）**。一份凭证（token/OAuth 授权）可能覆盖多个 CF 账户（用户邮箱同时是 A、B 账户成员）；同一 CF 账户也可能被多份凭证覆盖（先绑了能看 B 的成员 token，B 的 owner 后来又绑自己的 token）。因此不存在"binding = 账户"的表——绑定动作 = 添加凭证 → `accounts.list` 发现其可见账户 → 写入账户表和关联表。

**credentials** — 凭证元数据（secret 存 SecureStore，key = `cf-cred-<id>`）

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 本地 uuid |
| auth_type | TEXT | `oauth` \| `token` |
| label | TEXT | 展示名（token 名称等，可编辑） |
| email | TEXT | 凭证背后的身份邮箱（`GET /user` / OAuth profile）。邮箱属于凭证身份而非 CF 账户——CF account 对象本身没有邮箱 |
| cf_user_id | TEXT | CF user id（同一人绑两份 token 时可识别） |
| status | TEXT | `active` \| `reauth_required` |
| created_at | INTEGER | |

**cf_accounts** — CF 账户，全局唯一，与哪份凭证发现的无关

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | Cloudflare account id |
| name / plan | TEXT | 账户名、套餐 |
| account_type | TEXT | standard / enterprise 等（来自 accounts.list） |
| color | TEXT | 账户色标（AccountChip） |
| raw | TEXT | accounts.list 原始 JSON，向前兼容 |
| created_at / updated_at | INTEGER | |

**account_credentials** — 多对多关联，复合 PK `(account_id, credential_id)`

| 列 | 类型 | 说明 |
|---|---|---|
| account_id | TEXT | → cf_accounts.id |
| credential_id | TEXT | → credentials.id |
| priority | INTEGER | 同账户多凭证时的选用顺序（权限更全的优先） |

- `clientFor(accountId)`：从该账户可用凭证中按 priority 选一份健康的建 SDK client；某凭证 401 时自动降级到下一份，全部失效才把账户标 degraded
- **同账户多凭证的权限可能不同**（scoped token 也许只有 DNS 读权限）：某凭证对某资源 403 时按 priority 换下一份重试，全部 403 才把该（账户 × 资源）标 degraded；同步 job 以账户为键，多凭证不会导致重复拉取

**多凭证下的同步语义**（以 `c1 → {A, B}`、`c2 → {A}` 为例）：

1. **资源同步以账户为键**：调度器为 A 只生成一个 job（不管 A 有几份凭证）；执行时 `clientFor(A)` 按 priority 选凭证（如 c1），走 c1 的限速桶，结果 upsert 到 `account_id = A` 的行。B 的 job 只能用 c1
2. **写入无冲突**：c1、c2 看到的是 CF 端同一份数据，行级 upsert 是幂等的 last-write-wins；`cf_accounts` 的元数据由任一凭证的 `accounts.list` 刷新，同样幂等
3. **凭证故障切换**：c1 被 429 熔断或 401 时，A 的 job 改用 c2 继续，B 的 job 顺延等 c1 恢复
4. **账户发现同步（credential 域 job）**：每份凭证有独立的 `account-discovery` job（低频，如 24h），重跑 `accounts.list` 并对账 `account_credentials`——你被移出账户 B 时，(B, c1) 关联被删除；B 因此失去全部凭证则触发级联清理。此类 job 在 `sync_state` 中以 credential id 为键记录（account_id 列语义泛化为 subject_id：账户域 job 存账户 id，凭证域 job 存凭证 id）
- 重复绑定天然幂等：owner 的 token 绑入时，账户 B 已存在 → 只新增一行关联 + 一行凭证，资源数据不重不冲

**settings** — 键值偏好：`key TEXT PK`、`value TEXT`（JSON），存主题、上次选中账户等。

**zones** — PK 用 CF 资源自身 id；`raw` 保留原始 JSON 负载，向前兼容新字段

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | CF zone id |
| account_id | TEXT NOT NULL，索引 | → cf_accounts.id（资源归属账户，与拉取用的凭证无关） |
| name / status / plan / ssl_mode | TEXT | 列表与详情展示字段 |
| paused | INTEGER | 0/1 |
| raw | TEXT | 原始 JSON |
| fetched_at | INTEGER | |

**dns_records** — 同模式：`id TEXT PK`（CF record id）、`account_id`、`zone_id`（索引）、`type`、`name`、`content`、`proxied INTEGER`、`ttl INTEGER`、`raw`、`fetched_at`

> 列表同步的删除语义：resource-sync 拉到完整列表后，除 upsert 外还删除该 scope 下不在最新结果中的行（`DELETE WHERE account_id=? AND zone_id=? AND id NOT IN (...)`），保证本地不残留已删资源。

**analytics_daily** — 复合 PK `(account_id, zone_id, date)`

| 列 | 类型 | 说明 |
|---|---|---|
| account_id / zone_id | TEXT | |
| date | TEXT | `YYYY-MM-DD`（UTC） |
| requests / cached_requests | INTEGER | 缓存命中率由二者推导 |
| bytes / cached_bytes | INTEGER | 带宽及节省量 |
| threats | INTEGER | 当日拦截计数 |
| uniques | INTEGER | 独立访客 |
| is_final | INTEGER | 定型标记（见 §4.2） |
| fetched_at | INTEGER | |

**analytics_hourly** — 结构同 daily，时间列为 `hour_bucket TEXT`（`YYYY-MM-DDTHH`，UTC），复合 PK `(account_id, zone_id, hour_bucket)`；清理任务滚动删除 7 天前数据。

**sync_state** — 调度器的依据（比扫业务行 fetched_at 准确，且覆盖空列表场景），复合 PK `(account_id, resource, scope)`

| 列 | 类型 | 说明 |
|---|---|---|
| account_id | TEXT | |
| resource | TEXT | `zones` \| `dns_records` \| `analytics_tail` \| … |
| scope | TEXT | 细分范围（如 zone id），无则 `*` |
| last_synced_at | INTEGER | 成功同步时间，SyncScheduler 据此算 TTL 到期 |
| last_status | TEXT | `ok` \| `error` |
| fail_count | INTEGER | 连续失败次数（重试策略输入） |
| last_error | TEXT | 最近错误摘要（degraded UI 展示） |

**query_cache** — TanStack Query persister 后端，单行 blob：`id INTEGER PK CHECK(id=1)`、`payload TEXT`、`updated_at INTEGER`。

**清理策略**：移除凭证 = 删 `credentials` 行 + SecureStore secret + 其 `account_credentials` 关联；关联清空后**失去全部凭证的账户**才按 `account_id` 级联清理资源/时序/sync_state 数据（仍有其它凭证覆盖的账户不受影响）。hourly 滚动 7 天；daily 永久保留。

### 4.4 多账户聚合

- Query key 规约：`[accountId, resource, params]`
- "All Accounts" 视图 = `useQueries` 并发查所有账户 → 内存合并排序
- 单账户失败不拖垮聚合视图（对应设计稿 per-account 健康状态行）

## 5. 异步同步引擎（SyncEngine）

```
触发源（绑定成功 / 调度器 / 手动下拉 / 进入屏幕）
        ↓ 投递 job（不阻塞 UI）
SyncEngine：p-queue 队列（并发上限 2，支持优先级）
  job 类型：initial-sync · analytics-backfill · resource-sync · tail-refresh · account-discovery（凭证域，对账可见账户）
        ↓ 完成后
① upsert SQLite → ② invalidateQueries(相关 key) → ③ mitt 广播 sync:done
```

- **UI 本地优先、永不 await 同步**：先渲染本地数据，SyncEngine 后台补新，query 失效自动刷新
- **通知分级**：常规刷新静默；用户显式触发的完成时 toast；失败标 degraded 状态，不弹阻断错误
- **job 幂等**（upsert + final 定型保证重复执行无害）；失败重试 2 次后记录状态，下次触发再补
- 通知/解耦的大头由 TanStack Query 承担（invalidate = 发布-订阅）；mitt 只管 query 体系外事件（toast、绑定状态、同步进度）
- 队列不持久化：job 可随时从本地状态（fetched_at + final 规则）重新推导，重启不丢

## 6. 定时拉取与规模化（SyncScheduler）

**声明式调度**，每类资源注册时声明策略：

```ts
syncPolicy: {
  zones:           { ttl: '30m', priority: 'normal' },
  dns_records:     { ttl: '1h',  priority: 'low' },
  analytics_tail:  { ttl: '5m',  priority: 'high', onlyWhenVisible: true },
  analytics_daily: { ttl: '24h', priority: 'low' },
}
```

- 不设 per-job 定时器：**全局 tick（前台 60s）扫描 `sync_state` 表**（结构见 §4.3），`now - last_synced_at > ttl` 的（account × 资源 × scope）组合生成 job 入队
- 无状态可恢复：该拉什么永远从"数据多旧"推导；重启不丢调度
- 规模线性：100 账号也只是扫表批量入队；到期任务加 jitter 打散避免齐发；可见屏幕 job 高优先级插队
- **API 配额治理**（CF 限流按账户/token，约 1200 次/5min）：
  - **按 credential（token）分桶限速**（保守 100 次/5min）——CF 限流以 token 为单位，一份凭证覆盖多账户时这些账户共享同一个桶，限速器必须建在凭证维度而非账户维度
  - 合并请求：GraphQL 一次查多 zone（`zoneTag_in`）；REST 列表 `per_page=50`
  - 429 → 该 credential 熔断至 `Retry-After`，使用该凭证的 job 顺延；有备选凭证的账户可切换凭证继续
- P2：expo-background-task（iOS BGAppRefresh / Android WorkManager）跑小 job；大批量同步永远在前台

## 7. 导航与 UI 结构

```
app/
  _layout.tsx          providers（Query/Theme/Account）+ 解锁门禁
  unlock               解锁屏（密码 / Face ID）
  onboarding/          首次流程：创建本地账号 → 绑定 CF（OAuth 或粘贴 Token）
  (tabs)/
    (home)/     index + dns / firewall / analytics / alerts / lb / audit / billing
    (zones)/    index + [zoneId] + [zoneId]/ssl + [zoneId]/cache
    (storage)/  index（P1 骨架）
    (compute)/  index（Workers/Pages 分段）
    (more)/     index + 设置
  account-sheet        全局账户切换（formSheet 模态）
```

- 设计稿共享组件一比一移植：`ListRow`、`Card`、`SectionLabel`、`MetricTile`、`Pill`、`AccountChip`、`EmptyState`、`AccountBar`
- 主题：设计稿 CSS 变量（`--app-bg`、`--app-surface`、label 透明度梯度）→ NativeWind token，深/浅色存 `settings`；主色 Cloudflare 橙 `#f6821f`
- 图表统一封装 `TrafficChart`（面积图 + 渐变 + 1h/24h/7d/30d 范围切换），Home 与 Analytics 复用

## 8. P1 API 映射

| 屏幕 | 数据 | 来源 |
|---|---|---|
| Onboarding/绑定 | OAuth PKCE、Token 校验、账户识别 | SDK：`user.tokens.verify`、`accounts.list` |
| Home | 聚合指标 + 账户健康 + 请求曲线 | zones + analytics 多账户聚合 |
| Zones | 列表/详情 | SDK：`zones.list` |
| DNS | 记录列表 | SDK：`dns.records.list` |
| Analytics | 曲线 + 指标分解 | GraphQL：`httpRequests1hGroups` / `1dGroups`（增量拉取） |
| Firewall | 实时事件 + 拦截计数 | GraphQL：`firewallEventsAdaptive` |
| Compute | Workers 只读列表 | SDK：`workers.scripts.list`；Pages P2 |
| Storage / More 二级页 | 骨架 + EmptyState | P2 |

## 9. 错误处理

- **聚合视图账户级隔离**：单账户失败只在该账户行标 degraded/error（设计稿已有此 UI）
- **401/token 失效**：先 OAuth refresh；失败则该 credential 标 `reauth_required`，账户若有其它可用凭证自动切换，全部失效才引导重新授权，不清数据
- **429**：全局 fetch 封装尊重 `Retry-After` + credential 级熔断（§6）；React Query 指数退避
- **离线**：展示 SQLite 数据 + "数据截至 xx:xx" 横幅，恢复后自动刷新
- 全局 ErrorBoundary + toast

## 10. 测试策略

- **单测重点**（数据层是核心资产）：时序增量拉取/final 定型、多账户聚合合并、SyncScheduler 到期推导与限速、token provider 刷新流、GraphQL helper
- **组件测试**：RNTL + mock QueryClient：Home、Zones、绑定流程
- **E2E**：P2（Maestro）

## 11. 风险与前置验证（实施计划第一步）

| 风险 | 应对 |
|---|---|
| `cloudflare` SDK 在 Hermes/RN 的兼容性 | **Spike 先行**：空 Expo 工程验证 zones.list 等调用；兜底 = 用 SDK 类型 + 自写轻量 fetch 层，接口形状不变 |
| CF OAuth client 对移动端 redirect（custom scheme）的支持细节 | Spike 时用 expo-auth-session 实测；兜底 = API Token 绑定路径（本就是 P1 必备） |
| p-queue ESM-only 打包 | Metro 支持 ESM；兜底 = eventemitter3 + 自写 50 行并发控制 |

## 12. 实施顺序建议（供 writing-plans 参考）

1. Spike：SDK Hermes 兼容 + OAuth redirect 验证
2. 工程脚手架：Expo + Router + NativeWind + 主题 token + 5 Tab 骨架
3. 本地账号 + 解锁流程
4. CF 绑定（Token 路径先行，OAuth 随后）+ credentials/cf_accounts/account_credentials 表
5. 数据层地基：drizzle schema、ResourceStore、GraphQL helper、token provider
6. SyncEngine + SyncScheduler + 限速
7. 核心屏幕接真数据：Zones → DNS → Home 聚合 → Analytics（时序累积）→ Firewall
8. Compute 只读列表、占位页、错误处理打磨、测试补齐
