# Repository Instructions

## Branches and pull requests

- Do not commit or push directly to `main`.
- Before starting work, fetch `origin/main` and base the work on its latest
  commit. If local changes exist, preserve them before rebasing or switching.
- Create one short-lived branch per task. Codex-created branches must use the
  `codex/<short-task-name>` naming convention.
- Keep unrelated changes out of the task branch.
- Before pushing, rebase the task branch onto the latest `origin/main`, resolve
  conflicts, and rerun the relevant checks.
- Push the task branch and open a pull request targeting `main`. Do not merge
  the pull request unless the user explicitly asks for it.
- Do not bypass branch protection or required checks. Wait for required CI to
  pass before declaring the pull request ready.
- If a rebased branch was already published, update only that task branch with
  `git push --force-with-lease`; never force-push `main` or another contributor's
  branch.

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
