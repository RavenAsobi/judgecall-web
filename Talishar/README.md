# Nimblism

Nimblism is now built on the real GPL-3.0 Talishar frontend and PHP rules engine. The former simulated React demo has been moved to `prototype-archive/` and is no longer the active implementation.

## Active projects

- `Nimblism-FE/` — Talishar-FE with a minimal Nimblism practice entry screen. After game creation it uses the upstream lobby, Redux state protocol, prompts, combat chain, priority handling, and game table components.
- `Nimblism-Engine/` — Talishar PHP engine, including the real card dictionary, decision queue, game-state persistence, AI handling, and `Assets/FaiCC.txt` opponent deck.
- `upstream/` — untouched shallow clones used to compare future Talishar updates.
- `prototype-archive/` — the retired simulated teaching prototype.

## Why Fabrary now needs a server key

Talishar does not scrape Fabrary in the browser. `Nimblism-Engine/APIs/JoinGame.php` sends the deck ID to Fabrary's Talishar endpoint with an `x-api-key` header and converts the returned cards into Talishar card identifiers. The key is an external credential and is not included in GPL source.

Copy:

```powershell
Copy-Item Nimblism-Engine/.env.example Nimblism-Engine/.env
```

Then set:

```dotenv
FABRARY_API_KEY=your_server_side_key
```

Never expose this key through a `VITE_` variable or commit it to source control.

## Run the authentic stack

Requirements:

- Docker Desktop / Docker Engine
- Node.js 24.14
- npm
- A Fabrary server-to-server API key

Backend:

```powershell
cd D:\JudgeCall-Web\Talishar\Nimblism-Engine
Copy-Item HostFiles\RedirectorTemplate.php HostFiles\Redirector.php -Force
docker compose up -d
```

Frontend:

```powershell
cd D:\JudgeCall-Web\Talishar\Nimblism-FE
Copy-Item .env.template .env
npm install
npm run dev
```

Open `http://localhost:5173/`. The Vite proxy forwards Talishar API traffic to the local engine on port 8080.

## Practice request sent by Nimblism

The simplified screen submits the same fields used by Talishar Practice Mode:

```json
{
  "fabdb": "https://fabrary.net/decks/<deck-id>",
  "deckTestMode": true,
  "deckTestDeck": "FaiCC",
  "format": "cc",
  "visibility": "private"
}
```

The backend imports the real player deck, copies `Assets/FaiCC.txt` for player two, marks player two as AI, creates the real game files, and returns the normal game/lobby session identifiers.

## Licensing and artwork

The Talishar and Talishar-FE-derived source remains GPL-3.0. Their copyright notices and LICENSE files have been retained. Nimblism branding does not imply affiliation with Talishar or Legend Story Studios.

GPL covers the code, not Flesh and Blood trademarks or artwork. Card images are loaded using the upstream Talishar image-path implementation and remain property of Legend Story Studios. Review `ConveyTalishar.md` before public deployment.