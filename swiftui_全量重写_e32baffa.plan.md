---
name: SwiftUI 全量重写
overview: 在新仓库中把 Opsflare 重写为 iOS 18+、Swift 6 的纯 SwiftUI 多 Cloudflare 账号运维 App。最终保持现有 REST/GraphQL/认证/管理能力完整，UI 改为原生骨架、定制英雄区、可交互图表和克制动效；实现过程按安全与集成风险分阶段验收，AI 不在本次范围。
todos:
  - id: repo-skeleton
    content: "Phase 0: 仓库、XcodeGen project.yml、App/Widget/test targets、七个 package、App Group、Widget Data Protection、CI、oauth-relay 拷贝与日志加固，全部完成并通过编译与测试"
    status: completed
  - id: security-contract
    content: "Phase 0: 固化安全边界和 connectionId/accountId/resourceId 复合身份；token 仅进 App 私有 Keychain 且 service 名与 Expo 版的 app 区分开，extension 不共享凭据"
    status: completed
  - id: legacy-purge
    content: "Phase 0: 沿用 com.cloudflareops.app 时首次启动一次性删除 Expo 版遗留 Keychain 条目(service = app / app:auth / app:no-auth)，用 UserDefaults 标记只跑一次，并加单测证明新 App 自己的条目不受影响"
    status: completed
  - id: design-tokens
    content: "Phase 0: 颜色 Asset Catalog(20 个 color set,12 个带 dark 变体)、spacing/radius/typeScale、Palette 与 StatusTone 访问器,由 Scripts/generate-colors.py 生成"
    status: completed
  - id: i18n
    content: "Phase 0: 595/574 个键转成 574 个 String Catalog 键(21 个复数、7 个位置化参数、0 个未翻译)，由 Scripts/generate-xcstrings.py 生成并有 bundle 级测试守护"
    status: completed
  - id: ops-shared-models
    content: "Phase 0: OpsSharedModels 提供 App Group DTO(WidgetSummary/EntityCatalog)、原子读写、格式化与审计展示工具；不含任何安全代码，供 Widget 链接"
    status: completed
  - id: ops-security
    content: "Phase 0: OpsSecurity 补齐版本化口令记录、LAContext 与 TTLCache/并发工具(Keychain 封装与遗留清除已完成)；仅 App target 链接"
    status: pending
  - id: cf-rest
    content: "Phase 1: URLSession REST 管线、错误映射、分页、ReplayPolicy、12 个资源模块和 71 个导出函数"
    status: pending
  - id: cf-graphql
    content: "Phase 1: GraphQL 客户端、四个查询模块、23 个导出函数、降级查询和聚合逻辑"
    status: pending
  - id: oauth
    content: "Phase 1: ASWebAuthenticationSession + OAuth Code/PKCE，完整 state/callback/重放校验、刷新/撤销和 relay 日志加固"
    status: pending
  - id: token-provider
    content: "Phase 1: OAuthBearerProvider single-flight、轮换刷新、原子持久化、401 单次重试和 ReplayPolicy 接线"
    status: pending
  - id: cf-orchestration
    content: "Phase 1: 以 connectionId/accountId 确定性路由连接，迁移 snapshots/management/cache/dnsValidation 和 TTL 契约"
    status: pending
  - id: tests-network
    content: "Phase 1 gate: 迁移 API/analytics/OAuth 测试，覆盖 actor 重入、错误重试、缓存和多连接同账号路由"
    status: pending
  - id: design-system
    content: "Phase 2: 基础组件、认证输入、空态/骨架、列表型与滚动型 scaffold，以及静态版 HeroHeader 布局容器(先不带视差/发光/Lottie，避免 Phase 3 屏幕按普通标题布局后返工)"
    status: pending
  - id: nav-shell
    content: "Phase 2: AuthState 根导航、五个独立 NavigationStack、AccountScope 和防乱序 ViewModel 模式"
    status: pending
  - id: auth-screens
    content: "Phase 2: onboarding/unlock/account-error/connect-account 主链路与生物识别启用保护"
    status: pending
  - id: home-readonly
    content: "Phase 3: Home 及其 analytics/performance/firewall/alerts/audit/lb/billing 只读能力"
    status: pending
  - id: zones-readonly
    content: "Phase 3: Zones/zone 概览/DNS/analytics/firewall/SSL/cache 只读能力和 IA 合并"
    status: pending
  - id: storage-readonly
    content: "Phase 3: R2/KV/D1 列表、详情、域名和指标只读能力"
    status: pending
  - id: compute-readonly
    content: "Phase 3: Workers/Pages 列表、详情、版本、部署、路由和指标只读能力"
    status: pending
  - id: settings-readonly
    content: "Phase 3: 资料、连接状态、主题、生物识别和 inline 语言设置"
    status: pending
  - id: ops-actions
    content: "Phase 4: 收纳全部 Cloudflare 与本地连接变更，声明复合资源身份、ReplayPolicy、权限需求、确认和预览"
    status: pending
  - id: mutations
    content: "Phase 4: 五个 tab 的全部写操作接入 OpsActions，统一确认、反馈、缓存失效和本地操作日志"
    status: pending
  - id: motion-prototype
    content: "Phase 5: 在样板页验证英雄区、双层发光 Chart、探针、转场和无障碍/低电量降级"
    status: pending
  - id: motion-polish
    content: "Phase 5: 验证通过后批量接入 MotionKit、共享时间轴、数字过渡、有限错开入场和触感"
    status: pending
  - id: animation-assets
    content: "Phase 5: 引入经许可复核的 Lottie 资产和 Reduce Motion 静态首帧"
    status: pending
  - id: entity-catalog
    content: "Phase 6: 定义与 WidgetSummary 分开的版本化 EntityCatalog(zone/bucket/KV namespace/worker/pages 的 id + 显示名 + connection/account 归属)，App 刷新快照后原子发布，供后台 EntityQuery 使用；DNS 记录不进 catalog"
    status: pending
  - id: app-intents
    content: "Phase 6: OpsIntents package、AppIntentsPackage 暴露、复合 AppEntity、requestDisambiguation、AppShortcuts.xcstrings 与最多 10 个零配置 shortcuts、pending-action 前台执行；DNS 记录类实体只在前台实时解析"
    status: pending
  - id: widget-summary
    content: "Phase 6: 定义版本化 WidgetSummary(仅流量指标与 sparkline)，App 原子发布脱敏摘要，删除连接时与 EntityCatalog 一起清理"
    status: pending
  - id: widgets-controls
    content: "Phase 6: 首批 systemMedium + accessoryRectangular 流量组件和打开 App 的控制中心按钮"
    status: pending
  - id: tests-ui
    content: "Phase 7: XCUITest、Intent/Widget、最大字体、Reduce Motion/Transparency 和锁屏隐私测试"
    status: pending
  - id: perf-pass
    content: "Phase 7: 最低支持设备上的滚动/图表/内存/启动/Widget 性能验收"
    status: pending
  - id: extensions-expand
    content: "Phase 7 optional gate: 稳定后补其余 Widget family 和非首批 Intent"
    status: pending
  - id: ship
    content: "Phase 7: 签名权限、App Group/Widget Data Protection 描述文件、加密声明、图标、Lottie 许可复核、归档与 TestFlight"
    status: pending
