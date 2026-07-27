# Unlock UI Optimization Design

## Goal

Improve the perceived responsiveness and clarity of the existing Unlock screen
without replacing its centered visual structure. The screen must remain
consistent with the dark Cloudflare onboarding experience and continue to gate
the five-tab application behind local authentication.

## Visual Direction

Keep the centered lock icon, welcome copy, password field, primary action, and
biometric action. Tighten the vertical rhythm so the title and form read as one
focused authentication surface. Preserve the black background, Cloudflare
orange accent, rounded controls, and English copy.

The password field receives a visible focused state and a show/hide password
control. The primary button provides pressed feedback and changes to a spinner
with `Unlocking…` while authentication is running. The biometric action remains
secondary and is only triggered by an explicit tap.

## Interaction Flow

Password submission follows this sequence:

1. Reject an empty password with an inline, actionable message.
2. Enter a shared authentication-busy state immediately.
3. Allow the busy UI to render before starting password derivation.
4. Read the account and verify its password hash.
5. Unlock the tab application on success, or restore the form with
   `Incorrect password.` on failure.

While authentication is busy, disable the password input, primary button, and
biometric action to prevent concurrent or duplicate attempts. Editing the
password clears a previous validation error. The keyboard Return action submits
the form.

Biometric authentication no longer starts when the screen mounts. A user tap
starts the existing hardware, enrollment, and native authentication checks.
Cancellation or native failure leaves the password path available without
showing a misleading error.

## Performance and Security

The password gate protects an account record already stored as one encrypted
SecureStore item. Use Expo Crypto's native asynchronous SHA-256 digest for the
current password verifier so normal unlocks remain compatible with Expo Go and
complete without blocking Hermes. Hash a domain-separated string containing the
verifier version, the existing 16-byte random hexadecimal salt, and the
password. Continue to store only the resulting 32-byte hexadecimal digest.

Add a password-verifier version to new account records. Existing records without
that version remain legacy scrypt records. On their first successful password
verification, verify the old hash once, derive the current digest, and
atomically rewrite the SecureStore account with the current version. Incorrect
legacy passwords must not modify storage. This preserves existing accounts
without keeping scrypt on the normal unlock path.

Remove Quick Crypto, Nitro Modules, Expo development-client configuration, and
their Jest shims. The legacy scrypt code remains only for migration and can be
removed after the migration window. Passwords remain component-local and must
never be logged or persisted.

## Verification

Automated tests must cover empty passwords, visible busy state, duplicate-submit
prevention, correct and incorrect passwords, manual-only biometrics, and hash
versioning and migration. Run the focused Jest tests, the complete Jest suite,
and `npx tsc --noEmit`. Launch with Expo Go, then manually verify focus, keyboard
submission, pressed and busy feedback, password visibility, errors, biometrics,
and successful navigation. Busy feedback should appear in the first rendered
frame. Current-verifier unlocks should reach the tab application within 250 ms
on the iOS Simulator; record the one-time legacy migration separately.
