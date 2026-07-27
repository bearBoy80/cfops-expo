# Figma Onboarding 与首次认证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Figma 四步 onboarding 移植到 Expo，并确保引导完成后的每次冷启动或后台恢复都必须先 Unlock 才能进入 5 Tab。

**Architecture:** SecureStore 中的 `LocalAccount` 是引导与认证状态的唯一持久化来源。账号创建后先保持 `onboardingComplete: false`，Connect/Done 步骤可恢复；只有 Enter Console 成功写入完成标记后，AuthGate 才允许当前前台会话进入 Tab。Expo Router 使用现有 `Stack.Protected` 阻止未认证页面挂载。

**Tech Stack:** Expo SDK 57、Expo Router、React Native、TypeScript strict、expo-secure-store、expo-local-authentication、Jest + React Native Testing Library、Lucide React Native。

**Spec:** `docs/superpowers/specs/2026-07-26-onboarding-auth-flow-design.md`

## Global Constraints

- Figma source of truth: `/Users/jt.gui/workspace/expo/cloudflareOps/Cloudflare Client App Design/src/app/components/onboarding.tsx`
- UI 文案保持英文；颜色只来自 `src/theme/tokens.ts`
- 密码哈希、引导进度和生物识别偏好只存 SecureStore
- 不实现或模拟 Cloudflare OAuth、API Token、账号列表
- 已完成引导的旧账号升级后不得重复进入 onboarding
- iOS 完成运行时验收；Android 保持跨平台实现但本轮不运行
- 每个任务结束运行相关测试、`npx tsc --noEmit` 并创建 Conventional Commit

## File Structure

```text
app/onboarding/index.tsx                 四步流程协调器、恢复和持久化调用
src/onboarding/OnboardingControls.tsx    主按钮、字段、步骤指示器
src/onboarding/WelcomeStep.tsx           Figma Welcome
src/onboarding/CreateAccountStep.tsx     本地账号表单
src/onboarding/ConnectStep.tsx           OAuth/Token 占位说明与 Skip
src/onboarding/DoneStep.tsx              完成页与 Enter Console
src/onboarding/types.ts                  OnboardingStep 与 step 顺序
src/auth/localAccount.ts                 引导账号 CRUD、迁移与完成标记
src/auth/AuthGate.tsx                    未完成账号状态与完成回调
src/auth/routeGuards.ts                  onboarding 的 protected route guard
```

---

### Task 1: 可恢复的本地账号引导状态

**Files:**
- Modify: `src/auth/localAccount.ts`
- Modify: `src/auth/__tests__/localAccount.test.ts`

**Interfaces:**
- Consumes: `expo-secure-store`、现有 scrypt 哈希实现
- Produces:
  - `type PersistedOnboardingStep = 'connect' | 'done'`
  - `interface OnboardingProfile { organization: string; name: string; email: string }`
  - `createOnboardingAccount(profile, password, biometricsEnabled): Promise<void>`
  - `advanceOnboarding(step): Promise<void>`
  - `completeOnboarding(): Promise<void>`
  - 扩展后的 `LocalAccount`

- [ ] **Step 1: 写失败测试**

在 `src/auth/__tests__/localAccount.test.ts` 增加：

```ts
import {
  advanceOnboarding,
  completeOnboarding,
  createOnboardingAccount,
} from '../localAccount';

test('persists an incomplete onboarding account and advances its step', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    true,
  );

  expect(await getAccount()).toMatchObject({
    organization: 'Acme',
    name: 'JT',
    email: 'jt@acme.com',
    biometricsEnabled: true,
    onboardingComplete: false,
    onboardingStep: 'connect',
  });

  await advanceOnboarding('done');
  expect((await getAccount())?.onboardingStep).toBe('done');
});

test('marks onboarding complete without changing the password hash', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  const hashBefore = (await getAccount())?.hashHex;

  await completeOnboarding();

  expect(await getAccount()).toMatchObject({
    onboardingComplete: true,
    onboardingStep: 'done',
    hashHex: hashBefore,
  });
});

test('treats a legacy account without onboarding fields as complete', async () => {
  await createAccount('Legacy User', 'hunter2secret', false);
  const current = JSON.parse(mockStore.get('local-account-v1')!);
  delete current.organization;
  delete current.email;
  delete current.onboardingComplete;
  delete current.onboardingStep;
  mockStore.set('local-account-v1', JSON.stringify(current));

  expect(await getAccount()).toMatchObject({
    name: 'Legacy User',
    organization: '',
    email: '',
    onboardingComplete: true,
    onboardingStep: 'done',
  });
});
```