isProject: false
---

# Opsflare 原生 SwiftUI 重写计划

## 目标

把现有 Expo/React Native App 重写为纯 SwiftUI iOS App，最终完成现有功能对齐，同时重做信息架构、视觉和交互。

实现过程分阶段验收，最终仍可一次发布；“分阶段”是降低集成风险，不是削减最终功能。

## 已确定范围

- 只做 iOS，最低 iOS 18，Swift 6 严格并发
- 新仓库为opsflare-ios，与 cfops-expo下面一个子目录；旧仓库仅作为行为规格和测试参考；旧仓库仅作为行为规格和测试参考
- 沿用 bundle ID `com.cloudflareops.app`，保留 App Store 身份；首次启动一次性清除 Expo 版遗留 Keychain 条目
- 不兼容旧 App 的本地账户数据，用户升级后需重新创建本地账户并重新连接 Cloudflare
- 网络使用 `URLSession` + async/await + `Codable`，不引入第三方 HTTP 框架
- UI：原生骨架 + 定制英雄区 + 橙色强调 + 可交互图表
- 动效：SwiftUI 原生动画为主，Lottie 仅用于少数语义动画
- 支持多 Cloudflare connection 与 account
- App Intents、流量 Widget、控制中心入口在范围内
- 不做 Live Activity；不做 AI

## 现有面积

- `app/`：30 个非 layout 路由文件、7 个 `_layout.tsx`，约 13.7k 行
  - 26 个 tab 内路由 + 4 个认证/引导路由
  - 21 个 tab 内 leaf 路由，不含 5 个 tab index
- `src/cloudflare/`：约 5.5k 行
  - REST：12 个资源模块，含 client helpers 共 71 个导出函数
  - GraphQL：4 个查询模块，23 个导出函数
  - 编排层：41 个导出函数
- i18n：英文 595 个 leaf keys，简体中文 574 个。差额是 21 个 `_one` 变体，**不是缺漏**——CLDR 里中文只有 `other` 一个复数类别，这些键本就不该存在。转换后两种语言各 574 个 catalog 键
- UI：22 个 `src/components/ui/*.tsx`，另有 `ZoneSubpage`、`AuthTextInput`、`CollapsibleTitle`

