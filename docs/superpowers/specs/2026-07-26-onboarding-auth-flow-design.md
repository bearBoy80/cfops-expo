# Figma Onboarding 与首次认证流程设计

## 目标

将 `Cloudflare Client App Design/src/app/components/onboarding.tsx` 中的四步
Figma onboarding 移植到 Expo App。首次安装必须完成引导；引导完成后的当前
会话进入 5 Tab，之后每次冷启动或 App 离开前台后都先进入 Unlock。

本次不实现 Cloudflare OAuth、API Token 校验或账号同步，不生成假绑定数据。

## 用户流程

### 1. Welcome

还原 Figma 的渐变 Cloud 图标、产品说明、三项能力卡片、四段进度指示器和
`Get Started` 按钮。

### 2. Create account

收集：

- Organization / team name
- Full name
- Work email
- Password（至少 8 个字符）
- Confirm password
- Face ID / fingerprint 偏好

表单验证通过后创建 SecureStore 本地账号，并记录：

```ts
interface LocalAccount {
  name: string;
  organization: string;
  email: string;
  saltHex: string;
  hashHex: string;
  biometricsEnabled: boolean;
  onboardingComplete: boolean;
  onboardingStep: 'connect' | 'done';
  createdAt: number;
}
```

此时 `onboardingComplete` 为 `false`，不会进入 Tab 或 Unlock。

### 3. Bind Cloudflare accounts

保留 Figma 的 OAuth 与 API Token 两个入口。当前点击入口只显示明确的内联
说明：Cloudflare 绑定将在下一里程碑开放；不写入账号、Token 或模拟数据。

主操作为 `Skip for now`。继续后将 `onboardingStep` 持久化为 `done`，确保
进程终止后能恢复到完成页。

### 4. You’re all set

显示未绑定账号版本的 Figma 完成页。点击 `Enter Console` 时先原子写入
`onboardingComplete: true`，再通知 AuthGate：

- App 仍在前台：当前会话进入 5 Tab。
- App 已进入后台：保持 locked，回到前台显示 Unlock。
- 写入失败：留在完成页并显示可重试错误。

## AuthGate 状态与恢复

| SecureStore / 运行状态 | 路由 |
|---|---|
| 无本地账号 | Onboarding / Welcome |
| 未完成，`onboardingStep: connect` | Onboarding / Connect |
| 未完成，`onboardingStep: done` | Onboarding / Done |
| 已完成，冷启动 | Unlock |
| Unlock 成功且在前台 | 5 Tab |
| 已解锁后离开前台 | Unlock |
| 存储损坏或不可用 | Account Error |

已有账号缺少新增 onboarding 字段时按“已完成”迁移，避免升级后重复引导。
引导状态和密码哈希都在 SecureStore；不使用 AsyncStorage 作为第二状态源。

## 组件与数据边界

- `OnboardingStepDots`：四步进度指示器。
- `OnboardingPrimaryButton`：Figma 底部橙色主按钮。
- `OnboardingField`：带 Lucide 前置图标的输入框。
- `localAccount.ts`：账号创建、兼容解析、步骤推进、完成标记。
- `AuthGate.tsx`：区分无账号、未完成、locked 和 unlocked。
- `app/onboarding/index.tsx`：只负责步骤 UI 与表单交互。

颜色继续只来自 `src/theme/tokens.ts`。所有文案保持英文。

## 错误处理

- 字段错误就地显示，不创建部分账号。
- SecureStore 创建或更新失败时保留当前步骤并允许重试。
- Cloudflare 绑定入口不伪装成功，明确引导用户选择 `Skip for now`。
- 损坏账号仍进入现有恢复页，由用户显式重置。

## 测试与验收

自动化测试覆盖：

- Welcome → Create → Connect → Done → 5 Tab 状态转换。
- 必填字段、邮箱、密码长度和确认密码校验。
- 中断后从 Connect 或 Done 恢复。
- onboarding 完成后的冷启动为 locked。
- 旧账号字段迁移为已完成。
- 后台期间迟到的完成回调不能绕过 Unlock。
- SecureStore 写入失败时可重试且不误进入 Tab。

iOS 手动验收使用全新 Simulator：走完四步进入 5 Tab，重启 Expo Go 后直接
显示 Unlock，正确认证后进入 5 Tab；后台切换后再次显示 Unlock。

Android 保持跨平台实现，但按当前环境约定延后运行时验收。
