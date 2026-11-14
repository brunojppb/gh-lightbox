# Changesets

A changeset is a Markdown file in this folder. It names the version bump and describes one change for the changelog.

Add one to each pull request that changes the extension:

```
npx changeset
```

After a merge to `main`, the release workflow opens a "Version Packages" pull request. A merge of that pull request makes the release: it bumps the version in `package.json` and `extension/manifest.json`, writes `CHANGELOG.md`, pushes the git tag, and creates the GitHub release.