## 目标结构

仓库根：`/Users/jt.gui/workspace/opsflare-ios`（已创建，含 git、`.gitignore`、`README.md`、`AGENTS.md` 与下列目录骨架）。

```text
opsflare-ios/
├─ Opsflare.xcodeproj
├─ Opsflare/
│  ├─ OpsflareApp.swift
│  ├─ Root/
│  ├─ Features/{Onboarding,Unlock,Home,Zones,Storage,Compute,Settings}/
│  └─ Resources/{Localizable.xcstrings,Assets.xcassets,Animations/}
├─ OpsflareWidgets/
├─ Packages/
│  ├─ OpsSharedModels/
│  ├─ OpsSecurity/
│  ├─ CloudflareKit/
│  ├─ OpsActions/
│  ├─ OpsIntents/
│  ├─ DesignSystem/
│  └─ MotionKit/
├─ OpsflareTests/
├─ OpsflareUITests/
└─ oauth-relay/
```

依赖方向：

```text
OpsSharedModels          （App Group DTO、格式化，无安全代码）
  ↑            ↑
OpsSecurity   OpsIntents （Keychain/LAContext/自动锁 ← 仅 App）
  ↑
CloudflareKit
  ↑
OpsActions

DesignSystem
MotionKit → DesignSystem + lottie-ios

App    → 全部 package
Widget → OpsSharedModels + OpsIntents + DesignSystem（静态子集）
```

原本把 Keychain、LAContext、自动锁和 App Group DTO 放在同一个 `OpsCore` 里，会让 Widget 链接到安全代码——“Widget 碰不到凭据”就只靠 entitlement 保证，依赖图本身不设限。拆成两个 package 后这条边界是结构性的，评审时看依赖声明就能确认。

硬约束：

- Widget target 不得依赖 `CloudflareKit` 或 `OpsSecurity`，不得读取 Cloudflare token
- `OpsIntents` 不依赖 `OpsActions` 与 `CloudflareKit`；变更 Intent 只写 pending action
- Feature 不能旁路 `OpsActions` 调用 Cloudflare mutation
- `DesignSystem` 不反向依赖 `MotionKit`
- `lottie-ios` 在 Phase 5 随 `MotionKit` 实现引入，Phase 0 的骨架不带这个依赖

## 安全边界

### 本地锁的含义

本地口令和生物识别是 **App UI 隐私锁**。Cloudflare 凭据的实际安全边界是 iOS Data Protection 与 App 私有 Keychain。

