# Gamified Trade Night Asset Requirements

These assets are not required for the app to function, but they are the remaining polish layer for the Trade Night engine. The current app works with CSS, haptics, and simple sound generation; these files would make the experience feel finished.

## Required for a fully polished experience

| Asset | Suggested filename | Format | Specs | Used for |
| --- | --- | --- | --- | --- |
| Digital handshake lock | `assets/trade-night-handshake-lock.webm` plus optional `assets/trade-night-handshake-lock.lottie` | WebM with alpha or Lottie | 1.5-2s, transparent background, loops disabled | Plays when both traders complete hold-to-handshake |
| Escrow vault lock-in | `assets/trade-night-escrow-vault.webm` plus optional `assets/trade-night-escrow-vault.lottie` | WebM with alpha or Lottie | 2-3s, transparent background, cards sliding into vault | Plays after status becomes `HANDSHAKE_LOCKED` / `AGENT_ESCROW_VAULT` |
| Deal meter fair-swap burst | `assets/deal-meter-fair-swap.webm` | WebM with alpha | 0.8-1.2s, green/gold burst | Plays when deal classification is `Fair Swap` |
| Deal meter warning pulse | `assets/deal-meter-risk-warning.webm` | WebM with alpha | 0.8-1.2s, red/amber warning pulse | Plays when deal classification is `Steal / Risky Deal` |
| Shot-clock tick | `assets/shot-clock-tick.wav` | WAV or MP3 | Short, subtle tick, under 100ms | Final 5 seconds of the shot clock |
| Shot-clock expire sound | `assets/shot-clock-expired.wav` | WAV or MP3 | 0.3-0.7s, buzzer or low thud | Plays when offer changes to `EXPIRED` |

## Category card-back placeholders

Provide transparent PNG or WebP assets at 768x1024 or higher:

| Asset | Suggested filename | Visual direction |
| --- | --- | --- |
| Sports card back | `assets/card-back-sports.webp` | premium sports trading card back, neutral team-free design |
| TCG card back | `assets/card-back-tcg.webp` | fantasy/card-game style, no copyrighted marks |
| Grail card back | `assets/card-back-grail.webp` | premium slab/gold-edge collector look |
| General card back | `assets/card-back-general.webp` | CardSwipers branded neutral fallback |

## Optional ambience assets

| Asset | Suggested filename | Format | Used for |
| --- | --- | --- | --- |
| Trade floor light sweep | `assets/trade-floor-light-sweep.webm` | WebM alpha | Booth/lobby energy overlay |
| Booth table glow | `assets/booth-table-glow.webm` | WebM alpha | Active seller booth foreground |
| XP reward pop | `assets/xp-reward-pop.webm` | WebM alpha | `+10 Club XP` or leaderboard reward moment |

## Delivery guidance

- Prefer WebM with alpha for animation overlays on web and Android.
- Provide Lottie JSON when animation should be crisp, scalable, and tiny.
- Keep individual animation files under 1 MB where possible.
- Avoid copyrighted league, card-game, grading-company, or franchise logos unless CardSwipers has rights to use them.
- Audio should be subtle and short because the app already has haptic feedback.

## Current fallback behavior

Until these assets exist, the app remains functional using:

- CSS deal meter and shot-clock animations
- haptic vibration via `navigator.vibrate` where supported
- generated Web Audio tick sounds for the final countdown
- existing booth background images already in the repo
