# Repository Instructions

## Commits

Use Conventional Commits for every commit because Release Please derives
versions and changelog entries from commit messages.

- Use `fix:` for bug fixes that should produce a patch release.
- Use `feat:` for features that should produce a minor release.
- Use `type!:` or a `BREAKING CHANGE:` footer for breaking changes that should
  produce a major release.
- Use other valid types such as `docs:`, `test:`, `build:`, `ci:`, `refactor:`,
  or `chore:` when the change should not trigger a release by itself.
- Keep the summary imperative, concise, and without a trailing period.
