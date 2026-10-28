# Pinning GitHub Actions

Every `uses:` line in `.github/workflows` follows one of two rules, depending on who publishes the action.

| Publisher | How to reference it | Examples in this repo |
| --- | --- | --- |
| First-party (`actions/*`, maintained by GitHub) | Major version tag | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/github-script@v8` |
| Third-party (everyone else) | Full 40 character commit SHA, with the release in a trailing comment | `wagoid/commitlint-github-action@<sha> # v3.1.4` |

Why the split: a major tag on a third-party repo can be moved by its owner to any commit, and these workflows run with a token that can write to issues and PRs. A SHA cannot be moved. First-party actions are published by GitHub itself, so a major tag is an acceptable trade for getting security patches without a PR each time.

## Current third-party pins

| Action | Version | Used in |
| --- | --- | --- |
| `wagoid/commitlint-github-action` | v3.1.4 | `conventional-commits.yml` |
| `release-drafter/release-drafter` | v6.4.0 | `release-drafter.yml` |
| `dorny/paths-filter` | v3.0.4 | `quality-gates.yml` |

Keep this table in sync when a pin changes.

## Adding a new action

1. Prefer a first-party action or plain `run:` steps. Only add a third-party action if it saves real work.
2. Check the repo: maintained, recent releases, a reasonable number of users, and what permissions the workflow gives it.
3. Look up the SHA of the release tag you want. For an annotated tag use the commit it points to, not the tag object:
   `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (follow `git/tags/<sha>` if the type is `tag`).
4. Write it as `uses: owner/repo@<40 char sha> # vX.Y.Z` and add it to the table above.
5. Give the job the smallest `permissions:` it needs.

## Reviewing an update

Dependabot (`.github/dependabot.yml`) opens a weekly PR when a pinned action has a newer release. For those PRs:

- Read the release notes and the diff between the old and new SHA for anything that touches tokens, network calls or the way inputs are read.
- Check that the new SHA belongs to the release tag named in the comment, and that the comment was updated with it.
- A major version bump needs a look at the changelog for breaking input changes. Run the affected workflow on a branch before merging if inputs changed.
- Update the table above.

Floating tags on third-party actions (`@v3`, `@main`) should not be merged.
