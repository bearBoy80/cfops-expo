# P1 地基（Foundation）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起双端可运行的 Expo 工程：主题系统、共享 UI 组件、本地账号 + 解锁门禁、5 Tab 路由骨架，并完成 `cloudflare` SDK / p-queue 的 Hermes 兼容性 spike。

**Architecture:** Expo Router 管路由（根布局做认证门禁重定向）；NativeWind 管布局/字号类名、颜色一律走 ThemeContext token；本地账号 = scrypt 哈希 + SecureStore，无后端。本计划不含 SQLite、Cloudflare 绑定、同步引擎（见后续计划）。

**Tech Stack:** Expo SDK 54+（TypeScript strict）、expo-router、NativeWind v4、@noble/hashes（scrypt）、expo-secure-store、expo-local-authentication、jest-expo + @testing-library/react-native。

**Spec:** `docs/superpowers/specs/2026-07-25-cloudflare-client-p1-design.md`（本计划对应 §12 实施顺序的第 1-3 步）

**P1 计划路线图**：本计划是 4 份中的第 1 份（地基 → 绑定与数据层 → 同步引擎 → 屏幕接真）。后三份在前一份完成后编写。

> **执行记录（2026-07-26）：** 本轮按用户要求以 iOS 为运行时验收平台；Android 配置与跨平台代码保留，但 Android 模拟器验收延后。SDK spike 在 Metro 打包阶段发现 `cloudflare` 导出名冲突，因此已采用 spec §11 的“SDK 类型 + 自写 fetch 层”兜底方案。隔离的 `p-queue` + `mitt` 探针已在 iOS Hermes 运行时输出 `PQUEUE-SPIKE PASS order=1,2 total=3`，临时代码随后删除。
>
> **审查加固：** 根导航改用 `Stack.Protected`，未解锁时不会挂载 Tab；App 离开前台立即重新上锁；本地账号读取增加运行时结构校验、错误态与显式重置恢复；iOS 原生配置加入 Face ID 权限说明。

## Global Constraints

- 平台：iOS + Android 双端都必须可运行；涉及 UI 的任务手动验证需两端各跑一次
- 包管理：npm；TypeScript `strict: true`
- 颜色**只允许**来自 `src/theme/tokens.ts`（除该文件外不得出现十六进制色值）；主色 Cloudflare 橙 `#f6821f`
- 密码/凭证只进 expo-secure-store，禁止落 AsyncStorage/SQLite/日志
- UI 文案英文（与设计稿一致）；commit 信息 Conventional Commits（中文描述可）
- 设计稿参考源：`docs/design-reference/`（Task 1 拷入），组件视觉以它为准
- 每个任务结束必须：`npx tsc --noEmit` 通过 + `npx jest` 全绿 + commit

## File Structure

```
app/
  _layout.tsx              根布局：Providers + 认证门禁重定向 + global.css
  unlock.tsx               解锁屏（密码 / 生物识别）
  onboarding/index.tsx     首次创建本地账号
  (tabs)/_layout.tsx       5 Tab（JS Tabs + lucide 图标；设计稿是自定义胶囊高亮 tab，原生 NativeTabs 无法复刻，此处有意偏离 spec §2 一行，spec 已同步修订）
  (tabs)/(home)/index.tsx      各 tab 骨架屏（本计划仅占位，屏幕移植在计划 4）
  (tabs)/(zones)/index.tsx
  (tabs)/(storage)/index.tsx
  (tabs)/(compute)/index.tsx
  (tabs)/(more)/index.tsx
src/
  theme/tokens.ts          调色板 / accent / label() 透明度工具
  theme/ThemeContext.tsx   ThemeProvider + useTheme
  components/ui/*.tsx      Card · ListRow · SectionLabel · MetricTile · Pill · AccountChip · EmptyState
  auth/localAccount.ts     本地账号：scrypt + SecureStore CRUD
  auth/AuthGate.tsx        认证状态机 Provider（no-account/locked/unlocked）
  spike/cfSpike.ts         Task 2 临时文件，验证后删除
__tests__/ 与被测文件同级放 *.test.ts(x)
```

---

### Task 1: Expo 脚手架 + NativeWind + 设计稿参考拷入

**Files:**
- Create: Expo 模板全套（`app/`、`package.json`、`app.json`、`tsconfig.json` 等）
- Create: `tailwind.config.js`、`global.css`、`metro.config.js`、`babel.config.js`
- Create: `docs/design-reference/`（设计稿源码拷贝）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: 可启动的 Expo 工程；`npm run ios` / `npm run android` 可用；后续所有任务的运行环境

- [x] **Step 1: 脚手架（仓库已有 .git 和 docs/，先建到临时目录再并入）**

```bash
cd /Users/jt.gui/workspace/expo/cloudflareOps
npx create-expo-app@latest .scaffold --template default
rsync -a --exclude .git .scaffold/ ./
rm -rf .scaffold
npm install
```

- [x] **Step 2: 拷入设计稿参考（来源：会话 scratchpad 的解压目录；若已丢失，重新解压 `~/Downloads/Cloudflare Client App Design.zip`）**