- token 使用 `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- 不配置供 Widget/Intent extension 使用的共享 Keychain access group
- 生物识别启用前要求当前口令或系统认证
- App 锁定时清理内存中的 bearer、解密缓存和敏感 ViewModel 状态

如果未来需要“App 口令在密码学上加密 Cloudflare token”，应作为独立安全迁移设计，而不是把 UI 状态误认为凭据访问控制。

### 遗留 Keychain 清除

Keychain 条目在 App 更新时不会被删除。沿用 `com.cloudflareops.app` 意味着 Expo 版写入的条目会继续留在设备上，其中 `cf-token-*` 装的是**真实可用的 Cloudflare API token**——新 App 既不读也不撤销，等于永久留了一份无人管理的凭据。必须主动清除。

`expo-secure-store` 的 iOS 实现（`SecureStoreModule.swift` 的 `query(with:options:requireAuthentication:)`）用的是：

- `kSecClass` = `kSecClassGenericPassword`
- `kSecAttrService` = `options.keychainService ?? "app"`，再按需追加 `:auth` 或 `:no-auth`
- `kSecAttrAccount` 与 `kSecAttrGeneric` = key 名的 UTF-8 数据

App 从未传 `keychainService`，所以全部遗留条目只落在三个 service 上。按 service 整体删除即可覆盖 `cf-token-*` / `cf-oauth-*` 这类动态键，不需要先读 `cf-connections-v1` 枚举 connection ID：

```swift
for service in ["app", "app:auth", "app:no-auth"] {
    SecItemDelete([
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
    ] as CFDictionary)
}
```

涉及的遗留 key：`local-account-v2`、`cf-connections-v1`、`cf-token-{connectionId}`、`cf-oauth-{connectionId}`、`app-theme`、`app-language`。

配套约束：

- **新 App 的 Keychain service 必须换名**（例如 `com.cloudflareops.app.credentials`），否则上面这段会删掉自己的数据。换名后清除与写入的先后顺序也不再重要
- 用 `UserDefaults` 标记（如 `legacyKeychainPurged.v1`）保证只跑一次
- `errSecItemNotFound` 是正常结果，不算失败
- `app-theme` / `app-language` 是非机密偏好，新 App 直接用 `UserDefaults`，不再进 Keychain
- 单测要证明：清除后遗留 service 无残留，且新 App 自己 service 下的条目不受影响

### 本地口令记录

记录必须包含：

- format version
- KDF、PRF
- iteration count
- salt
- output length
- verifier

PBKDF2 成本在最低支持设备上校准到可接受的交互延迟，参数随记录持久化；成功解锁后可升级旧参数。比较采用常数时间实现，并增加失败尝试节流。

## 多账号与凭据路由

现有 TS 会按 `accountId`/`zoneId` 去重，并发时可能由先完成的 connection 决定 bearer。Swift 版不得复制这个竞速行为。

所有资源统一使用：

```swift
struct ConnectionScopedResourceID<ResourceID: Hashable & Sendable>: Hashable, Sendable {
    let connectionID: String
    let accountID: String?
    let resourceID: ResourceID
}
```

规则：

- 读取、写入、缓存键、Intent entity ID、Widget scope 都保留 `connectionID`
- 同一 Cloudflare account 被多个 connection 访问时，UI 可合并展示，但必须保留可用凭据路线
- 执行操作前重新验证 connection/account/resource 归属，不能信任 Intent 传入参数
- 多个路线权限不同则要求用户明确选择，不按完成顺序或数组顺序选 bearer
- 删除 connection 时同步清除它的缓存、Widget 摘要、entity catalog 和 pending action

## 网络与认证

### REST/GraphQL 客户端

保留 TS 版错误映射：

1. 网络错误 → `.network`
2. HTTP 401 → 进入 OAuth 刷新判断
3. JSON 解析失败：403 → `.forbidden`，其他 → `.api`
4. 403、Cloudflare error 10000、`Authentication error` → `.forbidden`
5. 其他 HTTP 错误或 `success == false` → `.api(serverMessage:)`

保留三种分页：

- page：最多 20 页、并发 4
- cursor：KV keys 最多 5 页
- serial：KV/D1/RUM 最多 10 页

保留：

- Workers/Pages legacy list options
- alerts 3 路径 fallback
- audit 4 路径 fallback
- GraphQL query fallback
- RUM host 最长后缀匹配

### 请求重放

不能假设所有收到 401 的写请求都可安全重发。每个 endpoint 声明：

```swift
enum ReplayPolicy: Sendable {
    case safe          // GET/HEAD、只读 GraphQL POST
    case idempotent    // 已逐项确认语义
    case unsafe        // 刷新 token，但不自动重发
}
```

- `.safe`：刷新成功后最多重试一次
- `.idempotent`：必须在 endpoint 测试中说明依据
- `.unsafe`：返回“凭据已刷新、操作结果未知/请重新确认”，或先查询服务端状态再决定
- 403 永不刷新

### AuthorizationContext

scope 预检只是 UX，不是安全边界：

```swift
struct AuthorizationContext: Sendable {
    let connectionID: String
    let authType: AuthType
    let oauthScopes: Set<String>?
    let accountIDs: Set<String>
    let zoneIDs: Set<String>?
}
```

- OAuth scope 与 API token permission 分开建模
- requirement 支持 all-of / any-of / unknown
- 缺少 scope 信息时返回 unknown，不得误判允许或拒绝
- Cloudflare 403 始终是最终权威结果

## OAuth Code + PKCE

每次授权必须：

- 生成独立高熵 `state` 和 code verifier
- challenge 仅使用 S256，base64url 无 padding
- state/verifier 绑定单次 session，仅保存在内存
- 精确校验回调 `scheme == cfops`、host、path
- state 不匹配、缺失或已消费时在 token exchange 前拒绝
- token exchange 的 `redirect_uri` 使用注册的 HTTPS relay URI，不使用 App scheme
- OAuth client 作为 public native client，不嵌入 client secret

测试包括：错误/缺失/重放 state、错误 callback path、重复 callback、缺 code、错误 verifier。

`oauth-relay` 保留纯重定向职责，但不能原样保留 observability。当前 `oauth-relay/wrangler.jsonc` 是 `"observability": { "enabled": true }`，而 Workers Logs 的 invocation log 消息包含请求 URL——授权码和 `state` 都在 query 里。改成：

```jsonc
{
  "observability": { "enabled": false }
}
```

- 采样率降低不算解决，`head_sampling_rate` 不为 0 就仍会留存
- 保留 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`
- 保留只转发 RFC 6749 §4.1.2 那六个参数、丢弃其余的行为
- 断开连接时对 OAuth grant 做 best-effort revoke，本地删除不因离线失败而阻塞

