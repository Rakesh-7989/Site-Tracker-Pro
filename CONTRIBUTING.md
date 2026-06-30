# Contributing to SiteTrack Pro

Thank you for your interest in contributing.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```sh
   git clone https://github.com/<your-username>/site-tracker-pro.git
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Start the dev server:
   ```sh
   npm run dev
   ```

## Development Workflow

- Branch from `main` for all work.
- Run `npm run lint` and `npm run typecheck` before committing.
- Ensure tests pass: `npm test`
- Keep PRs focused on a single concern.

## Code Style

- The project uses Prettier (`.prettierrc.json`) and ESLint (`eslint.config.js`).
- Format your code: `npm run format`
- Follow existing patterns in the codebase.

## Commit Messages

Use conventional commit format:

```
<type>: <short description>

<optional body>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`

## Pull Request Process

1. Update the CHANGELOG.md with your changes under `[Unreleased]`.
2. Ensure the build and all tests pass.
3. Request review from a maintainer.
4. Squash merge when approved.

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/device info (for UI bugs)
- Screenshots (if applicable)
