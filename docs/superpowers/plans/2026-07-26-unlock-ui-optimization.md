# Unlock UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing centered Unlock screen feel immediate, deliberate, and safe while preserving stored-account compatibility.

**Architecture:** Move password derivation into a focused asynchronous helper, then let `localAccount` await that helper without changing persisted data. Extend the shared authentication input with opt-in password visibility and keyboard-submit support. Model password and biometric work as one mutually exclusive UI state in `Unlock`.

**Tech Stack:** Expo 57, React Native 0.86, Expo Router, TypeScript, `@noble/hashes`, Expo SecureStore, Expo LocalAuthentication, Jest, React Native Testing Library.

## Global Constraints

- Preserve the centered Unlock structure and existing Cloudflare dark theme.
- Keep `SCRYPT_PARAMS` equivalent to `{ N: 2 ** 14, r: 8, p: 1, dkLen: 32 }`.
- Existing stored accounts must unlock without migration.
- Biometrics must only start after an explicit user tap.
- UI copy remains English.
- Passwords must not be logged or newly persisted.
- Preserve unrelated user changes in `.DS_Store`, `AGENTS.md`, and `Cloudflare Client App Design/`.

## File Map

- Create `src/auth/passwordHash.ts`: asynchronous password derivation and fixed scrypt parameters.
- Create `src/auth/__tests__/passwordHash.test.ts`: persisted-hash compatibility coverage.
- Modify `src/auth/localAccount.ts`: await asynchronous derivation during account creation and verification.
- Modify `src/components/AuthTextInput.tsx`: optional visibility toggle, editable state, and keyboard-submit props.
- Create `src/components/__tests__/AuthTextInput.test.tsx`: reusable input interaction coverage.
- Modify `app/unlock.tsx`: unified busy state, manual biometrics, validation, keyboard behavior, and visual polish.
- Modify `src/auth/__tests__/screens.test.tsx`: Unlock behavior and accessibility coverage.

---

### Task 1: Asynchronous Password Derivation

**Files:**
- Create: `src/auth/passwordHash.ts`
- Create: `src/auth/__tests__/passwordHash.test.ts`
- Modify: `src/auth/localAccount.ts`
- Test: `src/auth/__tests__/localAccount.test.ts`

**Interfaces:**
- Produces: `derivePasswordHash(password: string, saltHex: string): Promise<string>`
- Consumes: `scryptAsync(password, salt, options): Promise<Uint8Array>`

- [ ] **Step 1: Write the failing compatibility test**

Create `src/auth/__tests__/passwordHash.test.ts`:

```ts
import { derivePasswordHash } from '../passwordHash';

test('derives the existing persisted scrypt hash asynchronously', async () => {
  await expect(
    derivePasswordHash('hunter2secret', 'ab'.repeat(16)),
  ).resolves.toBe(
    '82a32df0a7b7133ed1ec35f9cecbe1422070cbbf835bfbda77dcc780c605d9d2',
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
npx jest src/auth/__tests__/passwordHash.test.ts --runInBand
```

Expected: FAIL because `../passwordHash` does not exist.

- [ ] **Step 3: Implement the asynchronous helper**

Create `src/auth/passwordHash.ts`:

```ts
import { scryptAsync } from '@noble/hashes/scrypt.js';
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';

const SCRYPT_PARAMS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
  asyncTick: 8,
};

export async function derivePasswordHash(
  password: string,
  saltHex: string,
): Promise<string> {
  return bytesToHex(
    await scryptAsync(
      utf8ToBytes(password),
      hexToBytes(saltHex),
      SCRYPT_PARAMS,
    ),
  );
}
```

- [ ] **Step 4: Route account operations through the helper**

In `src/auth/localAccount.ts`, remove the direct `scrypt` and encoding imports,
import `derivePasswordHash`, and replace the synchronous helper. Account
creation must construct the account before saving:

```ts
import { bytesToHex } from '@noble/hashes/utils.js';
import { derivePasswordHash } from './passwordHash';

export async function createAccount(
  name: string,
  password: string,
  biometricsEnabled: boolean,
): Promise<void> {
  const saltHex = bytesToHex(getRandomBytes(16));
  const hashHex = await derivePasswordHash(password, saltHex);
  const account: LocalAccount = {
    name,
    organization: '',
    email: '',
    saltHex,
    hashHex,
    biometricsEnabled,
    onboardingComplete: true,
    onboardingStep: 'done',
    createdAt: Date.now(),
  };
  await saveAccount(account);
}
```

Apply the same `const hashHex = await derivePasswordHash(...)` pattern to
`createOnboardingAccount`. Update verification:

```ts
export async function verifyPassword(password: string): Promise<boolean> {
  const account = await getAccount();
  if (!account) {
    return false;
  }
  return (
    (await derivePasswordHash(password, account.saltHex)) === account.hashHex
  );
}
```

- [ ] **Step 5: Run focused authentication tests**

Run:

```sh
npx jest src/auth/__tests__/passwordHash.test.ts src/auth/__tests__/localAccount.test.ts --runInBand
```

Expected: PASS, including existing account storage and verification cases.

- [ ] **Step 6: Commit**

```sh
git add src/auth/passwordHash.ts src/auth/localAccount.ts src/auth/__tests__/passwordHash.test.ts
git commit -m "perf: 异步执行本地密码派生"
```

---

### Task 2: Password Input Interaction

**Files:**
- Modify: `src/components/AuthTextInput.tsx`
- Create: `src/components/__tests__/AuthTextInput.test.tsx`

**Interfaces:**
- Produces optional props:
  - `disabled?: boolean`
  - `onSubmitEditing?: TextInputProps['onSubmitEditing']`
  - `returnKeyType?: TextInputProps['returnKeyType']`
  - `showPasswordToggle?: boolean`
- Existing callers remain source-compatible.

- [ ] **Step 1: Write the failing visibility-toggle test**

Create `src/components/__tests__/AuthTextInput.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AuthTextInput } from '../AuthTextInput';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
}));

test('toggles password visibility with an accessible action', () => {
  render(
    <ThemeProvider>
      <AuthTextInput
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
        value="hunter2secret"
      />
    </ThemeProvider>,
  );

  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Hide password' }),
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
npx jest src/components/__tests__/AuthTextInput.test.tsx --runInBand
```

Expected: FAIL because `showPasswordToggle` is not an accepted prop and the
accessible toggle is absent.

- [ ] **Step 3: Implement the opt-in input controls**

Update `AuthTextInputProps` and destructuring:

```ts
interface AuthTextInputProps {
  disabled?: boolean;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  placeholder: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  testID?: string;
  textContentType?: TextInputProps['textContentType'];
  value: string;
  onChangeText: (text: string) => void;
}
```

Track password visibility:

```ts
const [passwordVisible, setPasswordVisible] = useState(false);
const isSecure = Boolean(secureTextEntry && !passwordVisible);
```

Replace the bare input with a bordered container containing the `TextInput` and
an opt-in `Pressable`. Forward `editable={!disabled}`, `onSubmitEditing`, and
`returnKeyType` to `TextInput`. The toggle must use:

```tsx
{showPasswordToggle ? (
  <Pressable
    accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
    accessibilityRole="button"
    disabled={disabled}
    hitSlop={10}
    onPress={() => setPasswordVisible((visible) => !visible)}
    style={styles.visibilityButton}
  >
    {passwordVisible ? (
      <EyeOff color={label(mode, 0.55)} size={19} />
    ) : (
      <Eye color={label(mode, 0.55)} size={19} />
    )}
  </Pressable>
) : null}
```

Move background and border styles to `styles.container`; give the input
`flex: 1`, remove its own border, and reduce container opacity to `0.55` when
disabled.

- [ ] **Step 4: Run component and onboarding tests**

Run:

```sh
npx jest src/components/__tests__/AuthTextInput.test.tsx src/auth/__tests__/screens.test.tsx --runInBand
```

Expected: PASS; existing onboarding inputs retain their behavior because the
new controls are opt-in.

- [ ] **Step 5: Commit**

```sh
git add src/components/AuthTextInput.tsx src/components/__tests__/AuthTextInput.test.tsx
git commit -m "feat: 增强认证密码输入交互"
```

