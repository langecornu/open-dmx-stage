# Attributions

Open DMX Stage is built on open-source software and public specifications. Thank you to their authors.
Runtime dependencies are MIT licensed unless the table says otherwise; every licence is compatible with this project's
MIT licence (versions as installed; see `package-lock.json`).

## Runtime dependencies

| Package               | Use                                    | Project                                                  |
| --------------------- | -------------------------------------- | -------------------------------------------------------- |
| @anthropic-ai/sdk     | AI shows (Apache-2.0)                  | https://github.com/anthropics/anthropic-sdk-typescript   |
| React, React DOM      | UI                                     | https://github.com/facebook/react                        |
| Express               | HTTP server                            | https://github.com/expressjs/express                     |
| cors                  | CORS middleware                        | https://github.com/expressjs/cors                        |
| helmet                | Security headers                       | https://github.com/helmetjs/helmet                       |
| express-rate-limit    | Rate limiting                          | https://github.com/express-rate-limit/express-rate-limit |
| ws                    | WebSocket server                       | https://github.com/websockets/ws                         |
| zod                   | Input validation                       | https://github.com/colinhacks/zod                        |
| fast-xml-parser       | Reads QLC+ fixture files               | https://github.com/NaturalIntelligence/fast-xml-parser   |
| music-metadata        | Reads the tags of the decks' music     | https://github.com/Borewit/music-metadata                |
| selfsigned            | Makes the https certificate (ADR 0009) | https://github.com/jfromaniello/selfsigned               |
| serialport (optional) | USB/serial access to the DMX interface | https://github.com/serialport/node-serialport            |

## Build and quality tooling

Vite and `@vitejs/plugin-react` (https://github.com/vitejs/vite), ESLint (https://github.com/eslint/eslint),
Prettier (https://github.com/prettier/prettier), concurrently (https://github.com/open-cli-tools/concurrently), all MIT.
Tests and checks, not shipped in the app: Vitest and its v8 coverage, jsdom, Testing Library and the ESLint React and
accessibility plugins (MIT), TypeScript for type checking (Apache-2.0), and axe-core for accessibility checks (MPL-2.0).

## Fonts

- **Manrope** by Mikhail Sharanda, SIL Open Font License 1.1, bundled locally through the `@fontsource-variable/manrope` package
  (https://fontsource.org/fonts/manrope). The app works fully offline.

## Specifications and formats

- **DMX512 / ANSI E1.11** is the lighting control protocol this app outputs.
- **Art-Net** is a trademark of Artistic Licence Holdings Ltd; `server/clients/artNetDriver.js` sends the public ArtDmx
  packet. **sACN** is ANSI E1.31 (ESTA); `server/clients/sacnDriver.js` sends E1.31 data packets.
- **Open DMX style USB cables**: `server/clients/openDmxDriver.js` follows the DMX512 serial format (250 kbaud, 8N2,
  break then start code). "Open DMX USB" is an ENTTEC product name; DSD TECH and DMXKing are their owners' marks.
- **ENTTEC DMX USB Pro API**: the "Send DMX Packet" framing in `server/clients/enttecProDriver.js` follows ENTTEC's
  published interface specification. ENTTEC is a trademark of its owner; this project is not affiliated with it.
- **QLC+ fixture definitions (.qxf)**: `server/services/qlcImporter.js` reads this XML format, documented by the QLC+
  project (https://github.com/mcallegari/qlcplus, Apache-2.0). No QLC+ code or fixture data is bundled; users import
  files they already have, and should check the licence of any definitions they use.
- **Open Fixture Library (OFL)**: `server/services/fixtureLibrary.js` converts OFL fixture JSON files
  (format documented at https://github.com/OpenLightingProject/open-fixture-library, `docs/fixture-format.md`).
  No OFL data is bundled. The Fixtures screen can search https://open-fixture-library.org through its public API
  (`server/clients/oflClient.js`; one fixed host, only the search words are sent) and copy a chosen fixture's channels
  into the user's own show. The project's repository is MIT-licensed. Each fixture added this way records, in its
  description, where it came from and who wrote it; keep that credit, and check the terms stated by that project for
  the data you use. The online search can be turned off with `OFL_ENABLED=false`.

## Not affiliated

SoundSwitch, Engine DJ and Denon DJ are trademarks of inMusic Brands. This project is independent and is not
affiliated with or endorsed by them. No SoundSwitch or Engine DJ code or files are included.

## Icons and design

Icons in `src/components/Icon.jsx` are original. The visual design (tokens in `src/styles/tokens.css`) is original.
