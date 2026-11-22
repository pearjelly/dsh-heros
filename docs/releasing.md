# Releasing DSH-Heros

Run releases from the repository root with Node, npm, `jq`, and an authenticated GitHub CLI. Use the same shell for the command blocks below. The package stays named `dsh-agent-loadout` and the public bundle stays named `dsh-heros-bundle.tgz`.

## Prepare and test the release

1. Update `version` in [agent-loadout/package.json](../agent-loadout/package.json) and the pinned bundle install links in [README.md](../README.md) and [README.zh.md](../README.zh.md). Keep video links on the tags that host the referenced files.
2. Prepare bilingual notes covering the change users can try, the tested DSH versions, the install link, and any upgrade steps. Save the notes as `release-notes.md` in the release folder created below.
3. Run the full regression suite on the default supported Web CLI. Test the changed workflows on the bundled Desktop CLI and on any versions added to `engines.dsh`. Check the current upstream version when deciding whether to expand the range. [DeepSeek Harness releases](https://github.com/deepseek-ai/deepseek-harness/releases)

   ```sh
   host_version=0.2.1-rc.5
   test_host_dir=$(mktemp -d)
   npm install --prefix "$test_host_dir" --no-save "@deepseek-ai/dsh@$host_version"
   npm_config_cache_dir="$test_host_dir/pnpm-metadata" \
     XDG_CACHE_HOME="$test_host_dir/cache" \
     DSH_LOADOUT_TEST_BINARY="$test_host_dir/node_modules/.bin/dsh" npm --prefix agent-loadout test
   ```

   Use a fresh cache directory for each suite run. The local test registry uses temporary ports that the operating system can reuse.

4. Commit the release changes on `main`. Build from that exact commit so local edits and untracked files stay out of the package.

## Build and inspect the bundle

```sh
set -eu
repo=pearjelly/dsh-heros
commit=$(git rev-parse main)
release_dir=$(mktemp -d)
git archive "$commit" agent-loadout | tar -x -C "$release_dir"
package_dir="$release_dir/agent-loadout"
version=$(jq -er '.version' "$package_dir/package.json")
tag="v$version"
bundle="$release_dir/dsh-heros-bundle.tgz"

(cd "$package_dir" && npm pack --ignore-scripts --dry-run --json) > "$release_dir/pack-plan.json"
(cd "$package_dir" && npm pack --ignore-scripts --json --pack-destination "$release_dir") > "$release_dir/pack-result.json"
mv "$release_dir/$(jq -er '.[0].filename' "$release_dir/pack-result.json")" "$bundle"

jq -r '.[0].files[].path | "package/" + .' "$release_dir/pack-plan.json" |
  LC_ALL=C sort > "$release_dir/planned-files.txt"
tar -tzf "$bundle" | LC_ALL=C sort > "$release_dir/archive-files.txt"
diff -u "$release_dir/planned-files.txt" "$release_dir/archive-files.txt"
tar -xOzf "$bundle" package/package.json |
  jq -e --arg version "$version" '.name == "dsh-agent-loadout" and .version == $version'

for entry in index.js client.js cordis.patch.yml locale/en.json locale/zh.json art/icon.png; do
  tar -xOzf "$bundle" "package/$entry" > /dev/null
done
(cd "$release_dir" && shasum -a 256 dsh-heros-bundle.tgz > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
```

Review `archive-files.txt` against the package manifest's `files` allowlist. Confirm that newly imported runtime modules and assets are present. Keep tests, fixtures, and repository-only assets outside the install bundle.

## Smoke-test the packed release

Use scratch profiles and the same CLI that users run. `DSH_HOME` is scoped to these commands, so they can run alongside an existing installation.

```sh
smoke_home=$(mktemp -d)
DSH_HOME="$smoke_home" dsh plugin --profile web add -w "$bundle"
jq -e --arg version "$version" '.version == $version' \
  "$smoke_home/profiles/web/node_modules/dsh-agent-loadout/package.json"
DSH_HOME="$smoke_home" dsh web --port 0
```

- Open the DSH-Heros lobby in English, then change the host language to 中文. Check the text and entry points changed in this release in both languages.
- Start a fresh session from the Armory, equip a hero, and complete a real turn using the equipped tools. Check the observed tool calls and the resulting Armory feedback. Change equipment and verify that the conversation resumes with the updated loadout. [Sample files and first-turn task](demo/lighthouse)
- In a separate scratch profile, install the previous tagged bundle and create a saved loadout and session before upgrading. Keep the same pnpm store for both installs. Use the documented remove-and-add flow for `dsh-agent-loadout` in that profile with the new bundle or its tagged URL. Verify the installed version in `profiles/web/node_modules/dsh-agent-loadout/package.json`, then check that the saved loadout, progression, and session are still usable.
- Repeat the core check in the desktop app using its matching bundled CLI and the `desktop` profile. Record the host versions and smoke results with the release notes.

## Publish on GitHub

Add the prepared `release-notes.md` to `$release_dir`. Push the tested source and create a draft from a tag that points to the packaged commit.

```sh
git push origin main
git tag -a "$tag" "$commit" -m "DSH-Heros $tag"
git push origin "refs/tags/$tag"

gh release create "$tag" "$bundle" "$release_dir/SHA256SUMS" \
  --repo "$repo" --verify-tag --draft --title "DSH-Heros $tag" \
  --notes-file "$release_dir/release-notes.md"
gh release download "$tag" --repo "$repo" --dir "$release_dir/draft" \
  --pattern dsh-heros-bundle.tgz --pattern SHA256SUMS
(cd "$release_dir/draft" && shasum -a 256 -c "$release_dir/SHA256SUMS")
cmp "$release_dir/SHA256SUMS" "$release_dir/draft/SHA256SUMS"
gh release edit "$tag" --repo "$repo" --draft=false --latest
```

If GitHub cannot look up the draft by tag, list releases with the authenticated CLI and find the draft for the exact tag. Download its two assets by ID with `gh api -H 'Accept: application/octet-stream' "repos/$repo/releases/assets/$asset_id"`. Run the same checksum and manifest comparisons on the downloaded bytes, then publish that draft. [GitHub release assets API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)

Check that the public release is marked Latest and that both public asset routes serve the tested bytes. [GitHub CLI release commands](https://cli.github.com/manual/gh_release)

```sh
asset_base="https://github.com/$repo/releases"
gh release view --repo "$repo" --json tagName,isDraft,isPrerelease |
  jq -e --arg tag "$tag" '.tagName == $tag and .isDraft == false and .isPrerelease == false'
mkdir "$release_dir/tagged" "$release_dir/latest"
curl -fsSL "$asset_base/download/$tag/dsh-heros-bundle.tgz" \
  -o "$release_dir/tagged/dsh-heros-bundle.tgz"
curl -fsSL "$asset_base/latest/download/dsh-heros-bundle.tgz" \
  -o "$release_dir/latest/dsh-heros-bundle.tgz"
(cd "$release_dir/tagged" && shasum -a 256 -c "$release_dir/SHA256SUMS")
(cd "$release_dir/latest" && shasum -a 256 -c "$release_dir/SHA256SUMS")
```

## Verify the DeepSeek Harness community listing

Update the existing community entry to the tagged bundle URL after publication. An install against a reused pnpm store can retrieve the old version of a rolling URL. A release-specific URL gives each bundle its own cache key. [Community entry](https://awesome-dsh-plugin.com/p/pearjelly/dsh-heros--agent-loadout/) · [Entry source](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/pearjelly__dsh-heros--agent-loadout.yml)

1. Prepare the `tarball` change in the existing listing to `$asset_base/download/$tag/dsh-heros-bundle.tgz`. Run the community submission checker against the previous entry to verify the repository and plugin manifest. Verify the published bundle with the checksum from the GitHub release step. If the listing's version PR is still open, let its current check finish before pushing the new pin. A push to the same PR cancels the running check. Update the PR and confirm that the next check is attached to the new commit.

2. Report GitHub publication and the community update separately. A catalog that still points to a rolling or older tagged URL is pending for this release, even if the rolling asset currently downloads the new bytes. While pending, direct users to the verified tagged install command in the README. After merge and site rebuild, verify that the full catalog still has exactly one matching entry and that the pinned URL serves the release checksum.

   ```sh
   curl --compressed -fsSL https://awesome-dsh-plugin.com/plugins.json -o "$release_dir/community-catalog.json"
   jq -e --arg url "$asset_base/download/$tag/dsh-heros-bundle.tgz" \
     '[.plugins[] | select(.owner == "pearjelly" and .name == "dsh-heros#agent-loadout")]
      | length == 1 and .[0].tarball == $url and (.[0].install | contains($url))' \
     "$release_dir/community-catalog.json"
   ```

3. Run the listed install command in a fresh scratch profile. If pnpm reports `ERR_PNPM_ADDING_TO_ROOT`, add `-w` after `add` in the listed command. Confirm the lobby opens and the installed package reports the released version.
4. Edit the existing entry when its description or other metadata needs a change. The separate in-app Discover index includes npm-backed plugins. This bundle is distributed through the community website and full catalog. [Contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) · [Discover index builder](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/build-index.mjs)
