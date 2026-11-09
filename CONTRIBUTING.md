# Contributing

Thanks for helping. This project controls physical lights, so small, well-tested changes are preferred.

## Set up

```bash
nvm install && nvm use   # Node 24 LTS, from .nvmrc
npm ci
npm run dev              # API on :4000, web app on :5173
```

You can work without any hardware: the **Simulator** output is always available.

## Before you open a pull request

```bash
npm run check            # lint, typecheck, tests, build
```

Other useful commands: `npm run test:coverage`, `npm run size`, `npm run licenses`, `npm run format`.

## Rules

- Follow [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md). It explains the style, structure, testing and security
  rules, and lists known gaps.
- Add or update tests. Every bug fix lands with a regression test.
- Update the docs (and screenshots) for any user-visible change, and `CHANGELOG.md`.
- Add new dependencies, file formats and protocols to `ATTRIBUTIONS.md`, and justify each dependency in the pull request.
- Say what you did **not** verify, especially anything involving real DMX hardware.
- Use [Conventional Commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`) and keep pull requests small and focused.

## Testing on real hardware

If you have a DMX adapter, `npm run dmx:ramp` ramps channel 1 through the same driver the app uses. Please report the
adapter, operating system and result in an issue; that is the most useful contribution for the USB drivers.

## Reporting security problems

See [SECURITY.md](SECURITY.md). Do not open a public issue.