自动锁 suspension 改为有过期时间的 lease；授权被放弃或超时后销毁 state/verifier，返回 App 时重新锁定。

## OAuth token 刷新

客户端依赖 provider，而不是裸 bearer：

```swift
struct BearerCredential: Sendable {
    let accessToken: String
    let authorization: AuthorizationContext
}

protocol BearerProvider: Sendable {
    func credential() async throws -> BearerCredential
    func refreshIfRejected(_ rejectedToken: String) async throws -> BearerCredential?
}
```

`OAuthBearerProvider` 是 actor，但 actor 本身不保证 single-flight。必须在首次 suspension 前登记：

```swift
private var refreshTask: Task<TokenSet, Error>?
```

规则：

- 同一 connection 同时只能有一个 refresh task
- 60 秒到期提前量
- 当前 access token 已不同于 rejected token 时直接返回当前值
- refresh response 未返回 refresh token 时保留旧值
- 更新前校验 credential generation，防止重连/删除后的旧 task 覆盖新 grant
- token bundle 整体原子写入 Keychain
- 持久化失败时 bounded retry，并标记 `nonDurable`
- `nonDurable` grant 可继续完成当前请求，但禁止再次刷新；进程退出后可能要求重连
- token endpoint 拒绝 → `.sessionExpired`
- 网络失败 → `.network`
- 不自动弹出 OAuth 浏览器；标记 `ConnectionIssue`，由用户主动重连

## Cache contract

必须显式复刻 TTL：

- zones/storage/compute/resolved accounts：30 秒
- analytics/worker metrics/storage metrics：60 秒
- zone range：300 秒
- connection metadata：进程内缓存
- legacy list options：进程内集合

约束：

- fetch 失败不写入缓存
- force refresh 旁路 TTL
- mutation 成功后由 `OpsActions` 声明要失效的 cache keys
- connection 增删/重连后执行全量 snapshot 失效
- ViewModel 每次 load 带 generation/cancellation，旧请求不得覆盖新结果

## OpsActions

所有变更操作收进单一层：

- zone：purge、pause、security level、delete
- DNS：create/update/delete
- KV：namespace create/delete、put、bulk delete
- R2：bucket create/delete、object delete、managed/custom domain
- D1：create/delete
- Workers：rollback、subdomain、domain attach/detach
- Pages：rollback/retry、preview setting、domain add/delete
- 本地：add/remove/reconnect connection、biometric/theme/language settings

每项操作声明：

- 稳定 action ID
- `ConnectionScopedResourceID`
- 本地化标题与描述
- 类型化参数
- `isDestructive`
- `ReplayPolicy`
- `AuthorizationRequirement`
- 可选 preview/dry-run
- cache invalidation
- 审计日志字段

Feature 层只调用 `OpsActions`。

## App Intents 与控制中心

App 的自定义锁无法控制 extension 进程。安全规则：

- 后台只读 Intent 只能读取脱敏、版本化的 App Group 摘要
- 需要实时 Cloudflare 网络访问的 Intent 必须进入前台
- 变更 Intent 不在 `perform()` 中执行 mutation
- 变更 Intent 只写入不含 secret 的 `PendingActionDescriptor`；iOS 18–25 使用 `OpenIntent` 打开 App，iOS 26+ 可渐进采用 `supportedModes`
- App 进入前台后先走 AuthState 解锁，再重新解析实体、显示确认，最后调用 `OpsActions`
- `IntentAuthenticationPolicy` 可作为系统设备认证的额外保护，但不能代替 App 自定义解锁
- 不使用已废弃的 `openAppWhenRun`

实体：

- ID 包含 connection/account/resource
- `DisplayRepresentation.subtitle` 显示 connection/account
- 多个候选必须 `requestDisambiguation`
- 后台 `EntityQuery` 只查 App Group 里的 `EntityCatalog`，不接触 token

`EntityCatalog` 是**独立于 `WidgetSummary` 的另一份文件**。`WidgetSummary` 只有流量指标和 sparkline，里面没有任何资源清单，后台的实体查询无据可查——这是必须单独建的一层：

```swift
struct EntityCatalog: Codable, Sendable {
    let schemaVersion: Int
    let revision: UInt64
    let credentialGeneration: UInt64
    let generatedAt: Date
    let zones: [CatalogEntry]
    let r2Buckets: [CatalogEntry]
    let kvNamespaces: [CatalogEntry]
    let workers: [CatalogEntry]
    let pagesProjects: [CatalogEntry]
}

struct CatalogEntry: Codable, Sendable {
    let connectionID: String
    let accountID: String
    let accountName: String
    let resourceID: String
    let displayName: String
}
```