- [ ] **Step 2: 确认测试失败**

Run:

```sh
npm test -- --runInBand src/auth/__tests__/localAccount.test.ts
```

Expected: FAIL，新增函数未导出或新增字段不存在。

- [ ] **Step 3: 扩展数据类型与兼容解析**

在 `src/auth/localAccount.ts` 定义：

```ts
export type PersistedOnboardingStep = 'connect' | 'done';

export interface OnboardingProfile {
  organization: string;
  name: string;
  email: string;
}

export interface LocalAccount {
  name: string;
  organization: string;
  email: string;
  saltHex: string;
  hashHex: string;
  biometricsEnabled: boolean;
  onboardingComplete: boolean;
  onboardingStep: PersistedOnboardingStep;
  createdAt: number;
}
```

修改 `parseAccount()`：原有安全字段仍严格校验；新增字段缺失时只按旧账号迁移，
返回 `organization: ''`、`email: ''`、`onboardingComplete: true`、
`onboardingStep: 'done'`。若新增字段存在但类型或枚举值错误，继续抛
`LocalAccountStorageError('corrupt')`。

- [ ] **Step 4: 实现引导持久化函数**

先增加两个内部 helper：

```ts
async function saveAccount(account: LocalAccount): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(account));
  } catch {
    throw new LocalAccountStorageError('unavailable');
  }
}

async function requireAccount(): Promise<LocalAccount> {
  const account = await getAccount();
  if (!account) {
    throw new LocalAccountStorageError('corrupt');
  }
  return account;
}
```

再实现公开函数：

```ts
export async function createOnboardingAccount(
  profile: OnboardingProfile,
  password: string,
  biometricsEnabled: boolean,
): Promise<void> {
  const saltHex = bytesToHex(getRandomBytes(16));
  await saveAccount({
    ...profile,
    saltHex,
    hashHex: hashPassword(password, saltHex),
    biometricsEnabled,
    onboardingComplete: false,
    onboardingStep: 'connect',
    createdAt: Date.now(),
  }, password);
}

export async function advanceOnboarding(
  step: PersistedOnboardingStep,
): Promise<void> {
  const account = await requireAccount();
  await saveAccount({ ...account, onboardingStep: step });
}

export async function completeOnboarding(): Promise<void> {
  const account = await requireAccount();
  await saveAccount({
    ...account,
    onboardingComplete: true,
    onboardingStep: 'done',
  });
}
```

将现有 SecureStore 写入也收敛到 `saveAccount(account)`。保留
`createAccount(name, password, biometricsEnabled)`，但让它创建
`onboardingComplete: true` 的兼容账号，避免破坏现有测试和调用方。

- [ ] **Step 5: 运行测试与类型检查**

```sh
npm test -- --runInBand src/auth/__tests__/localAccount.test.ts
npx tsc --noEmit
```

Expected: 全部 PASS，0 type errors。

- [ ] **Step 6: Commit**

```sh
git add src/auth/localAccount.ts src/auth/__tests__/localAccount.test.ts
git commit -m "feat: 持久化 onboarding 进度与账号资料"
```

---

### Task 2: AuthGate 区分未完成引导与已锁定账号