```bash
mkdir -p docs/design-reference
cp -R "/private/tmp/claude-501/-Users-jt-gui-workspace-expo-cloudflareOps/7ed419f7-29ea-4417-bd35-eee9bd97dd53/scratchpad/design/src" docs/design-reference/
cp "/private/tmp/claude-501/-Users-jt-gui-workspace-expo-cloudflareOps/7ed419f7-29ea-4417-bd35-eee9bd97dd53/scratchpad/design/default_shadcn_theme.css" docs/design-reference/ 2>/dev/null || true
```

- [x] **Step 3: 清掉模板示例路由，建立最小 app/**

删除模板的 `app/(tabs)`、示例组件；建最小首页防止路由为空：

```tsx
// app/index.tsx（临时，Task 7 用门禁重定向替换）
import { Text, View } from 'react-native';
export default function Index() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>cloudflareOps</Text></View>;
}
```

- [x] **Step 4: 安装并配置 NativeWind v4**

```bash
npm i nativewind
npm i -D tailwindcss@^3.4
```

```js
// tailwind.config.js
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
};
```

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
```

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return { presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'] };
};
```

在 `app/_layout.tsx` 顶部加 `import '../global.css';`，并给临时 `app/index.tsx` 加一个 `className="text-orange-500"` 验证类名生效。

- [x] **Step 5: app.json 基础配置**

`name: "cloudflareOps"`、`slug: "cloudflareops"`、`scheme: "cfops"`（OAuth 回调要用）、`ios.bundleIdentifier: "com.cloudflareops.app"`、`android.package: "com.cloudflareops.app"`（占位标识符，上架前按待定决策更换）、`userInterfaceStyle: "automatic"`。

- [x] **Step 6: iOS 手动验证（本轮范围；Android 延后）**

Run: `npx expo start`，分别按 `i` 和 `a`。
Expected: iOS 模拟器与 Android 模拟器都显示 "cloudflareOps"，文字为橙色（NativeWind 生效），Metro 无红屏。

- [x] **Step 7: 类型检查 + Commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: Expo 脚手架 + NativeWind + 设计稿参考"
```

---

### Task 2: cloudflare SDK / p-queue Hermes 兼容性 Spike

**Files:**
- Create: `src/spike/cfSpike.ts`（验证后删除）
- Modify: `app/index.tsx`（临时挂 spike，验证后还原）

**Interfaces:**
- Consumes: Task 1 的运行环境
- Produces: 结论记录在 commit message：SDK 可用 → 后续计划直接用 `cloudflare` 包；不可用 → 后续计划改走"SDK 类型 + 自写 fetch 层"兜底（spec §11）

- [x] **Step 1: 安装依赖**

```bash
npm i cloudflare p-queue mitt
```

- [x] **Step 2: 写 spike**

```ts
// src/spike/cfSpike.ts
import Cloudflare from 'cloudflare';
import PQueue from 'p-queue';

// 用无效 token 调 verify：只要抛出 SDK 的结构化 APIError（而非 Hermes 运行时
// 缺 API 的 TypeError/ReferenceError），即证明 SDK 在 RN 可用。
export async function runCfSpike(): Promise<string> {
  const queue = new PQueue({ concurrency: 1 });
  const result = await queue.add(async () => {
    const cf = new Cloudflare({ apiToken: 'spike-invalid-token' });
    try {
      await cf.user.tokens.verify();
      return 'UNEXPECTED-SUCCESS';
    } catch (e: unknown) {
      const err = e as { constructor?: { name?: string }; status?: number; message?: string };
      return `SPIKE ${err.constructor?.name ?? 'UnknownError'} status=${err.status ?? 'none'} msg=${err.message?.slice(0, 80)}`;
    }
  });
  return result as string;
}
```

```tsx
// app/index.tsx 临时加：
import { useEffect } from 'react';
import { runCfSpike } from '../src/spike/cfSpike';
// 组件内：
useEffect(() => { runCfSpike().then(console.log).catch((e) => console.log('SPIKE-CRASH', e)); }, []);
```

- [x] **Step 3: Metro / Hermes 兼容性验证**

Run: `npx expo start`，iOS 与 Android 各跑一次，看 Metro 日志。
Expected PASS: 日志形如 `SPIKE AuthenticationError status=400 ...`（SDK 错误类 + HTTP 状态码，说明请求发出且响应被 SDK 解析）。
Expected FAIL: `SPIKE-CRASH TypeError: ...`（缺运行时 API）→ 停下，向用户报告并按 spec §11 兜底方案调整后续计划。

- [x] **Step 4: 清理并记录结论**

删除 `src/spike/cfSpike.ts`，还原 `app/index.tsx`（依赖保留，后续计划使用）。

```bash
git add -A && git commit -m "chore: SDK Hermes spike 通过（iOS/Android 均返回结构化 APIError），删除临时代码"
```

---

### Task 3: Jest / RNTL 测试基建

**Files:**
- Modify: `package.json`
- Create: `src/__tests__/smoke.test.tsx`

**Interfaces:**
- Consumes: Task 1 工程
- Produces: `npx jest` 可运行；后续所有任务的测试载体

- [x] **Step 1: 安装**

```bash
npx expo install jest-expo jest @types/jest -- --save-dev
npm i -D @testing-library/react-native
```

- [x] **Step 2: package.json 配置**

```json
"scripts": { "test": "jest" },
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-modules-core|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|react-native-css-interop|@noble/.*|p-queue|eventemitter3|p-timeout|mitt|cloudflare|lucide-react-native|react-native-svg)/)"
  ]
}
```

- [x] **Step 3: 冒烟测试（先跑，确认基建可用）**

```tsx
// src/__tests__/smoke.test.tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

test('renders text', () => {
  render(<Text>hello</Text>);
  expect(screen.getByText('hello')).toBeTruthy();
});
```

Run: `npx jest`
Expected: 1 passed

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "test: jest-expo + RNTL 测试基建"
```

---

### Task 4: 主题 Token + ThemeProvider

**Files:**
- Create: `src/theme/tokens.ts`、`src/theme/ThemeContext.tsx`
- Test: `src/theme/__tests__/theme.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `useTheme(): { mode: 'dark' | 'light'; colors: Palette; setMode(m): void }`；`accent` 常量表；`label(mode, alpha): string`。所有组件从这里取色

- [x] **Step 1: 失败测试**

```tsx
// src/theme/__tests__/theme.test.tsx
import { renderHook, act } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { accent, label } from '../tokens';

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('defaults to dark and exposes palette', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  expect(result.current.mode).toBe('dark');
  expect(result.current.colors.bg).toBe('#000000');
});

test('setMode switches palette', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  act(() => result.current.setMode('light'));
  expect(result.current.colors.bg).toBe('#f2f2f7');
});

test('accent and label helper', () => {
  expect(accent.orange).toBe('#f6821f');
  expect(label('dark', 0.5)).toBe('rgba(255,255,255,0.5)');
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx jest src/theme`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现**

```ts
// src/theme/tokens.ts —— 对照 docs/design-reference/src/styles/theme.css 的 CSS 变量
export type Mode = 'dark' | 'light';
export interface Palette { bg: string; surface: string; surface2: string; tabbar: string; text: string; labelRgb: string; hairlineRgb: string; searchBg: string; }

export const palettes: Record<Mode, Palette> = {
  dark:  { bg: '#000000', surface: '#1c1c1e', surface2: '#2c2c2e', tabbar: 'rgba(22,22,24,0.94)',   text: '#ffffff', labelRgb: '255,255,255', hairlineRgb: '255,255,255', searchBg: 'rgba(118,118,128,0.24)' },
  light: { bg: '#f2f2f7', surface: '#ffffff', surface2: '#e5e5ea', tabbar: 'rgba(249,249,249,0.94)', text: '#000000', labelRgb: '0,0,0',       hairlineRgb: '0,0,0',       searchBg: 'rgba(118,118,128,0.12)' },
};

export const accent = { orange: '#f6821f', green: '#30d158', red: '#ff453a', yellow: '#ffd60a', blue: '#0a84ff', purple: '#bf5af2', gray: '#8e8e93' } as const;

export const label = (mode: Mode, alpha: number) => `rgba(${palettes[mode].labelRgb},${alpha})`;
export const hairline = (mode: Mode, alpha: number) => `rgba(${palettes[mode].hairlineRgb},${alpha})`;
export const tint = (hex: string, alphaHex: string) => hex + alphaHex; // 如 tint(accent.red,'22') 做图标底
```

```tsx
// src/theme/ThemeContext.tsx
import { createContext, useContext, useMemo, useState } from 'react';
import { Mode, Palette, palettes } from './tokens';

interface ThemeValue { mode: Mode; colors: Palette; setMode: (m: Mode) => void; }
const ThemeCtx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('dark');
  const value = useMemo(() => ({ mode, colors: palettes[mode], setMode }), [mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
```

- [x] **Step 4: 跑测试通过 + Commit**

Run: `npx jest src/theme` → PASS

```bash
git add -A && git commit -m "feat: 主题 token 与 ThemeProvider（深/浅色调色板）"
```

---

### Task 5: 共享 UI 组件库

**Files:**
- Create: `src/components/ui/Card.tsx`、`ListRow.tsx`、`SectionLabel.tsx`、`MetricTile.tsx`、`Pill.tsx`、`AccountChip.tsx`、`EmptyState.tsx`、`index.ts`
- Test: `src/components/ui/__tests__/ui.test.tsx`

**Interfaces:**
- Consumes: `useTheme`、`accent`、`label`、`tint`（Task 4）
- Produces（后续计划 4 的屏幕全部用这些）:
  - `Card({ children })` — 圆角分组容器
  - `ListRow({ left, right?, chevron?=true, last?=false, onPress? })`
  - `SectionLabel({ children })`
  - `MetricTile({ label, value, sub?, color, Icon? })`（Icon 为 lucide 组件）
  - `Pill({ status })`，`type Status = 'active'|'healthy'|'pending'|'paused'|'degraded'|'error'|'block'|'challenge'|'log'`
  - `AccountChip({ name, color, size?=26 })` — 彩色圆 + 首字母
  - `EmptyState({ Icon, title, subtitle, actionLabel?, onAction? })`

参考视觉：`docs/design-reference/src/app/components/shared.tsx`

- [x] **Step 1: 安装图标库**

```bash
npx expo install react-native-svg
npm i lucide-react-native
```

- [x] **Step 2: 失败测试**

```tsx
// src/components/ui/__tests__/ui.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Globe } from 'lucide-react-native';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { Card, ListRow, SectionLabel, MetricTile, Pill, AccountChip, EmptyState } from '..';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test('ListRow renders content and fires onPress', () => {
  const onPress = jest.fn();
  wrap(<Card><ListRow left={<Text>acme.com</Text>} onPress={onPress} last /></Card>);
  fireEvent.press(screen.getByText('acme.com'));
  expect(onPress).toHaveBeenCalled();
});

test('Pill maps status to label', () => {
  wrap(<Pill status="active" />);
  expect(screen.getByText('active')).toBeTruthy();
});

test('MetricTile shows label/value/sub', () => {
  wrap(<MetricTile label="Requests" value="6.4B" sub="+8.2% today" color="#f6821f" />);
  expect(screen.getByText('Requests')).toBeTruthy();
  expect(screen.getByText('6.4B')).toBeTruthy();
});

test('AccountChip shows initial', () => {
  wrap(<AccountChip name="Acme Corp" color="#f6821f" />);
  expect(screen.getByText('A')).toBeTruthy();
});

test('EmptyState fires action', () => {
  const onAction = jest.fn();
  wrap(<EmptyState Icon={Globe} title="No accounts" subtitle="Bind one" actionLabel="Connect" onAction={onAction} />);
  fireEvent.press(screen.getByText('Connect'));
  expect(onAction).toHaveBeenCalled();
});

test('SectionLabel uppercases', () => {
  wrap(<SectionLabel>Quick Access</SectionLabel>);
  expect(screen.getByText('Quick Access')).toBeTruthy();
});
```

- [x] **Step 3: 跑测试确认失败**

Run: `npx jest src/components` → FAIL（模块不存在）

- [x] **Step 4: 实现组件**

```tsx
// src/components/ui/Card.tsx
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface }}>{children}</View>;
}
```

```tsx
// src/components/ui/ListRow.tsx
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { hairline, label } from '../../theme/tokens';

interface Props { left: React.ReactNode; right?: React.ReactNode; chevron?: boolean; last?: boolean; onPress?: () => void; }
export function ListRow({ left, right, chevron = true, last = false, onPress }: Props) {
  const { mode } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 12, minHeight: 44, paddingVertical: 10 }}>
        <View style={{ flex: 1 }}>{left}</View>
        {right}
        {onPress && chevron ? <ChevronRight size={16} color={label(mode, 0.3)} style={{ marginLeft: 6 }} /> : null}
      </View>
      {!last && <View style={{ marginLeft: 16, height: 1, backgroundColor: hairline(mode, 0.08) }} />}
    </Pressable>
  );
}
```

```tsx
// src/components/ui/SectionLabel.tsx
import { Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { label } from '../../theme/tokens';
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  return (
    <Text style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 8, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, color: label(mode, 0.45) }}>
      {children}
    </Text>
  );
}
```

```tsx
// src/components/ui/MetricTile.tsx
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { label, tint } from '../../theme/tokens';

interface Props { label: string; value: string; sub?: string; color: string; Icon?: LucideIcon; }
export function MetricTile({ label: title, value, sub, color, Icon }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {Icon ? (
          <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, '22') }}>
            <Icon size={13} color={color} />
          </View>
        ) : null}
        <Text style={{ fontSize: 11, color: label(mode, 0.5) }}>{title}</Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 10, marginTop: 2, color: label(mode, 0.4) }}>{sub}</Text> : null}
    </View>
  );
}
```

```tsx
// src/components/ui/Pill.tsx
import { Text, View } from 'react-native';
import { accent, tint } from '../../theme/tokens';

export type Status = 'active' | 'healthy' | 'pending' | 'paused' | 'degraded' | 'error' | 'block' | 'challenge' | 'log';
export const statusColor: Record<Status, string> = {
  active: accent.green, healthy: accent.green,
  pending: accent.yellow, paused: accent.yellow, degraded: accent.yellow, challenge: accent.yellow,
  error: accent.red, block: accent.red,
  log: accent.gray,
};

export function Pill({ status }: { status: Status }) {
  const c = statusColor[status];
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: tint(c, '22'), alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: c }}>{status}</Text>
    </View>
  );
}
```

```tsx
// src/components/ui/AccountChip.tsx
import { Text, View } from 'react-native';
export function AccountChip({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: '#ffffff' }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
```

```tsx
// src/components/ui/EmptyState.tsx
import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { accent, label, tint } from '../../theme/tokens';

interface Props { Icon: LucideIcon; title: string; subtitle: string; actionLabel?: string; onAction?: () => void; }
export function EmptyState({ Icon, title, subtitle, actionLabel, onAction }: Props) {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent.orange, '22') }}>
        <Icon size={26} color={accent.orange} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 13, textAlign: 'center', lineHeight: 18, color: label(mode, 0.5) }}>{subtitle}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} style={({ pressed }) => ({ marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: accent.orange, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

```ts
// src/components/ui/index.ts
export { Card } from './Card';
export { ListRow } from './ListRow';
export { SectionLabel } from './SectionLabel';
export { MetricTile } from './MetricTile';
export { Pill, statusColor, type Status } from './Pill';
export { AccountChip } from './AccountChip';
export { EmptyState } from './EmptyState';
```

- [x] **Step 5: 跑测试通过 + Commit**

Run: `npx jest src/components` → 6 passed

```bash
git add -A && git commit -m "feat: 共享 UI 组件库（Card/ListRow/Pill/MetricTile 等）"
```

---

### Task 6: 本地账号模块（scrypt + SecureStore）

**Files:**
- Create: `src/auth/localAccount.ts`
- Test: `src/auth/__tests__/localAccount.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（Task 7/8 与后续计划使用）:
  - `getAccount(): Promise<LocalAccount | null>`
  - `createAccount(name: string, password: string, biometricsEnabled: boolean): Promise<void>`
  - `verifyPassword(password: string): Promise<boolean>`
  - `setBiometricsEnabled(enabled: boolean): Promise<void>`
  - `interface LocalAccount { name: string; saltHex: string; hashHex: string; biometricsEnabled: boolean; createdAt: number }`

- [x] **Step 1: 安装**

```bash
npx expo install expo-secure-store expo-local-authentication
npm i @noble/hashes
```

- [x] **Step 2: 失败测试（内存 mock SecureStore）**

```ts
// src/auth/__tests__/localAccount.test.ts
const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
}));

import { createAccount, getAccount, verifyPassword, setBiometricsEnabled } from '../localAccount';

beforeEach(() => store.clear());

test('no account initially', async () => {
  expect(await getAccount()).toBeNull();
});

test('create then verify correct/wrong password', async () => {
  await createAccount('JT', 'hunter2secret', false);
  const acc = await getAccount();
  expect(acc?.name).toBe('JT');
  expect(acc?.hashHex).not.toContain('hunter2secret'); // 不存明文
  expect(await verifyPassword('hunter2secret')).toBe(true);
  expect(await verifyPassword('wrong')).toBe(false);
});

test('toggle biometrics persists', async () => {
  await createAccount('JT', 'hunter2secret', false);
  await setBiometricsEnabled(true);
  expect((await getAccount())?.biometricsEnabled).toBe(true);
});
```

- [x] **Step 3: 跑测试确认失败**

Run: `npx jest src/auth` → FAIL

- [x] **Step 4: 实现**

```ts
// src/auth/localAccount.ts
import * as SecureStore from 'expo-secure-store';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';

const KEY = 'local-account-v1';
// 移动端可接受的 scrypt 强度（~百毫秒级）；调参需同步迁移逻辑
const PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };

export interface LocalAccount { name: string; saltHex: string; hashHex: string; biometricsEnabled: boolean; createdAt: number; }

const hashPassword = (password: string, saltHex: string) =>
  bytesToHex(scrypt(utf8ToBytes(password), hexToBytes(saltHex), PARAMS));

export async function getAccount(): Promise<LocalAccount | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as LocalAccount) : null;
}

export async function createAccount(name: string, password: string, biometricsEnabled: boolean): Promise<void> {
  const saltHex = bytesToHex(randomBytes(16));
  const account: LocalAccount = { name, saltHex, hashHex: hashPassword(password, saltHex), biometricsEnabled, createdAt: Date.now() };
  await SecureStore.setItemAsync(KEY, JSON.stringify(account));
}

export async function verifyPassword(password: string): Promise<boolean> {
  const acc = await getAccount();
  return !!acc && hashPassword(password, acc.saltHex) === acc.hashHex;
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  const acc = await getAccount();
  if (!acc) throw new Error('no local account');
  await SecureStore.setItemAsync(KEY, JSON.stringify({ ...acc, biometricsEnabled: enabled }));
}
```

- [x] **Step 5: 跑测试通过 + Commit**

Run: `npx jest src/auth` → 3 passed

```bash
git add -A && git commit -m "feat: 本地账号模块（scrypt 哈希 + SecureStore）"
```

---

### Task 7: AuthGate + 路由骨架（unlock / onboarding / 5 Tab）

**Files:**
- Create: `src/auth/AuthGate.tsx`
- Create: `app/(tabs)/_layout.tsx`、`app/(tabs)/(home)/index.tsx`、`app/(tabs)/(zones)/index.tsx`、`app/(tabs)/(storage)/index.tsx`、`app/(tabs)/(compute)/index.tsx`、`app/(tabs)/(more)/index.tsx`
- Create: `app/unlock.tsx`、`app/onboarding/index.tsx`（本任务先占位，Task 8 填充完整 UI）
- Modify: `app/_layout.tsx`；Delete: `app/index.tsx`
- Test: `src/auth/__tests__/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `getAccount`（Task 6）、`ThemeProvider/useTheme`（Task 4）、`EmptyState`（Task 5）
- Produces:
  - `useAuth(): { status: 'loading' | 'no-account' | 'locked' | 'unlocked'; unlock(): void; lock(): void; onAccountCreated(): void }`
  - 路由约定：`/unlock`、`/onboarding`、`/(tabs)/(home|zones|storage|compute|more)`——后续计划在各 tab 组内加子路由

- [x] **Step 1: 失败测试（状态机）**

```tsx
// src/auth/__tests__/AuthGate.test.tsx
const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthGateProvider, useAuth } from '../AuthGate';
import { createAccount } from '../localAccount';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthGateProvider>{children}</AuthGateProvider>;

test('no account -> no-account', async () => {
  store.clear();
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('no-account'));
});

test('existing account -> locked -> unlock -> unlocked -> lock', async () => {
  store.clear();
  await createAccount('JT', 'hunter2secret', false);
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('locked'));
  act(() => result.current.unlock());
  expect(result.current.status).toBe('unlocked');
  act(() => result.current.lock());
  expect(result.current.status).toBe('locked');
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx jest src/auth/__tests__/AuthGate` → FAIL

- [x] **Step 3: 实现 AuthGate**

```tsx
// src/auth/AuthGate.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAccount } from './localAccount';

export type AuthStatus = 'loading' | 'no-account' | 'locked' | 'unlocked';
interface AuthValue { status: AuthStatus; unlock: () => void; lock: () => void; onAccountCreated: () => void; }
const AuthCtx = createContext<AuthValue | null>(null);

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  useEffect(() => {
    getAccount().then((acc) => setStatus(acc ? 'locked' : 'no-account'));
  }, []);
  const value = useMemo<AuthValue>(() => ({
    status,
    unlock: () => setStatus('unlocked'),
    lock: () => setStatus('locked'),
    onAccountCreated: () => setStatus('unlocked'),
  }), [status]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used within AuthGateProvider');
  return v;
}
```

- [x] **Step 4: 跑测试通过**

Run: `npx jest src/auth` → PASS（连同 Task 6 的测试）

- [x] **Step 5: 根布局 + 门禁重定向**

```tsx
// app/_layout.tsx
import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthGateProvider, useAuth } from '../src/auth/AuthGate';

function Gate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (status === 'loading') return;
    const seg0 = segments[0] as string | undefined;
    if (status === 'no-account' && seg0 !== 'onboarding') router.replace('/onboarding');
    else if (status === 'locked' && seg0 !== 'unlock') router.replace('/unlock');
    else if (status === 'unlocked' && (seg0 === 'unlock' || seg0 === 'onboarding')) router.replace('/(tabs)/(home)');
  }, [status, segments, router]);
  return <>{children}</>;
}

function ThemedStack() {
  const { colors } = useTheme();
  return (
    <Gate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </Gate>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthGateProvider>
        <ThemedStack />
      </AuthGateProvider>
    </ThemeProvider>
  );
}
```

删除 `app/index.tsx`（`/` 由门禁重定向接管；expo-router 对不存在的 index 会显示 404，但门禁在首帧前重定向，双端手动验证确认无闪烁 404）。若出现 404 闪烁，则保留一个空 `app/index.tsx` 返回 `null`。

- [x] **Step 6: unlock / onboarding 占位（Task 8 替换）**

```tsx
// app/unlock.tsx（占位）
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthGate';
export default function Unlock() {
  const { unlock } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={unlock}><Text style={{ color: '#f6821f' }}>Unlock (placeholder)</Text></Pressable>
    </View>
  );
}
```

```tsx
// app/onboarding/index.tsx（占位）
import { Pressable, Text, View } from 'react-native';
import { createAccount } from '../../src/auth/localAccount';
import { useAuth } from '../../src/auth/AuthGate';
export default function Onboarding() {
  const { onAccountCreated } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={async () => { await createAccount('Placeholder', 'placeholder-pass', false); onAccountCreated(); }}>
        <Text style={{ color: '#f6821f' }}>Create account (placeholder)</Text>
      </Pressable>
    </View>
  );
}
```

（占位文件允许临时硬编码橙色，Task 8 重写为 token。）

- [x] **Step 7: 5 Tab 骨架**

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Activity, Globe, Database, Zap, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeContext';
import { accent, label } from '../../src/theme/tokens';

export default function TabsLayout() {
  const { mode, colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.orange,
        tabBarInactiveTintColor: label(mode, 0.5),
        tabBarStyle: { backgroundColor: colors.tabbar, borderTopColor: label(mode, 0.07) },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Activity color={color} size={size} /> }} />
      <Tabs.Screen name="(zones)" options={{ title: 'Zones', tabBarIcon: ({ color, size }) => <Globe color={color} size={size} /> }} />
      <Tabs.Screen name="(storage)" options={{ title: 'Storage', tabBarIcon: ({ color, size }) => <Database color={color} size={size} /> }} />
      <Tabs.Screen name="(compute)" options={{ title: 'Compute', tabBarIcon: ({ color, size }) => <Zap color={color} size={size} /> }} />
      <Tabs.Screen name="(more)" options={{ title: 'More', tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }} />
    </Tabs>
  );
}
```

五个 tab 组各建 `index.tsx`，统一形如（换标题/图标）：

```tsx
// app/(tabs)/(home)/index.tsx —— zones/storage/compute/more 同构，改 title 与 Icon
import { View } from 'react-native';
import { Activity } from 'lucide-react-native';
import { EmptyState } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeContext';

export default function Home() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <EmptyState Icon={Activity} title="Home" subtitle="Coming in a later milestone." />
    </View>
  );
}
```

其余四个：Zones/`Globe`、Storage/`Database`、Compute/`Zap`、More/`MoreHorizontal`。

- [x] **Step 8: iOS 手动验证（本轮范围；Android 延后）**

Run: `npx expo start`，iOS 与 Android。
Expected: 首启进 onboarding 占位 → 点击创建 → 进入 5 Tab；杀掉 App 重启 → 进入 unlock 占位 → 点击解锁 → 回到 Tab；切换 5 个 tab 均显示对应骨架屏。

- [x] **Step 9: 类型检查 + 全量测试 + Commit**

```bash
npx tsc --noEmit && npx jest
git add -A && git commit -m "feat: AuthGate 门禁 + 5 Tab 路由骨架"
```

---

### Task 8: Onboarding 与 Unlock 完整 UI（密码 + 生物识别）

**Files:**
- Modify: `app/onboarding/index.tsx`、`app/unlock.tsx`（替换占位）
- Create: `src/components/AuthTextInput.tsx`
- Test: `src/auth/__tests__/screens.test.tsx`

**Interfaces:**
- Consumes: `createAccount/verifyPassword/getAccount`（Task 6）、`useAuth`（Task 7）、theme（Task 4）
- Produces: 可用的创建账号/解锁流程；`AuthTextInput({ placeholder, value, onChangeText, secureTextEntry?, testID? })`

- [x] **Step 1: 失败测试**

```tsx
// src/auth/__tests__/screens.test.tsx
const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), useSegments: () => [] }));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeContext';
import { AuthGateProvider } from '../AuthGate';
import { createAccount } from '../localAccount';
import Onboarding from '../../../app/onboarding/index';
import Unlock from '../../../app/unlock';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider><AuthGateProvider>{ui}</AuthGateProvider></ThemeProvider>);

test('onboarding rejects short password and mismatch', async () => {
  store.clear();
  wrap(<Onboarding />);
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('password'), 'short');
  fireEvent.changeText(screen.getByTestId('confirm'), 'short');
  fireEvent.press(screen.getByText('Create Account'));
  await waitFor(() => expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy());
  fireEvent.changeText(screen.getByTestId('password'), 'longenough');
  fireEvent.changeText(screen.getByTestId('confirm'), 'different1');
  fireEvent.press(screen.getByText('Create Account'));
  await waitFor(() => expect(screen.getByText('Passwords do not match.')).toBeTruthy());
});

test('unlock shows error on wrong password', async () => {
  store.clear();
  await createAccount('JT', 'hunter2secret', false);
  wrap(<Unlock />);
  fireEvent.changeText(screen.getByTestId('password'), 'wrong');
  fireEvent.press(screen.getByText('Unlock'));
  await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeTruthy());
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx jest src/auth/__tests__/screens` → FAIL

- [x] **Step 3: 实现**

```tsx
// src/components/AuthTextInput.tsx
import { TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { label } from '../theme/tokens';

interface Props { placeholder: string; value: string; onChangeText: (t: string) => void; secureTextEntry?: boolean; testID?: string; }
export function AuthTextInput({ placeholder, value, onChangeText, secureTextEntry, testID }: Props) {
  const { mode, colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      placeholder={placeholder}
      placeholderTextColor={label(mode, 0.3)}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      autoCapitalize="none"
      style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: colors.searchBg }}
    />
  );
}
```

```tsx
// app/onboarding/index.tsx
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Shield } from 'lucide-react-native';
import { AuthTextInput } from '../../src/components/AuthTextInput';
import { createAccount } from '../../src/auth/localAccount';
import { useAuth } from '../../src/auth/AuthGate';
import { useTheme } from '../../src/theme/ThemeContext';
import { accent, label, tint } from '../../src/theme/tokens';

export default function Onboarding() {
  const { onAccountCreated } = useAuth();
  const { mode, colors } = useTheme();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [biometrics, setBiometrics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError('Name is required.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setError(null);
    setBusy(true);
    try {
      await createAccount(name.trim(), password, biometrics);
      onAccountCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12, backgroundColor: colors.bg }}>
      <View style={{ alignSelf: 'center', width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent.orange, '22'), marginBottom: 8 }}>
        <Shield size={30} color={accent.orange} />
      </View>
      <Text style={{ fontSize: 26, fontWeight: '700', textAlign: 'center', color: colors.text }}>Create App Account</Text>
      <Text style={{ fontSize: 13, textAlign: 'center', marginBottom: 12, color: label(mode, 0.5) }}>
        A local account that locks this app. It is not your Cloudflare account.
      </Text>
      <AuthTextInput testID="name" placeholder="Your name" value={name} onChangeText={setName} />
      <AuthTextInput testID="password" placeholder="Password (min. 8 chars)" value={password} onChangeText={setPassword} secureTextEntry />
      <AuthTextInput testID="confirm" placeholder="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
        <Text style={{ fontSize: 15, color: colors.text }}>Unlock with Face ID / fingerprint</Text>
        <Switch value={biometrics} onValueChange={setBiometrics} trackColor={{ true: accent.orange }} />
      </View>
      {error ? <Text style={{ fontSize: 13, color: accent.red }}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={submit} style={({ pressed }) => ({ borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: accent.orange, opacity: busy || pressed ? 0.6 : 1 })}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff' }}>Create Account</Text>
      </Pressable>
    </View>
  );
}
```

```tsx
// app/unlock.tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Lock, ScanFace } from 'lucide-react-native';
import { AuthTextInput } from '../src/components/AuthTextInput';
import { getAccount, verifyPassword } from '../src/auth/localAccount';
import { useAuth } from '../src/auth/AuthGate';
import { useTheme } from '../src/theme/ThemeContext';
import { accent, label, tint } from '../src/theme/tokens';

export default function Unlock() {
  const { unlock } = useAuth();
  const { mode, colors } = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  useEffect(() => {
    getAccount().then((acc) => {
      if (acc) { setName(acc.name); setBiometricsEnabled(acc.biometricsEnabled); }
    });
  }, []);

  const tryBiometrics = async () => {
    const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!ok) return;
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock cloudflareOps' });
    if (res.success) unlock();
  };

  useEffect(() => { if (biometricsEnabled) void tryBiometrics(); }, [biometricsEnabled]);

  const submit = async () => {
    if (await verifyPassword(password)) { setError(null); unlock(); }
    else setError('Incorrect password.');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12, backgroundColor: colors.bg }}>
      <View style={{ alignSelf: 'center', width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent.orange, '22'), marginBottom: 8 }}>
        <Lock size={30} color={accent.orange} />
      </View>
      <Text style={{ fontSize: 26, fontWeight: '700', textAlign: 'center', color: colors.text }}>{name ? `Welcome back, ${name}` : 'Welcome back'}</Text>
      <AuthTextInput testID="password" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={{ fontSize: 13, color: accent.red }}>{error}</Text> : null}
      <Pressable onPress={submit} style={({ pressed }) => ({ borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: accent.orange, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff' }}>Unlock</Text>
      </Pressable>
      {biometricsEnabled ? (
        <Pressable onPress={tryBiometrics} style={{ alignItems: 'center', paddingVertical: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <ScanFace size={18} color={label(mode, 0.6)} />
          <Text style={{ fontSize: 14, color: label(mode, 0.6) }}>Use Face ID / fingerprint</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [x] **Step 4: 跑测试通过**

Run: `npx jest` → 全部 PASS

- [x] **Step 5: iOS 手动验证 + 生物识别自动化验证（本轮范围；Android 延后）**

Expected: 删除 App 重装（清 SecureStore）→ onboarding 完整表单（校验生效）→ 创建后进 Tab；重启 → unlock 屏，错密码报错、正确密码进入；开了生物识别的设备自动弹 Face ID/指纹。

- [x] **Step 6: Commit**

```bash
npx tsc --noEmit && npx jest
git add -A && git commit -m "feat: onboarding 与 unlock 完整 UI（密码 + 生物识别）"
```

---

### Task 9: 收尾（README + 全量验证）

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 可交接的地基里程碑

- [x] **Step 1: README**

```markdown
# cloudflareOps

Cloudflare multi-account mobile client (Expo, iOS + Android).

## Development

- `npm install`
- `npx expo start` — then press `i` (iOS) or `a` (Android)
- `npx jest` — unit/component tests
- `npx tsc --noEmit` — type check

## Docs

- Spec: `docs/superpowers/specs/2026-07-25-cloudflare-client-p1-design.md`
- Plans: `docs/superpowers/plans/`
- Design reference (Figma Make export): `docs/design-reference/`
```

- [x] **Step 2: 全量自动化验证 + iOS 冷启动验证**

```bash
npx tsc --noEmit && npx jest
```

Expected: 0 type errors，全部测试通过。双端各冷启动一次走完 onboarding→tabs、重启→unlock→tabs 两条链路。

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README 与地基里程碑收尾"
```

---

## Self-Review 记录

1. **Spec 覆盖**：本计划对应 spec §12 第 1-3 步（spike/脚手架/本地账号）+ §2 技术栈地基 + §3.1 本地账号 + §7 路由骨架。§3.2 绑定、§4-6 数据层/同步、§8 屏幕在计划 2-4。无本计划范围内的遗漏。
2. **占位符扫描**：Task 7 Step 6 的两个"占位屏"是显式设计（Task 8 同计划内替换），非计划缺口。
3. **类型一致性**：`useAuth`/`useTheme`/`LocalAccount`/组件 props 在各任务间签名一致；`label(mode, alpha)` 全文统一。
4. **对 spec 的一处偏离**：tab 导航用 JS `Tabs` 而非 NativeTabs（设计稿是自定义胶囊高亮样式，NativeTabs 无法自定义成设计稿形态）——需在 spec §2 同步修订一行。