**DNS 记录不进 catalog。** 单个 zone 可能有上千条记录且变化频繁，缓存一份离线清单既撑大文件也很快失真。DNS 相关实体只在前台实时解析；对应的变更走“打开 App → 解锁 → 在 zone 内选记录”这条路径，而不是让 Siri 直接按名字定位一条记录。

`OpsIntents` 通过 `AppIntentsPackage` 让 App 与 Widget extension 发现共享 intent。可以定义约 15 个 Intent，但 `AppShortcutsProvider` 最多发布 10 个零配置 shortcuts；其余保留在 Shortcuts App 中。

控制中心：

- 不使用需要“先打开 App 再确认”的 `ControlWidgetToggle`
- 首版提供“打开清缓存确认页”和“打开 Under Attack 操作页”的 Button
- 所有控制模板标记隐私属性

## Widget

Widget 只展示脱敏预聚合流量摘要，不执行 Cloudflare API。

```swift
struct WidgetSummary: Codable, Sendable {
    let schemaVersion: Int
    let revision: UInt64
    let credentialGeneration: UInt64
    let scope: WidgetScope
    let generatedAt: Date
    let expiresAt: Date
    let metrics: TrafficMetrics
    let sparkline: [TrafficPoint]
    let issues: [WidgetIssueSummary]
}
```

这份文件只承载展示用的流量数字；资源清单在 `EntityCatalog` 里，两者分开演进、各自带 `schemaVersion`。

- App 成功刷新 analytics 后写摘要；成功刷新 zones/storage/compute 快照后写 catalog
- 原子文件替换，启用 `NSFileProtectionComplete`
- Widget extension 启用 Data Protection Complete
- stale、损坏、schema/generation 不匹配 → placeholder
- 删除 connection 前先删对应摘要与 catalog 条目，再 reload timelines
- `.privacySensitive()` 作为补充，不把它当唯一安全保证
- `WidgetCenter.reloadTimelines` 只是请求，不能假设立即刷新
- 首批只做 `systemMedium` 与 `accessoryRectangular`
- 适配 `.fullColor`、`.accented`、`.vibrant`，使用 `containerBackground(for:)`
- Widget 不依赖连续动画、Lottie 或发光模糊

## UI 与信息架构

视觉方向：原生骨架 + 定制英雄区 + 发光图表 + 数据详情联动。

- 原生 `List` / `Form` / `.searchable` 保证系统手感与无障碍
- Home、zone、worker、bucket、KV namespace 使用定制英雄区
- 深色为主视觉，浅色单独设计；橙色只做强调
- iOS 26 使用 `glassEffect`，iOS 18 降级 material；CI 必须使用 Xcode 26 SDK 才能编译新 API

IA：

- zone cache 与 SSL 合并进 zone 概览可展开区域
- DNS/analytics/firewall 保持 push
- Under Attack 改为 sheet
- language 改为 Settings inline picker
- Storage/Compute 创建流程保持 sheet
- 长列表使用列表型 scaffold，不把大列表嵌入 ScrollView

## 动效

复杂动效不阻塞主链路。先做样板页，验收后批量接入：

- zoom transition 需要 matching source/destination ID
- Reduce Motion 时取消自定义 zoom，使用系统默认导航
- 英雄区视差
- 数字 `.numericText`
- 首屏最多 8 项有限错开入场
- 双层 Chart：后层负责 blur/blend glow，前层负责 axes/hit testing
- `chartOverlay` 拖拽探针与共享时间轴
- 探针跨点触感使用 Equatable trigger

无障碍与性能：

- Reduce Motion：关闭视差、错开和 Lottie 循环
- Reduce Transparency：玻璃换实色
- 低电量：关闭 glow
- 发光/颜色不承载唯一语义
- Dynamic Type 使用现有 maxScale 约束

Lottie 仅用于引导、空态、解锁成功、Under Attack 状态、清缓存反馈；逐项记录来源、许可和静态首帧。

## 分阶段执行与退出标准

### Phase 0：Foundation

交付：可编译 App/Widget 空壳、安全与身份契约、token/i18n 基础。

退出：

- CI 可编译 App、Widget 和全部 package
- Widget target 的依赖声明里没有 `CloudflareKit` 与 `OpsSecurity`，且无 Keychain Sharing entitlement
- 复合资源 ID 有单测
- 遗留 Keychain 清除有单测：三个旧 service 清空，新 service 条目保留
- String Catalog 有 574 个键，其中 21 个复数键、7 个位置化参数键、0 个未翻译；zh-Hans 的复数键只有 `other` 变体

### Phase 1：Network

交付：REST/GraphQL/OAuth/token refresh/cache 全部无 UI 跑通。

退出：

