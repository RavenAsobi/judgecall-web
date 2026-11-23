# Nimblism changes

## 2026-07-29

- Replaced the simulated teaching prototype with the real Talishar PHP engine and Talishar-FE client.
- Added a minimal Nimblism practice entry screen.
- Wired Fabrary URLs to Talishar's real `CreateGame.php` / `JoinGame.php` import path.
- Fixed the practice opponent to the upstream `Assets/FaiCC.txt` AI deck.
- Preserved the upstream lobby, game-state protocol, priority system, prompts, combat chain, and game table interaction.
- Added server-environment configuration for Fabrary credentials and a clear missing-key error.
- Replaced the main header, footer, title, colors, and primary exported-stats logo with Nimblism branding.
- Archived the former simulated app in `prototype-archive/`.