**Files:**
- Modify: `src/auth/AuthGate.tsx`
- Modify: `src/auth/routeGuards.ts`
- Modify: `src/auth/__tests__/AuthGate.test.tsx`
- Modify: `src/auth/__tests__/routeGuards.test.ts`

**Interfaces:**
- Consumes: `LocalAccount.onboardingComplete`
- Produces:
  - `AuthStatus` 新增 `'onboarding'`
  - `onOnboardingCompleted(): void`
  - `routeGuards('onboarding').onboarding === true`

- [ ] **Step 1: 写失败测试**

```tsx
test('loads an incomplete account into onboarding instead of locked', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  const { result } = renderHook(() => useAuth(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe('onboarding'));
});

test('completes onboarding into tabs only while foregrounded', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('onboarding'));

  act(() => result.current.onOnboardingCompleted());
  expect(result.current.status).toBe('unlocked');
});

test('late onboarding completion while backgrounded stays locked', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('onboarding'));

  act(() => appStateListener?.('background'));
  act(() => result.current.onOnboardingCompleted());

  expect(result.current.status).toBe('locked');
});
```

在 route guard table 增加：

```ts
['onboarding', 'onboarding'],
```

- [ ] **Step 2: 确认测试失败**

```sh
npm test -- --runInBand src/auth/__tests__/AuthGate.test.tsx src/auth/__tests__/routeGuards.test.ts
```

Expected: FAIL，`onboarding` status 与 `onOnboardingCompleted` 不存在。

- [ ] **Step 3: 实现状态映射**

`AuthGate` 初始读取改为：

```ts
setStatus(
  !account
    ? 'no-account'
    : account.onboardingComplete
      ? 'locked'
      : 'onboarding',
);
```

`AuthValue` 增加：

```ts
onOnboardingCompleted: () => void;
```

实现：

```ts
onOnboardingCompleted: () => {
  setErrorMessage(null);
  setStatus(isForeground.current ? 'unlocked' : 'locked');
},
```

删除旧的 `onAccountCreated`，并更新所有测试与调用方。`routeGuards()` 中
`onboarding` guard 同时接受 `no-account` 和 `onboarding`。

- [ ] **Step 4: 运行测试与类型检查**

```sh
npm test -- --runInBand src/auth/__tests__/AuthGate.test.tsx src/auth/__tests__/routeGuards.test.ts
npx tsc --noEmit
```

Expected: 全部 PASS，0 type errors。

- [ ] **Step 5: Commit**

```sh
git add src/auth/AuthGate.tsx src/auth/routeGuards.ts src/auth/__tests__/AuthGate.test.tsx src/auth/__tests__/routeGuards.test.ts
git commit -m "feat: AuthGate 支持可恢复 onboarding 状态"
```

---

### Task 3: 移植 Figma 四步 Onboarding

**Files:**
- Create: `src/onboarding/types.ts`
- Create: `src/onboarding/OnboardingControls.tsx`
- Create: `src/onboarding/WelcomeStep.tsx`
- Create: `src/onboarding/CreateAccountStep.tsx`
- Create: `src/onboarding/ConnectStep.tsx`
- Create: `src/onboarding/DoneStep.tsx`
- Modify: `app/onboarding/index.tsx`
- Modify: `src/auth/__tests__/screens.test.tsx`

**Interfaces:**
- Consumes: Task 1 持久化函数、Task 2 `onOnboardingCompleted`
- Produces: Figma 四步 UI 和中断恢复

- [ ] **Step 1: 定义步骤类型与共享控件**

`src/onboarding/types.ts`：

```ts
export type OnboardingStep = 'welcome' | 'create' | 'connect' | 'done';
export const onboardingSteps: OnboardingStep[] = [
  'welcome',
  'create',
  'connect',
  'done',
];
```

`OnboardingControls.tsx` 提供：

```ts
export function OnboardingStepDots({ step }: { step: OnboardingStep }): JSX.Element;
export function OnboardingPrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  Icon?: LucideIcon;
}): JSX.Element;
export function OnboardingField(props: {
  Icon: LucideIcon;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID: string;
}): JSX.Element;
```