- 迁移核心 API 与 analytics tests
- actor 重入只产生一次刷新
- OAuth state/callback/replay 测试通过
- unsafe mutation 不会因 401 自动重发
- 相同 account 的多个 connection 可确定性选择

### Phase 2：Shell + Auth

交付：onboarding → unlock → connect → tabs，以及静态版 `HeroHeader` 与两种 scaffold。

英雄区容器在这一阶段就要定好布局与尺寸契约（标题、主指标、sparkline 槽位），Phase 5 只往里加视差、发光和 Lottie。否则 Phase 3 的屏幕会先按普通导航标题排版，Phase 5 再整体重排。

### Phase 3：Read-only parity

交付：五个 tab 全部读取、搜索、筛选、详情和 pull-to-refresh，覆盖下面「路由对齐清单」里的每一条。

此处进行第一次真实数据与 IA 设计复核。

### Phase 4：Mutations

交付：现有所有写能力通过 OpsActions 对齐。

退出：Feature target 中不存在直接 Cloudflare mutation 调用。

### Phase 5：Motion + visual polish

交付：样板验证通过后批量应用英雄区、图表和动效。

### Phase 6：Extensions

交付：`EntityCatalog`、首批 Intent、`systemMedium`、`accessoryRectangular` 和打开 App 的控制按钮。

Widget、Intent 与控制中心是**旧 App 没有的新能力**，不属于功能对齐范围。因此 Phase 6/7 里对它们的裁剪不影响“功能对齐”这个目标；对齐在 Phase 4 结束时已经达成。

### Phase 7：Release

交付：UI/extension tests、性能、其余 extension 可选扩展、TestFlight。

## 测试要求

### Network gate

- REST 五步错误映射、三种分页、fallback 与 TTL
- OAuth state/callback/verifier 重放
- actor 在首次 await 时的重入
- 并发 N 个 401 只刷新一次
- 刷新后再次 401 不循环
- 403 不刷新
- 网络失败不转成 session expired
- API token 401 不刷新
- unsafe mutation 不自动重放
- 同 account 多 connection 的路由

### UI / extension gate

- onboarding/unlock/connect/五 tab/关键 mutation
- 旧 load 不覆盖新 refresh
- 最大 Dynamic Type
- Reduce Motion/Transparency
- pending action 在 App 解锁前不执行
- crafted entity ID 不能跨 connection
- Widget summary 原子写入、损坏、过期、generation 不匹配
- 删除 connection 后 Widget 不显示残留
- 锁屏显示 placeholder

## 发布配置

- Bundle ID、`cfops` URL scheme、Apple Team
- OAuth client ID/redirect/default scopes 放入 xcconfig；client ID 不是 secret，不嵌入 client secret
- Face ID usage description
- `ITSAppUsesNonExemptEncryption`
- App Group 与 Widget Data Protection entitlement
- 不添加 Widget Keychain Sharing
- AppShortcuts.xcstrings
- Xcode 26 SDK CI，部署目标 iOS 18
- Lottie 资产许可
- TestFlight 真机测试：最低支持机型、深浅色、锁屏、Widget、控制中心

## 附录 A：路由对齐清单

Phase 3/4 的验收清单。左边是旧 App 的路由文件，右边是新 App 的落点。共 30 个非 layout 路由。

认证与引导（4）：

- `app/loading.tsx` → 根视图 `loading` 分支
- `app/onboarding/index.tsx` → Onboarding 流程（4 步）
- `app/unlock.tsx` → Unlock 屏
- `app/account-error.tsx` → AccountError 屏

Home（9）：

- `(home)/index.tsx` → Home 根（英雄区 + 指标 + 流量图 + 快捷入口）
- `(home)/analytics.tsx` → push
- `(home)/performance.tsx` → push
- `(home)/firewall.tsx` → push
- `(home)/alerts.tsx` → push
- `(home)/audit.tsx` → push
- `(home)/lb.tsx` → push
- `(home)/billing.tsx` → push（保留仅 API token 可用的权限提示）
- `(home)/under-attack.tsx` → **改 sheet**

Zones（7）：

- `(zones)/index.tsx` → Zones 根（搜索 + scope）
- `(zones)/[zoneId]/index.tsx` → zone 概览（英雄区）
- `(zones)/[zoneId]/dns.tsx` → push
- `(zones)/[zoneId]/analytics.tsx` → push
- `(zones)/[zoneId]/firewall.tsx` → push
- `(zones)/[zoneId]/cache.tsx` → **合并进 zone 概览可展开区**
- `(zones)/[zoneId]/ssl.tsx` → **合并进 zone 概览可展开区**

Storage（4）：

- `(storage)/index.tsx` → Storage 根（R2/KV/D1 分段 + 创建 sheet）
- `(storage)/kv/[namespace].tsx` → push
- `(storage)/r2/[bucket].tsx` → push
- `(storage)/d1/[database].tsx` → push

