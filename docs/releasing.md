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
   DSH_LOADOUT_TEST_BINARY="$test_host_dir/node_modules/.bin/dsh" npm --prefix agent-loadout test
   ```

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
DSH_HOME="$smoke_home" npm_config_ignore_workspace_root_check=true \
  dsh plugin --profile web add "$bundle"
jq -e --arg version "$version" '.version == $version' \
  "$smoke_home/profiles/web/node_modules/dsh-agent-loadout/package.json"
DSH_HOME="$smoke_home" dsh web --port 0
```

- Open the DSH-Heros lobby in English, then change the host language to 中文. Check the text and entry points changed in this release in both languages.
- Start a fresh session from the Armory, equip a hero, and complete a real turn using the equipped tools. Check the observed tool calls and the resulting Armory feedback. Change equipment and verify that the conversation resumes with the updated loadout. [Sample files and first-turn task](demo/lighthouse)
- In a separate scratch profile, install the previous published bundle and create a saved loadout and session before upgrading. Use the documented remove-and-add flow for `dsh-agent-loadout` in that profile. Verify that existing loadouts and progression still load and that the saved session can continue.
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

The existing community entry follows the GitHub Latest asset route. A stable release with the same asset filename updates the download used by the existing listing. [Community entry](https://awesome-dsh-plugin.com/p/pearjelly/dsh-heros--agent-loadout/) · [Entry source](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/pearjelly__dsh-heros--agent-loadout.yml)

1. Open the existing listing and confirm that its installer uses the Latest asset URL. Check that the full catalog still has exactly one matching entry and compare the linked download with the release checksum.

   ```sh
   curl -fsSL https://awesome-dsh-plugin.com/plugins.json -o "$release_dir/community-catalog.json"
   jq -e --arg url "$asset_base/latest/download/dsh-heros-bundle.tgz" \
     '[.plugins[] | select(.owner == "pearjelly" and .name == "dsh-heros#agent-loadout")]
      | length == 1 and .[0].tarball == $url and (.[0].install | contains($url))' \
     "$release_dir/community-catalog.json"
   ```

2. Run the listed install command in a fresh scratch profile. Confirm the Armory opens and the installed package reports the released version.
3. If the listing's description, category, or other metadata needs an update, submit a PR that edits the existing YAML entry. Rolling GitHub bundles can have an empty version in the catalog. The separate in-app Discover index includes npm-backed plugins, while this entry is distributed through the website and full catalog. [Contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) · [Discover index builder](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/build-index.mjs)
