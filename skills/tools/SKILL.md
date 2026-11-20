---
name: tools
description: Manage Logic Fabric (Flowon) projects and Dynamics 365 / Dataverse solutions with the Flowon command-line tools (`flowon-dynamics`, or the Flowon PowerShell module). Use when the user wants to list features or projects, export or import solutions, .flop packages or business data, export or import security (business units, security roles, teams and team roles), generate or apply data mappings, write data-spec files, enable or disable plugins or Logic Recipes, bump solution versions, create, export or merge solution patches, publish Logic APIs, generate OpenAPI schemas or docs, run Logic Fabric test cases through Logic Foundry, or build Azure DevOps / GitHub Actions deployment pipelines for Logic Fabric.
---

# Logic Fabric command-line tools

The Logic Fabric CLI is the `flowon-dynamics` .NET tool from the NuGet package
`Flowon.Xrm.Tools.CommandLine`. It moves Logic Fabric projects (`.flop` packages), Dynamics 365
solutions, security setups, configuration and reference data between Dataverse environments.
The same features are in the Flowon PowerShell module (section 6).

For XML formats (mapping files, data specs, data files, `security.xml`, `.flop` layout), read
[reference.md](reference.md) before you write or edit those files.

## 1. Preflight

Run these checks before the first command in a session:

```bash
flowon-dynamics --version          # is the tool installed, and which version?
dotnet --version                   # needs the .NET 10 SDK or later
```

- Not installed: `dotnet tool install --global Flowon.Xrm.Tools.CommandLine`
- Update: `dotnet tool update --global Flowon.Xrm.Tools.CommandLine`
- Repo-local (CI): `dotnet new tool-manifest`, then `dotnet tool install Flowon.Xrm.Tools.CommandLine`,
  then run `dotnet tool run flowon-dynamics ...`
- **This skill is installed by the tools.** The comment at the top of this file names the tools
  version it came from. If `flowon-dynamics --version` is newer, tell the user to run
  `flowon-dynamics install-skill` (or `install-skill --user`, matching where this copy lives) to
  update the skill, and start a new session after it.
- If a command's options are unclear, run `flowon-dynamics <command> --help`. The installed
  version's help output wins over this file.

## 2. Connection strings and secrets

Every command that talks to Dataverse needs a connection string: `-c, --connection-string`
(`--connectionstring` still works), or the `FLOWON_CONNECTION_STRING` environment variable when
`-c` is left out. Prefer the variable: it keeps the secret out of the command line and the process
list.

```
AuthType=ClientSecret;Url=https://<org>.crm.dynamics.com;ClientId=<id>;ClientSecret=<secret>
```

Rules:
- **Never print, echo, log or commit a connection string or client secret.** Keep it in an
  environment variable (for example `DEV_CONNECTION_STRING`, `UAT_CONNECTION_STRING`,
  `PROD_CONNECTION_STRING`) and pass it as `"$VAR"` (bash) or `"$env:VAR"` (PowerShell), or set
  `FLOWON_CONNECTION_STRING` from it for the command (`FLOWON_CONNECTION_STRING="$UAT_CONNECTION_STRING" flowon-dynamics ...`).
- If no variable is set, ask the user which one to use, or ask them to set it with a
  `! $env:DEV_CONNECTION_STRING = "..."` command in the prompt. Don't ask them to paste the
  secret into chat.
- Before running a command, **say which environment it targets** by naming its host from the
  URL (for example `contoso-uat.crm4.dynamics.com`), without showing the secret.

## 3. Safety: what needs confirmation

