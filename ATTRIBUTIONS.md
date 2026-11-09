# Attributions

Open DMX Studio is built on open-source software and public specifications. Thank you to their authors.
All runtime and build dependencies below are MIT licensed (versions as installed; see `package-lock.json`).

## Runtime dependencies

| Package               | Use                                    | Project                                                  |
| --------------------- | -------------------------------------- | -------------------------------------------------------- |
| React, React DOM      | UI                                     | https://github.com/facebook/react                        |
| Express               | HTTP server                            | https://github.com/expressjs/express                     |
| cors                  | CORS middleware                        | https://github.com/expressjs/cors                        |
| helmet                | Security headers                       | https://github.com/helmetjs/helmet                       |
| express-rate-limit    | Rate limiting                          | https://github.com/express-rate-limit/express-rate-limit |
| ws                    | WebSocket server                       | https://github.com/websockets/ws                         |
| zod                   | Input validation                       | https://github.com/colinhacks/zod                        |
| fast-xml-parser       | Reads QLC+ fixture files               | https://github.com/NaturalIntelligence/fast-xml-parser   |
| serialport (optional) | USB/serial access to the DMX interface | https://github.com/serialport/node-serialport            |

## Build and quality tooling

Vite and `@vitejs/plugin-react` (https://github.com/vitejs/vite), ESLint (https://github.com/eslint/eslint),
Prettier (https://github.com/prettier/prettier), concurrently (https://github.com/open-cli-tools/concurrently).

## Fonts

- **Manrope** by Mikhail Sharanda, SIL Open Font License 1.1, bundled locally through the `@fontsource-variable/manrope` package
  (https://fontsource.org/fonts/manrope). The app works fully offline.

## Specifications and formats

- **DMX512 / ANSI E1.11** is the lighting control protocol this app outputs.
- **ENTTEC DMX USB Pro API**: the "Send DMX Packet" framing in `server/clients/enttecProDriver.js` follows ENTTEC's
  published interface specification. ENTTEC is a trademark of its owner; this project is not affiliated with it.
- **QLC+ fixture definitions (.qxf)**: `server/services/qlcImporter.js` reads this XML format, documented by the QLC+
  project (https://github.com/mcallegari/qlcplus, Apache-2.0). No QLC+ code or fixture data is bundled; users import
  files they already have, and should check the licence of any definitions they use.
- **Open Fixture Library (OFL)**: `server/services/fixtureLibrary.js` converts OFL fixture JSON files
  (format documented at https://github.com/OpenLightingProject/open-fixture-library, `docs/fixture-format.md`).
  No OFL data is bundled. If you import fixtures from https://open-fixture-library.org, check the license terms
  stated by that project for the data you use, and keep credit to the OFL contributors.

## Not affiliated

SoundSwitch, Engine DJ and Denon DJ are trademarks of inMusic Brands. This project is independent and is not
affiliated with or endorsed by them. No SoundSwitch or Engine DJ code or files are included.

## Icons and design

Icons in `src/components/Icon.jsx` are original. The visual design (tokens in `src/styles/tokens.css`) is original.
