# Skyhook npm Publishing & Release Runbook

This guide documents the exact maintainer flow for publishing `skyhook` to npm and creating a GitHub release from a version tag.

## 1) npm package naming and ownership

- Package name: `skyhook` (unscoped public package).
- Ensure you (or your npm organization) are an owner/maintainer of `skyhook` on npm before tagging a release.
- GitHub Actions release workflow publishes with `npm publish --access public --provenance`.

Ownership commands:

```bash
npm login
npm owner ls skyhook
npm owner add <npm-username> skyhook
npm access list packages <npm-username>
```

## 2) Local dry-run checks before tagging

From repository root:

```bash
npm ci
npm run test:release
npm pack --dry-run
npm publish --dry-run
```

`npm run test:release` runs:
- unit verification tests (`npm test`)
- tarball install/CLI smoke test (`npm run test:pack-smoke`)

## 3) Configure npm authentication in GitHub Actions

Preferred: **npm trusted publishing (OIDC)**.

1. In npm package settings for `skyhook`, configure a trusted publisher for this repository and the release workflow.
2. Keep `id-token: write` permission in `.github/workflows/release.yml`.
3. No long-lived npm token is required once trusted publishing is configured correctly.
4. Release workflow will publish with OIDC when `NPM_TOKEN` is not set.

Fallback: **`NPM_TOKEN` secret**

1. Create an npm automation token with publish rights for `skyhook`.
2. Add it as repository secret `NPM_TOKEN`.
3. The release workflow automatically falls back to token-based publish when `NPM_TOKEN` is present.

## 4) Create a release tag

1. Update version:

```bash
npm version patch --no-git-tag-version
```

2. Commit changes to the release branch:

```bash
git add package.json package-lock.json
git commit -m "chore(release): bump version to X.Y.Z"
git push
```

3. Create and push tag matching the version exactly:

```bash
git tag v2.X.X
git push origin v2.X.X
```

The release workflow will fail fast if `package.json` version does not match tag version.

## 5) What the release workflow enforces

On `v*` tag push, `.github/workflows/release.yml` will:

1. Validate tag/version parity (`vX.Y.Z` vs `package.json` `X.Y.Z`)
2. Run verification tests (`npm test`)
3. Run packaged tarball smoke test (`npm run test:pack-smoke`)
4. Refuse duplicate publish if `skyhook@X.Y.Z` already exists on npm
5. Create GitHub release archive (`skyhook-vX.Y.Z.tar.gz`)
6. Publish to npm
7. Create/update GitHub Release notes

## 6) Verify published package

After tag push, watch the **Release** workflow in GitHub Actions. It will fail if the tag/version mismatch check, duplicate-version check, or verification suite fails.

After workflow success:

```bash
npm view skyhook version
npx skyhook --version
npx skyhook-mcp --help
```

Confirm npm shows the tagged version and CLI binaries execute correctly.

## 7) Recovery from failed release

- **If publish step failed and version was not published:** fix issue, re-run workflow (or push corrected tag after deleting/recreating tag as needed).
- **If npm publish already succeeded but later steps failed:** do **not** republish same version (npm blocks this). Fix workflow/docs and publish next patch version (`X.Y.Z+1`) with a new tag.
- **If tag/version mismatch failed:** update `package.json` or recreate the tag so both match exactly.