Compute（3）：

- `(compute)/index.tsx` → Compute 根（Workers/Pages 分段）
- `(compute)/worker/[script].tsx` → push
- `(compute)/pages/[project].tsx` → push

Settings（3）：

- `(settings)/index.tsx` → Settings 根
- `(settings)/connect.tsx` → push
- `(settings)/language.tsx` → **改 Settings 内 inline picker**

净结果：21 个 tab 内 leaf 路由压到 17 个 push 目标 + 2 个合并区 + 1 个 sheet + 1 个 inline picker。

## 附录 C：生成脚本与已修正的错误

`Scripts/generate-xcstrings.py` 和 `Scripts/generate-colors.py` 都可重跑且幂等；CI 有一步校验重跑后无 diff——出现 diff 说明有人手改了生成物，token 或语料源已经漂移。

**修正一：中文复数。** 原计划要求"补齐 zh 缺失的 21 个 `_one` 复数形式"。核实后那 21 个键全是 `_one` 变体，且每个在 zh 里都有对应的 `_other`。CLDR 中文只有 `other` 一类，补 `_one` 等于加 21 条永不被选中的死条目。正确产物是两种语言各 574 个 catalog 键。

**修正二：插值语法。** i18next 的 `{{var}}` 不是 Foundation 格式。转换规则：`{{count}}` → `%lld`，其余 → `%@`；含两个以上变量的 7 个键用位置化说明符（`%1$@`、`%2$lld`），否则译文调整语序会让参数错位。原文不含 `%` 字符，无转义冲突。

**修正三：entitlement 断言不能用 `plutil -extract`。** 它把 `.` 当键路径分隔符，所以 `com.apple.security.application-groups` 这类反向域名键永远解析不到，检查会全部假通过。CI 改用 `PlistBuddy`（`:` 分隔）。同理不能用 grep：entitlements 文件里有一条说明为什么故意不加 Keychain Sharing 的注释，文本匹配会命中它。

## 附录 B：依赖替换对照

实施时的查表参考。

- `expo-router` → `TabView` + 每 tab 一个 `NavigationStack` + 类型化 `Route` 枚举
- 裸 `fetch` → `URLSession` + async/await + `Codable`，测试桩用自定义 `URLProtocol`
- `expo-secure-store` → `kSecClassGenericPassword` + `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- `expo-crypto` 口令哈希 → CommonCrypto `CCKeyDerivationPBKDF`，参数随记录持久化
- `expo-local-authentication` → `LAContext` + `.deviceOwnerAuthenticationWithBiometrics`
- `expo-auth-session` + `expo-web-browser` → `ASWebAuthenticationSession` + 手写 PKCE（CryptoKit SHA256 出 S256 challenge）
- `expo-symbols` / `lucide-react-native` → `Image(systemName:)`，Lucide 回退整套删除
- `react-native-svg` 的 `AreaChart` → Swift Charts `AreaMark`（重做，不是移植）
- `expo-blur` → iOS 26 `glassEffect`，iOS 18 降级 `.ultraThinMaterial`
- `expo-haptics` → `.sensoryFeedback`
- `Skeleton` 脉冲 → `.redacted(reason: .placeholder)` + 自定义 shimmer
- `Enter.tsx` 的 FadeInDown → `scrollTransition` + 有限错开 `.transition`
- `actionMenu` → 简单的用 `.confirmationDialog`，带表单的用 `.sheet` + `presentationDetents`
- `react-native-reanimated` → 系统动画 + `MotionKit`，不引入动画运行时
- `useSyncExternalStore` 的 `accountScope` → `@Observable` + Environment
- `useSequencer` → 每次 load 带 generation + `Task` 取消
- `mapLimit` → `withTaskGroup` 限流
- `createTtlCache` → actor 版 TTL 缓存，带 in-flight 去重
- Jest / RNTL → Swift Testing + XCUITest

## 参考

- [src/cloudflare/rest/client.ts](src/cloudflare/rest/client.ts)
- [src/cloudflare/oauth.ts](src/cloudflare/oauth.ts)
- [src/cloudflare/oauthSession.ts](src/cloudflare/oauthSession.ts)
- [src/cloudflare/resources.ts](src/cloudflare/resources.ts)
- [src/cloudflare/accountResources.ts](src/cloudflare/accountResources.ts)
- [src/auth/localAccount.ts](src/auth/localAccount.ts)
- [src/theme/tokens.ts](src/theme/tokens.ts)
- [oauth-relay/src/index.ts](oauth-relay/src/index.ts)
- [oauth-relay/wrangler.jsonc](oauth-relay/wrangler.jsonc)

