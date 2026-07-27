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

Replace synchronous `scrypt` verification with the package's compatible
`scryptAsync` implementation. Retain the existing `N`, `r`, `p`, salt, and
derived-key length so stored accounts require no migration and password
strength is not weakened. Passwords remain component-local and must never be
logged or newly persisted.

## Verification

Automated tests must cover empty passwords, visible busy state, duplicate-submit
prevention, correct and incorrect passwords, manual-only biometrics, and hash
compatibility. Run the focused Jest tests, the complete Jest suite, and
`npx tsc --noEmit`. Manually verify focus, keyboard submission, pressed and busy
feedback, password visibility, errors, Face ID, and successful navigation on
the iOS Simulator.