| Risk | Commands | Rule |
|------|----------|------|
| Read-only | `features`, `projects`, `export`, `export-security`, `generate-mappings`, `docs`, `generate-openapi`, `install-skill`, `import -sf ... --security-what-if` | Run freely. They write only local files or change nothing. |
| Changes the environment | `import`, `apply-mappings`, `enable-plugins`, `disable-plugins`, `enable-recipe`, `disable-recipe`, `increment-solution-version`, `create-patch`, `publish-api`, `test` (creates its fixture rows and removes them afterwards) | Confirm the target environment and the exact command with the user first, unless they already approved this run. |
| High risk | Any command that changes **production**; `import --override-unmanaged-customizations`; `import --security-mode replace` (can remove or lower role privileges); `import --security-prune` (removes team roles); `merge-patches` (deletes the patches; can't be undone); `disable-plugins` | Always confirm, even if an earlier step was approved. Suggest a backup and a UAT run first. For a security file, run it with `--security-what-if` first and show the user the list of changes. |

After `disable-plugins`, always run `enable-plugins`, **even if the steps in between fail**. If a
failure interrupts the sequence, tell the user plainly that plugins are still disabled.

## 4. Command reference

Most commands also take `-l, --log-level None|Info|Verbose` (default `None`: errors only). Use
`Info` to see progress and `Verbose` when troubleshooting. Every command exits non-zero on failure.

### Discovery
```bash
flowon-dynamics features -c "$CS"      # installed Logic Fabric features and versions  (alias: f)
flowon-dynamics projects -c "$CS"      # projects, with their solutions and prefixes   (alias: p)
```
If the user hasn't named a project, run `projects` and let them pick one.

### Export (alias `e`)
```bash
flowon-dynamics export -c "$CS" \
  -pn "<ProjectName>" \                # --project-name (required; -p still works)
  -o "./artifacts" \                   # --output-directory (required, created if missing)
  [-sm] [-su] \                        # also export the managed / unmanaged solution
  [-sp Latest|All] \                   # --solution-patches, for a solution with patches (needs -sm/-su)
  [-ds "./specs/data-spec.xml"]        # also export reference data defined by a data spec
```
Everything is written straight into the output directory:
- `<ProjectName>.flop`, always. Spaces and characters not allowed in file names become `_`.
- `<SolutionUniqueName>_managed.zip` / `_unmanaged.zip` with `-sm` / `-su`. `-su` isn't possible
  when the solution is managed in that environment. The command prints each solution file's path:
  use those paths, not a guessed name.
- `data.xml` with `-ds`: every entity and relationship in the spec, in one file. Import it with `-d`.

**A solution with patches** (changes made while it has patches go into its latest patch):
- `-sp Latest` (the default) exports only the latest patch, as `<PatchUniqueName>_managed.zip`.
  It imports only where the solution and its earlier patches are installed: use it for the next
  hotfix of an environment that is up to date. The CLI warns about it.
- `-sp All` exports every patch, oldest first, numbered in import order:
  `01_<Patch>_<version>_managed.zip`, `02_<Patch>_<version>_managed.zip`, ... Use it for
  environments that have the solution but may miss earlier patches. Export into an **empty**
  folder and import them together with `-s "./artifacts/*_managed.zip"`.
- Dataverse **does not export the solution itself while it has patches** ("Cannot modify solution
  because it has the following patches"). For an environment without the solution, put the
  solution's file from a build made before its first patch ahead of the patches, or suggest
  `merge-patches` (with the user's confirmation; it can't be undone) and deploy the merged solution.

### Export security (alias `es`)
```bash
flowon-dynamics export-security -c "$CS" \
  -o "./security" \                         # --output-directory (required); writes security.xml
  [--include BusinessUnits Roles Teams TeamRoles] \   # default: everything; TeamRoles implies Teams
  [--role "Sales Manager" "Sales Rep"] \    # only these roles, by name
  [--solution "<SolutionUniqueName>"] \     # only the roles in this solution
  [--team "Sales EMEA"]                     # only these teams, by name
```
- Exports business units, security roles with their privileges, teams and the teams' roles.
  Team members are not exported.
- Roles whose privileges can't be changed, such as System Administrator and the roles of
  Microsoft's solutions, are skipped (one line gives the count; `-l Verbose` lists them). Naming one
  with `--role` fails. Access-team templates and Copilot Studio agent teams are not exported.
- A part left out with `--include` is left alone on import.

### Import (alias `i`)
```bash
flowon-dynamics import -c "$CS" \
  [-s  "./artifacts/*_managed.zip"] \            # --solution-file-path: one or more files, or a wildcard
  [-oc] \                                        # --override-unmanaged-customizations (needs -s)
  [-sf "./security/security.xml"] \              # --security-file-path
  [-d  "./artifacts/data.xml"] \                 # --data-file-path (several allowed)
  [-p  "./artifacts/<Project>.flop"] \           # --package-file-path
  [-m  "./mappings/uat/configuration.datamap.xml" "./mappings/uat/entity.datamap.xml"]   # needs -p
```
- Give at least one of `-s`, `-sf`, `-d` or `-p`. `-s`, `-m` and `-d` take several
  space-separated paths after one flag.
- Within one call the CLI imports in this order: **solution → security → data → package (with
  mappings)**. If a step fails, the later steps are skipped and the command exits non-zero.
- **Solutions:** imported in the order given. A wildcard in the file name is expanded by the CLI
  itself (in every shell) and takes the matching files in name order, which is the order
  `export -sp All` numbers patches. Before anything is imported, each patch is checked: its
  solution must be installed or come earlier in the list, and patches of one solution must come
  oldest first. A managed solution is skipped when the installed
  version is the same or newer, so importing the whole set again only adds what's new. A managed
  file over an installed managed solution is an upgrade. An unmanaged file over an installed
  managed solution is refused.
- **Package:** its solution must already be installed, or be given with `-s` in the same call.
  A package isn't imported into a project of the same name that belongs to another solution.
  The import fails when an artifact couldn't be imported or a record the package no longer has
  couldn't be deleted, and names each failure.
- **Mappings:** applied while the package imports. A map file changes only the entries it lists;
  the package's other entries keep their values.
- **Plugins:** a package import turns off the Flowon plug-in steps that are on, and afterwards
  turns exactly those back on. Steps that were off stay off. You don't need `disable-plugins`
  around an import.

Security options (all need `-sf`):

| Option | Effect |
|--------|--------|
| `--security-mode Merge` (default) | Adds privileges and raises their depth; never removes or lowers any. |
| `--security-mode Replace` | Makes each role's privileges exactly those in the file (Dataverse keeps its SharePoint privileges on every role). **High risk.** |
| `--security-prune` | Removes team roles the file doesn't list for the team. Skipped for a team when one of its roles couldn't be resolved. **High risk.** |
| `--security-what-if` | Lists the changes, and the warnings, without making them. Only with `-sf` and nothing else to import. |
| `--default-team-administrator <domain name or email>` | Administrator for new teams whose own administrator isn't found in the target. Default: the user running the import. |

Business units are matched by path (the root always matches the target's root), roles by id then
name, and teams by name and business unit. Business units are created parents first, then roles,
then teams and their roles. Nothing is deleted except with `--security-prune`. An item that fails
is reported and the others still import; the command then fails and skips the data and package.

### Mappings
```bash
# Extract the map files bundled in a .flop (local only, no connection)        alias: gm
flowon-dynamics generate-mappings -p "./artifacts/<Project>.flop" -o "./mappings/development"

# Apply edited map files to a project already imported in a target env        alias: am
flowon-dynamics apply-mappings -c "$CS" -pn "<ProjectName>" -m "./mappings/production/configuration.datamap.xml"
```
- `generate-mappings` always writes all four: `configuration.datamap.xml`,
  `entity.datamap.xml`, `localizedresources.datamap.xml` and `serviceconnection.datamap.xml`.
- `apply-mappings` takes configuration, localized-resource and service-connection maps. It refuses
  entity maps, which only apply while a package imports (`import -p ... -m ...`). It fails, naming
  each entry, when an entry can't be applied.
- Localized-resource maps written by older versions of the tools have the resource name where the
  language code belongs, and are reported as having no languages. Export the package again and
  regenerate them.

### Plugins and recipes
```bash
flowon-dynamics disable-plugins -c "$CS"     # alias dp
flowon-dynamics enable-plugins  -c "$CS"     # alias ep
flowon-dynamics enable-recipe  -c "$CS" -pn "<Project>" -r "RecipeA" "RecipeB"   # alias er
flowon-dynamics disable-recipe -c "$CS" -pn "<Project>" -r "RecipeA"             # alias dr
```
- `disable-plugins` / `enable-plugins` switch the plug-in steps of the installed Logic Fabric
  features themselves (the steps that check and compile flows, blocks, configuration and the
  like when they're saved), for every project in the environment. Use them around bulk loads of
  Logic Fabric records. They don't touch the steps that run your recipes.
- `enable-recipe` / `disable-recipe` turn individual Logic Recipes on and off. To keep a recipe
  off, use `disable-recipe` rather than deleting its plug-in step.

### Solution versioning
```bash
# alias isv — --part (-v) is the PART to increment, not a number: Major | Minor | Build | Revision
flowon-dynamics increment-solution-version -c "$CS" -sn "<SolutionUniqueName>" --part Minor

# alias cp — -v here IS an explicit version (optional); prints the patch's unique name
flowon-dynamics create-patch -c "$CS" -sn "<SolutionUniqueName>" -pn "<Patch display name>" [-v 1.0.1.0]

# alias mp — rolls all patches into a new version of the solution and deletes them. CAN'T BE UNDONE.
flowon-dynamics merge-patches -c "$CS" -sn "<SolutionUniqueName>" [-v 1.3.0.0] [--display-name "<name>"]
```
- `--part Minor` on `1.2.3.4` gives `1.3.3.4`: only that part changes.
- A patch version must keep the solution's major and minor parts; it defaults to the next build
  number.
- `merge-patches` runs in the development environment, where the solution is unmanaged. The merged
  version must raise the major or minor part, and defaults to the next minor version
  (`1.2.0.0` gives `1.3.0.0`). Export the solution again afterwards.

### Logic API lifecycle
```bash
# alias pa — publishes the current DRAFT as a new Major (default) or Minor version; prints it
flowon-dynamics publish-api -c "$CS" -pn "<Project>" -a "<ApiName>" --kind Major|Minor

# alias openapi — writes <ApiName>.json (spaces and unsafe characters → underscores); latest
# published version if -v is omitted, or -v draft for the draft
flowon-dynamics generate-openapi -c "$CS" -pn "<Project>" -a "<ApiName>" -o "./docs" [-v 2.1]
```
- `publish-api` fails when the API is not in the project, and when no new version appears (the
  publish runs in a Flowon plug-in: check the plug-ins are enabled). No draft: nothing is
  published, and it says so.

### Tests (through Logic Foundry)
```bash
# Runs the test case files a change's tests/ folder holds, through Foundry's test tool, so a pipeline
# runs the same tests Claude ran during the build. Exits non-zero when a case fails.
flowon-dynamics test --foundry-url "https://<foundry host>/mcp" --project "<Project>"   --tests "./logic-fabric/changes/<change>/tests" [--workspace ./logic-fabric/workspace.yaml]   [--token-variable FOUNDRY_TOKEN] [--junit ./test-results.xml]
```
- It talks to Foundry, not to Dataverse, so it takes no connection string. The bearer token for
  Foundry comes from the environment variable named by `--token-variable` (default `FOUNDRY_TOKEN`).
- `--workspace` supplies the personas (users the cases run as); without it, every case runs as the
  Foundry's own identity.
- `--tests` takes files or folders (`*.yaml`, `*.yml`, `*.json`; several are allowed).
- Cases marked `retired:` (what they test was removed by a later change) are reported as skipped,
  in the JUnit file too, and don't fail the run.
- The test format is in the `testing` skill of the Logic Fabric for Dataverse plugin.

### Documentation (alias `d`, local only)
```bash
flowon-dynamics docs -p "./artifacts/<Project>.flop" -o "./docs"    # writes <Project>_docs.zip
```

### Skill (alias `is`, local only)
```bash
flowon-dynamics install-skill                # into ./.claude/skills/logic-fabric, shared with the repo
flowon-dynamics install-skill --user         # into ~/.claude/skills/logic-fabric, for all projects
flowon-dynamics install-skill -d <repo root> # into another project
```
It replaces files it installed earlier. It refuses files it didn't install, such as a copy edited
by hand, unless `--force` is given.

## 5. Workflows

### Export for source control
1. Run `projects` to confirm the project name.
2. Run `export` with `-sm -su`, plus `-ds` if the repo has a `specs/data-spec.xml`.
3. Show the user what changed (`git status` / `git diff --stat`). Don't commit unless they ask.

### Set up environment mappings (first time)
1. Export the `.flop`.
2. Run `generate-mappings` into `mappings/development/`.
3. Copy it to `mappings/uat/` and `mappings/production/`, then edit only the `<Target>` values in
   each copy (see [reference.md](reference.md)). Delete entries that don't change for an
   environment; the package's own values are kept for them.
4. Keep real credentials out of committed service-connection maps. Tell the user to inject them at
   pipeline time or store them in a secret store.

### Deploy to an environment
Confirm the target first (section 3), then run one `import`:
```bash
flowon-dynamics import -c "$CS" -l Info \
  -s "./artifacts/*_managed.zip" \
  -sf "./security/security.xml" \
  -d "./artifacts/data.xml" \
  -p "./artifacts/<Project>.flop" \
  -m "./mappings/<env>/configuration.datamap.xml" "./mappings/<env>/entity.datamap.xml" \
     "./mappings/<env>/localizedresources.datamap.xml" "./mappings/<env>/serviceconnection.datamap.xml"
```
Include only the files that exist for that environment. The wildcard takes the single solution
file, or the numbered patches from `export -sp All`; the export folder must hold only the files of
this build. Deploy to UAT before production, and use managed solutions in every
environment except development.

### Move security to another environment
1. In the source environment, run `export-security -o ./security`. Narrow it with `--solution`,
   `--role` or `--team` when the user only wants part of it.
2. Show the user a summary of `security.xml` (business units, roles, teams), and commit it if they
   want it in source control.
3. Against the target, run `import -sf ./security/security.xml --security-what-if -l Info` and
   show the user the list of changes.
4. After the user confirms, run the import without `--security-what-if`. Add
   `--security-mode Replace` or `--security-prune` only if the user asks for them.
5. When the security file is part of a deployment, put `-sf` in the same `import` call as the
   solution, data and package. Data files can then refer to the new business units and teams.

### Release version bump / hotfix
- Feature release: `increment-solution-version -v Minor` in development, then export.
- Hotfix: `create-patch` on the solution, make the fix, then `export -sm` (the default, latest
  patch) and import the patch file into environments that are up to date.
- Environment that missed earlier patches: `export -sm -sp All` into an empty folder, then
  `import -s "<folder>/*_managed.zip"`.
- New environment while patches exist: Dataverse won't export the solution itself. Use the
  solution's file from a build made before the first patch, followed by the patches
  (`import -s "<base>/<Solution>_managed.zip" "<folder>/*_managed.zip"`), or merge the patches first.
- End of a hotfix cycle: with the user's confirmation, `merge-patches` in development, then
  export and deploy the merged solution as usual. Environments that have the patches upgrade
  normally.

### Business data
Write or extend `specs/data-spec.xml` (format and `importBehavior` rules in
[reference.md](reference.md)). Export it with `-ds` and import the resulting `data.xml` with `-d`.
Version-control reference data only (statuses, templates, countries), not transactional data.
- Records are matched by their primary name, so names must be unique. A name shared by several
  records in the target fails the import.
- A lookup whose record isn't found **fails the import by default**. Set `importBehavior` on the
  column to skip the record, clear the lookup or create the referenced record instead.
- Data files carry lookups (including customer and regarding lookups, with their table), owner
  columns (`ownerid`), multi-select choice columns, N:N relationships, and pre- and post-import
  commands that turn plug-in steps off during the import.

### CI/CD pipelines
When asked for a pipeline, generate Azure DevOps (`azure-pipelines.yml`) or GitHub Actions
(`.github/workflows/deploy.yml`). Structure it as:
- Build stage: set up .NET `10.0.x`, install the tool, run `export` to an empty staging directory
  (with `-sp All` if targets may miss earlier patches), then publish the artifact. Keep the
  artifact of the last build before a solution's first patch: it is the only full solution file
  until the patches are merged.
- One deploy stage per environment (for example UAT from a develop branch and production from
  the main branch). Each one installs the tool and runs one `import` with that environment's
  files. Don't wrap it in `disable-plugins` / `enable-plugins`; the import handles plug-in steps.
- Connection strings come from secret variables: a variable group or secure pipeline variables in
  Azure DevOps, or repository/environment secrets in GitHub. Ask the user what theirs are called
  rather than inventing names. Keep the project and solution names in non-secret variables.
- Add an approval gate on the production environment.
- When the repository holds Logic Fabric test cases, add a test step after the import into a test
  environment: `flowon-dynamics test ... --junit test-results.xml`, then publish the JUnit file
  (`PublishTestResults@2` in Azure DevOps). The Foundry token is a secret variable too.

## 6. PowerShell module

The Flowon PowerShell module (version 3, PowerShell 7.6 or later) has the same commands. Its
parameters are named like the CLI's long options (`-ConnectionString`, `-ProjectName`,
`-OutputDirectory`, ...). The names before version 3 (`Test-…CmdletCommand`) still work as aliases.

| CLI | Cmdlet |
|-----|--------|
| `projects` / `features` | `Get-FlowonProject` / `Get-FlowonFeature` (one object per item) |
| `export` / `import` | `Export-FlowonProject -ExportManagedSolution` (switches; `-SolutionPatches Latest` or `All`; returns the package file) / `Import-FlowonProject` (`-SolutionFilePath` takes several files or a wildcard; returns what was imported) |
| `export-security` | `Export-FlowonSecurity` (returns `security.xml`) |
| `generate-mappings` / `apply-mappings` | `Export-FlowonDataMap` / `Import-FlowonDataMap` |
| `generate-openapi` / `docs` | `Export-FlowonOpenApiSchema` (runs `flowon-dynamics`, which must be installed) / `Export-FlowonDocumentation` |
| `enable-plugins` / `disable-plugins` | `Enable-FlowonPlugin` / `Disable-FlowonPlugin` |
| `enable-recipe` / `disable-recipe` | `Enable-FlowonLogicRecipe` / `Disable-FlowonLogicRecipe` (one error per failing recipe) |
| `increment-solution-version` / `create-patch` / `merge-patches` | `Step-FlowonSolutionVersion` / `New-FlowonSolutionPatch` / `Merge-FlowonSolutionPatch` (asks for confirmation; `-Confirm:$false` in scripts) |
| `publish-api` | `Publish-FlowonApi` (returns the new version) |
| `install-skill` | `Install-FlowonSkill [-User] [-ProjectDirectory <path>] [-Force]` |

- Cmdlets that change an environment support `-WhatIf` and `-Confirm`. `Import-FlowonProject -WhatIf`
  with only `-SecurityFilePath` lists the security changes.
- Paths are relative to the current PowerShell location. Progress goes to the information stream
  (hide it with `6>$null`); `-Verbose` shows the details.
- Run `Get-Help <cmdlet> -Detailed` for the parameters. The safety rules in section 3 apply to them
  in the same way.

## 7. Shell notes (Windows)

The examples use bash `\` line continuation. In PowerShell, end the line with a backtick `` ` ``
or put the command on one line. Reference variables as `$env:NAME`. Keep multi-value flags
(`-m a b`, `-r x y`) as separate quoted arguments.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Data import: "Unable to resolve reference to entity 'X' with name 'Y'" | The lookup's record doesn't exist in the target; an unresolved lookup fails by default | Import the referenced data first, or set `importBehavior` on the column |
| Data import: "More than one 'X' record is named 'Y'" | Records are matched by name, and the target has duplicates | Rename or remove the duplicates in the target |
| Data spec: "... is of type X, which data files cannot carry" | The column type isn't supported (for example image or file) | Remove the column from the spec |
| Package import fails naming records that "could not be deleted" or artifacts that were skipped | Stale records couldn't be removed, or an artifact's flow or event definition is missing | Fix the named records in the target, then rerun |
| Solution import: "'X' is a patch of solution 'Y', which is not installed" | A patch file was given without its solution, for a target that doesn't have it | Give the solution's file from a build before its first patch ahead of the patches, or merge the patches (with confirmation) and deploy the merged solution |
| Solution import: "Patch 'X' comes before 'Y'" (the solution it patches, or an older patch) | The files were given in the wrong order | Give the solution first and patches oldest first, or use the wildcard on the numbered files |
| Export: "Cannot modify solution because it has the following patches" | Dataverse doesn't export a solution while it has patches | Export the patches (`-sp Latest` or `All`), or with the user's confirmation `merge-patches` in development, then export again |
| `merge-patches`: "its major or minor part must be higher" | The given version doesn't raise the major or minor part | Leave `-v` out (next minor version) or give one such as `1.3.0.0` |
| A package's records refer to the wrong records in the target | Record IDs differ per environment | Add entries to the entity map, or set `importBehavior` in the data spec |
| `apply-mappings` refuses a map | It's an entity map | Pass it to `import -p ... -m ...` instead |
| Localized map entry "has no languages" | The map came from an older version that wrote the resource name as `lcid` | Export the package again and regenerate the maps |
| Localized text missing | `lcid` isn't a language code | Use language codes such as `1033` in the localized-resource map |
| "an earlier upgrade of solution 'X' was not finished, and its holding solution 'X_Upgrade' is still installed" | An earlier managed upgrade didn't finish | In the target, apply it (Solutions > Apply solution upgrade) or delete `X_Upgrade`, then rerun |
| Security import reports items that failed | One role, team or business unit couldn't be written; the others were imported | Fix the named items and rerun (the import is safe to repeat). The data and package after it weren't imported |
| Flows, blocks or configuration saved after a bulk load aren't checked or compiled | `disable-plugins` wasn't reversed | Run `enable-plugins` |
| Wrong URLs or flags in the target | Configuration map `<Target>` not edited | Fix the configuration map and rerun `apply-mappings` |
| Service connection authentication fails | Wrong target credentials | Update the service-connection map's `<Target>` security scheme |
| Map files rejected | `-m` given without `-p` | Add `--package-file-path` |
| `export` fails with "An existing connection was forcibly closed" | Temporary network drop, often during a solution export | Retry the export |
| `export` fails on an event handler, localized resource or process version with a JSON or type error | That record's stored definition is invalid or incomplete (for example an empty process draft, or a localized value that isn't JSON keyed by language code) | Open the named record in the designer and fix, complete or delete it |

Rerun the failing command with `-l Verbose`. Capture the output to a log file outside the repo,
and check that the log doesn't contain secrets before you show it.