---

### Task 3: Responsive Unlock State and Visual Polish

**Files:**
- Modify: `app/unlock.tsx`
- Modify: `src/auth/__tests__/screens.test.tsx`

**Interfaces:**
- Consumes: `verifyPassword(password: string): Promise<boolean>`
- Consumes: enhanced `AuthTextInput` props from Task 2.
- Produces one mutually exclusive state:
  `authMode: 'password' | 'biometric' | null`.

- [ ] **Step 1: Replace automatic-biometric expectations**

Rewrite the successful biometric test so mount remains locked until the user
presses the secondary action:

```tsx
test('starts successful biometric authentication only after a user tap', async () => {
  jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
  jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
  jest
    .mocked(LocalAuthentication.authenticateAsync)
    .mockResolvedValue({ success: true });
  await createAccount('JT', 'hunter2secret', true);
  renderWithProviders(<Unlock />);

  const biometricButton = await screen.findByRole('button', {
    name: 'Use Face ID / fingerprint',
  });
  expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();

  fireEvent.press(biometricButton);

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
});
```

Update the rejection and serialization tests to press the biometric button
before expecting `authenticateAsync` calls. Their final state must remain
`locked`.

- [ ] **Step 2: Add failing password interaction tests**

Add these focused cases to `src/auth/__tests__/screens.test.tsx`:

```tsx
test('rejects an empty unlock password without reading storage again', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  await screen.findByText('Welcome back, JT');
  jest.mocked(SecureStore.getItemAsync).mockClear();

  fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));

  expect(await screen.findByText('Enter your password.')).toBeTruthy();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});

test('shows a single busy password attempt and prevents duplicate submission', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  await screen.findByText('Welcome back, JT');

  let resolveRead: ((value: string | null) => void) | undefined;
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');
  fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));

  const busyButton = await screen.findByRole('button', {
    name: 'Unlocking…',
  });
  expect(busyButton).toBeDisabled();
  expect(screen.getByTestId('password').props.editable).toBe(false);
  fireEvent.press(busyButton);
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveRead?.(mockStore.get('local-account-v1') ?? null);
  });
  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
});

test('clears a password error when the user edits again', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  fireEvent.changeText(screen.getByTestId('password'), 'wrong');
  fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
  expect(await screen.findByText('Incorrect password.')).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('password'), 'wrong2');

  expect(screen.queryByText('Incorrect password.')).toBeNull();
});

test('submits the password from the keyboard return action', async () => {
  await createAccount('JT', 'hunter2secret', false);
  renderWithProviders(<Unlock />);
  await screen.findByText('Welcome back, JT');
  fireEvent.changeText(screen.getByTestId('password'), 'hunter2secret');

  fireEvent(screen.getByTestId('password'), 'submitEditing');

  await waitFor(() =>
    expect(screen.getByTestId('auth-status').props.children).toBe('unlocked'),
  );
});
```

- [ ] **Step 3: Run the Unlock tests and verify RED**

Run:

```sh
npx jest src/auth/__tests__/screens.test.tsx --runInBand
```

Expected failures:

- biometrics still starts automatically;
- empty password performs verification;
- no `Unlocking…` state exists;
- controls remain enabled;
- previous errors remain visible while editing.

- [ ] **Step 4: Implement unified authentication state**

In `app/unlock.tsx`, replace `biometricsBusy` with:

```ts
type AuthMode = 'password' | 'biometric' | null;

const [authMode, setAuthMode] = useState<AuthMode>(null);
const passwordFlight = useRef<Promise<void> | null>(null);
const authBusy = authMode !== null;
```

Remove the automatic `tryBiometrics()` call from the account-loading effect.
Guard `tryBiometrics` with `authBusy`, set `authMode` to `'biometric'`, and
restore it to `null` only for the matching request.

Implement password submission as a serialized flight:

```ts
const submit = () => {
  if (passwordFlight.current || authMode !== null) {
    return passwordFlight.current ?? Promise.resolve();
  }
  if (!password) {
    setError('Enter your password.');
    return Promise.resolve();
  }

  setError(null);
  setAuthMode('password');
  Keyboard.dismiss();

  let flight: Promise<void>;
  flight = new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  })
    .then(async () => {
      if (await verifyPassword(password)) {
        unlock();
        return;
      }
      if (isMounted.current) {
        setError('Incorrect password.');
      }
    })
    .catch(() => reportAccountError())
    .finally(() => {
      if (passwordFlight.current === flight) {
        passwordFlight.current = null;
      }
      if (isMounted.current) {
        setAuthMode(null);
      }
    });

  passwordFlight.current = flight;
  return flight;
};
```

Use a password change handler that clears errors:

```ts
const changePassword = (value: string) => {
  setPassword(value);
  if (error) {
    setError(null);
  }
};
```

- [ ] **Step 5: Implement the approved centered UI**

Add `ActivityIndicator` and `Keyboard` imports. Configure `AuthTextInput`:

```tsx
<AuthTextInput
  disabled={authBusy}
  onChangeText={changePassword}
  onSubmitEditing={() => void submit()}
  placeholder="Password"
  returnKeyType="go"
  secureTextEntry
  showPasswordToggle
  testID="password"
  textContentType="password"
  value={password}
/>
```

Update the primary action:

```tsx
<Pressable
  accessibilityLabel={authMode === 'password' ? 'Unlocking…' : 'Unlock'}
  accessibilityRole="button"
  accessibilityState={{ busy: authMode === 'password', disabled: authBusy }}
  disabled={authBusy}
  onPress={() => void submit()}
  style={({ pressed }) => [
    styles.primaryButton,
    { backgroundColor: accent.orange },
    pressed && !authBusy && styles.primaryButtonPressed,
    authBusy && styles.actionDisabled,
  ]}
>
  {authMode === 'password' ? (
    <>
      <ActivityIndicator color={palettes.dark.text} size="small" />
      <Text style={[styles.primaryButtonText, { color: palettes.dark.text }]}>
        Unlocking…
      </Text>
    </>
  ) : (
    <Text style={[styles.primaryButtonText, { color: palettes.dark.text }]}>
      Unlock
    </Text>
  )}
</Pressable>
```

Use the same `authBusy` state for the biometric button, showing
`Authenticating…` only when `authMode === 'biometric'`. Tighten the visual
layout with:

```ts
content: {
  alignSelf: 'center',
  flex: 1,
  justifyContent: 'center',
  maxWidth: 440,
  paddingHorizontal: 24,
  width: '100%',
},
form: {
  gap: 12,
  marginTop: 26,
},
primaryButton: {
  alignItems: 'center',
  borderRadius: 15,
  flexDirection: 'row',
  gap: 9,
  justifyContent: 'center',
  minHeight: 52,
},
primaryButtonPressed: {
  opacity: 0.84,
  transform: [{ scale: 0.985 }],
},
actionDisabled: {
  opacity: 0.68,
},
```

- [ ] **Step 6: Run focused tests**

Run:

```sh
npx jest src/auth/__tests__/screens.test.tsx src/components/__tests__/AuthTextInput.test.tsx --runInBand
```

Expected: PASS with no React state-update warnings.

- [ ] **Step 7: Commit**

```sh
git add app/unlock.tsx src/auth/__tests__/screens.test.tsx
git commit -m "feat: 优化 unlock 页面交互与反馈"
```

---

## Final Verification

- [ ] Run all tests:

```sh
npm test -- --runInBand
```

Expected: all suites and tests PASS.

- [ ] Run TypeScript:

```sh
npx tsc --noEmit
```

Expected: exit code 0 with no diagnostics.

- [ ] Run formatting checks:

```sh
git diff --check
```

Expected: no output.

- [ ] Verify on the iOS Simulator:

1. Open the existing local account's Unlock screen.
2. Confirm Face ID does not open automatically.
3. Focus the password field and toggle visibility twice.
4. Submit an empty password and confirm the inline instruction.
5. Enter an incorrect password and confirm the error clears on editing.
6. Enter a correct password and confirm `Unlocking…` renders immediately,
   duplicate taps are ignored, and the five-tab screen opens.
7. Return to Unlock and manually trigger Face ID.
8. Confirm the centered layout remains readable with the keyboard visible.