视觉值按 Figma 固定：页面水平 padding 24、主按钮 minHeight 52 / radius 16、
field surface / radius 12、激活 dot 20×6、普通 dot 6×6、间距 6。

- [ ] **Step 2: 写页面流程失败测试**

更新 `screens.test.tsx`：

```tsx
test('runs the Figma onboarding flow and persists completion', async () => {
  renderWithProviders(<Onboarding />);

  fireEvent.press(screen.getByText('Get Started'));
  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'jt@acme.com');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.changeText(screen.getByTestId('confirm'), 'hunter2secret');
  fireEvent.press(screen.getByText('Create Account'));

  expect(await screen.findByText('Bind Cloudflare accounts')).toBeTruthy();
  fireEvent.press(screen.getByText('Authorize with Cloudflare'));
  expect(
    await screen.findByText(
      'Cloudflare connections arrive in the next milestone. Skip for now to continue.',
    ),
  ).toBeTruthy();

  fireEvent.press(screen.getByText('Skip for now'));
  expect(await screen.findByText("You're all set")).toBeTruthy();
  fireEvent.press(screen.getByText('Enter Console'));

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
  expect(await getAccount()).toMatchObject({
    organization: 'Acme',
    email: 'jt@acme.com',
    onboardingComplete: true,
    onboardingStep: 'done',
  });
});

test('validates organization, email, password length, and confirmation', async () => {
  renderWithProviders(<Onboarding />);
  fireEvent.press(screen.getByText('Get Started'));

  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled();
  expect(
    screen.getByText('Fill in all fields to continue'),
  ).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('organization'), 'Acme');
  fireEvent.changeText(screen.getByTestId('name'), 'JT');
  fireEvent.changeText(screen.getByTestId('email'), 'invalid');
  fireEvent.changeText(screen.getByTestId('password'), 'short');
  fireEvent.changeText(screen.getByTestId('confirm'), 'different');
  expect(screen.getByText('Enter a valid work email.')).toBeTruthy();
  expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
  expect(screen.getByText('Passwords do not match.')).toBeTruthy();
});
```

- [ ] **Step 3: 确认页面测试失败**

```sh
npm test -- --runInBand src/auth/__tests__/screens.test.tsx
```

Expected: FAIL，当前页面没有 Welcome 与四步流程。

- [ ] **Step 4: 实现四个步骤组件**

按 Figma source 实现以下固定内容：

| Step | 标题 | 主操作 | 次操作 |
|---|---|---|---|
| Welcome | `Cloudflare Console` | `Get Started` | 无 |
| Create | `Create your account` | `Create Account` | `Back` |
| Connect | `Bind Cloudflare accounts` | `Skip for now` | `Back` |
| Done | `You're all set` | `Enter Console` | 无 |

Welcome 三张能力卡严格使用：

```ts
[
  { Icon: Building2, color: accent.orange, text: "Create your team's console account" },
  { Icon: Layers, color: accent.blue, text: 'Bind multiple Cloudflare accounts' },
  { Icon: Activity, color: accent.green, text: 'Monitor & manage everything globally' },
]
```

Connect 两个入口使用 `Cloud` 与 `KeyRound` 图标；点击任一入口显示：

```text
Cloudflare connections arrive in the next milestone. Skip for now to continue.
```

不得改变选择状态或创建模拟账号。

- [ ] **Step 5: 实现 coordinator 与恢复逻辑**

`app/onboarding/index.tsx` 初始化：

```ts
const [step, setStep] = useState<OnboardingStep>('welcome');
const [loading, setLoading] = useState(true);

useEffect(() => {
  let active = true;
  void getAccount()
    .then((account) => {
      if (!active) return;
      if (account && !account.onboardingComplete) {
        setStep(account.onboardingStep);
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });
  return () => {
    active = false;
  };
}, []);
```

步骤回调：

```ts
const handleCreated = () => setStep('connect');

const handleSkip = async () => {
  await advanceOnboarding('done');
  setStep('done');
};

const handleEnterConsole = async () => {
  await completeOnboarding();
  onOnboardingCompleted();
};
```

每个异步操作都有独立 busy/error 状态；失败时停留当前步骤并显示：

- 创建失败：`Could not create the local account. Try again.`
- 推进失败：`Could not save onboarding progress. Try again.`
- 完成失败：`Could not finish setup. Try again.`

- [ ] **Step 6: 增加恢复与写入失败测试**

```tsx
test('resumes an incomplete onboarding account at the persisted step', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await advanceOnboarding('done');

  renderWithProviders(<Onboarding />);

  expect(await screen.findByText(\"You're all set\")).toBeTruthy();
});

test('does not unlock when onboarding completion cannot be persisted', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await advanceOnboarding('done');
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('keychain unavailable'));

  renderWithProviders(<Onboarding />);
  fireEvent.press(await screen.findByText('Enter Console'));

  expect(await screen.findByText('Could not finish setup. Try again.')).toBeTruthy();
  expect(screen.getByTestId('auth-status').props.children).not.toBe('unlocked');
});
```

- [ ] **Step 7: 运行相关测试与类型检查**

```sh
npm test -- --runInBand src/auth
npx tsc --noEmit
```

Expected: 全部 PASS，0 type errors。

- [ ] **Step 8: Commit**

```sh
git add app/onboarding src/onboarding src/auth/__tests__/screens.test.tsx
git commit -m "feat: 移植 Figma 四步 onboarding"
```

---

### Task 4: 冷启动认证回归与 iOS 验收

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-26-figma-onboarding-auth.md`

**Interfaces:**
- Consumes: Tasks 1–3 完整流程
- Produces: 可交接的首次安装与后续认证行为

- [ ] **Step 1: 增加冷启动状态回归测试**

在 `AuthGate.test.tsx` 增加：

```tsx
test('loads a completed onboarding account as locked on the next launch', async () => {
  await createOnboardingAccount(
    { organization: 'Acme', name: 'JT', email: 'jt@acme.com' },
    'hunter2secret',
    false,
  );
  await completeOnboarding();

  const { result } = renderHook(() => useAuth(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe('locked'));
});
```

- [ ] **Step 2: 运行全量验证**

```sh
npm test -- --runInBand
npx tsc --noEmit
npx expo export --platform ios --output-dir /private/tmp/cloudflareops-onboarding-final
npx expo config --type introspect --json
git diff --check
```

Expected: 所有测试通过、0 type errors、iOS bundle 成功、Face ID usage description
仍存在、无 whitespace error。

- [ ] **Step 3: 全新 iOS Simulator 手动验收**

使用无该项目 SecureStore 数据的 Simulator：

1. 首次打开显示 Welcome，而不是单页 Create Account。
2. 依次完成 Create、Connect Skip、Done，进入 Home 5 Tab。
3. 终止并重新打开 Expo Go，首先显示 `Welcome back, <name>`。
4. 输入正确密码进入 Home。
5. 打开 Settings 使 App 进入后台，再回 Expo Go，重新显示 Unlock。
6. Metro 无红屏或未处理 Promise rejection。

- [ ] **Step 4: 更新 README**

在 Architecture 段说明：

```markdown
First launch follows the four-step Figma onboarding flow. After setup,
every cold start and foreground return requires password or biometric unlock
before the five-tab shell mounts.
```

- [ ] **Step 5: 标记计划完成并 Commit**

将本计划已完成步骤改为 `[x]`，记录 iOS 验收设备和结果，然后：

```sh
git add README.md docs/superpowers/plans/2026-07-26-figma-onboarding-auth.md src/auth/__tests__/AuthGate.test.tsx
git commit -m "docs: 收尾 onboarding 与冷启动认证"
```
