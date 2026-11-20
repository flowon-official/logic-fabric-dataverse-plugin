# Logic Fabric file formats

## Repository layout (recommended)

```
my-project/
├── specs/data-spec.xml
├── security/security.xml   # from export-security
├── mappings/
│   ├── development/  uat/  production/
│   │   ├── configuration.datamap.xml
│   │   ├── entity.datamap.xml
│   │   ├── localizedresources.datamap.xml
│   │   └── serviceconnection.datamap.xml
├── artifacts/            # export output, usually gitignored
│   ├── <Project>.flop  <Solution>_managed.zip  <Solution>_unmanaged.zip  data.xml
│   │   (with -sp All: 01_<Patch>_<version>_managed.zip, 02_<Patch>_<version>_managed.zip, ...)
├── azure-pipelines.yml | .github/workflows/deploy.yml
```

## Mapping files

Every map is XML with `<Source>` (the value in the exported environment) and `<Target>`
(the value in the destination). When you create a per-environment copy, **edit only
`<Target>`**. Leave `<Source>` exactly as it was generated.

### Configuration map (`type="Configuration"`)
```xml
<?xml version="1.0" encoding="utf-16"?>
<Map type="Configuration">
  <Configuration name="PaymentGateway_BaseUrl" type="1">
    <Source>https://sandbox.payment-gateway.com/api/v1/</Source>
    <Target>https://api.payment-gateway.com/api/v1/</Target>
  </Configuration>
</Map>
```
`type` values: `1` String, `2` Integer, `3` Decimal, `4` Boolean, `5` DateTime, `6` Float, `7` Money (currency).

### Entity map (`type="Entity"`): GUIDs that differ per environment
```xml
<Map type="Entity">
  <Entity logicalName="role" primaryNameAttribute="name">
    <Record>
      <Source name="Sales Manager" id="d4e5f6a7-...-000000000002" />
      <Target name="Sales Manager" id="a7b8c9d0-...-222222222222" />
    </Record>
  </Entity>
</Map>
```
To fill in target IDs, look up the matching record by name in the target environment.
Common candidates are security roles, business units, teams, status and lookup records, and
templates.

A record whose source was deleted before export is written with `missing="true"`. Import
leaves it alone. Maps from older CLIs that named such records "Unresolved" are treated the
same way.

When a map file is passed with `import -m`, only the entries it lists are changed. For entity
maps, records are matched by `Source/@id`.

### Localized resource map (`type="LocalizedResource"`)
```xml
<Map type="LocalizedResource">
  <LocalizedResource name="Action_Submit">
    <Locale lcid="1033"><Source>Submit</Source><Target>Submit</Target></Locale>
    <Locale lcid="1025"><Source>تقديم</Source><Target>تقديم</Target></Locale>
  </LocalizedResource>
</Map>
```
Common LCIDs: 1033 English (US), 1025 Arabic. `lcid` must be the language code. Older CLIs
wrote the resource name there; regenerate such maps from a fresh export. Languages the map
leaves out keep the package's value.

### Service connection map (`type="ServiceConnection"`)
```xml
<Map type="ServiceConnection">
  <ServiceConnection name="PaymentGateway_API" type="1">
    <Source>
      <Url>https://sandbox.example.com/api/v2/</Url>
      <OpenApiSpecs>...</OpenApiSpecs>
      <SecuritySchemes>
        <SecurityScheme name="API Key" type="ApiKey">
          <type>1</type><name>API Key</name><key>X-API-Key</key>
          <value>...</value><location>Header</location>
        </SecurityScheme>
      </SecuritySchemes>
    </Source>
    <Target> <!-- same shape, destination values --> </Target>
  </ServiceConnection>
</Map>
```
Security scheme `<type>` values: `1` API key (`key`, `value`, `location` `Header` or `Query`),
`2` HTTP (`<scheme>Basic</scheme>` with `username` and `password`, or a bearer token), `3` OAuth2,
`4` OpenID Connect. The `type` attribute repeats it by name. These files hold credentials. Don't
commit production values; use placeholders and substitute them in the pipeline. Values with `&`
or `<` are written escaped, as XML requires.

## Data specification (`--data-spec-file-path`)

```xml
<?xml version="1.0" encoding="utf-16"?>
<DataSpecs>
  <PreImport>                                   <!-- optional; runs before any record -->
    <Command name="disable-step"><StepName>My plugin step</StepName></Command>
  </PreImport>
  <Entities>
    <Entity logicalName="crm_documenttype" exportBehavior="DetectDuplicates">
      <Columns>
        <Column name="crm_name" />              <!-- the primary name column is required -->
        <Column name="crm_maxfilesize" />
        <Column name="crm_category" importBehavior="CreateIfNotExists" />
        <Column name="ownerid" importBehavior="SetToNullIfNotExists" />
        <Column name="crm_channels" />          <!-- multi-select choice -->
      </Columns>
      <PreImport>...</PreImport>                <!-- optional, per entity -->
      <PostImport>...</PostImport>
    </Entity>
    <Entity logicalName="account" viewName="Active Accounts">   <!-- records from a view -->
      <Columns><Column name="name" /><Column name="parentaccountid" /></Columns>
    </Entity>
    <Entity logicalName="contact">
      <fetch><entity name="contact"><filter><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>
      <Columns><Column name="fullname" /><Column name="parentcustomerid" /></Columns>
    </Entity>
  </Entities>
  <Relationships>                                <!-- optional, N:N -->
    <Relationship name="teamroles_association" first="team" second="role" />
    <Relationship name="systemuserroles_association" first="systemuser" second="role" importBehavior="SkipMissing" />
  </Relationships>
  <PostImport>
    <Command name="enable-step"><StepName>My plugin step</StepName></Command>
  </PostImport>
</DataSpecs>
```

- Records are matched by their **primary name** (trimmed, ignoring case), so names must be
  unique. A name shared by several records in the target fails the import.
- `viewName` or `<fetch>` chooses which records to export. Every column the spec lists is
  selected even if the view or query doesn't select it.
- `exportBehavior`: `IgnoreDuplicates` exports the first record of each name; `DetectDuplicates`
  fails the export on a duplicate name. If you omit it, duplicates are exported with a warning, and
  import then refuses the file. A record without a name is exported with a warning too.
- A relationship's links name both records. By default a link whose record is not in the target
  fails the import; `importBehavior="SkipMissing"` on the `<Relationship>` skips it with a warning
  (for example, user–role links for users the target doesn't have).
- Commands: `disable-step` / `enable-step`, with `<StepName>` and optional
  `<ContinueOnError>true</ContinueOnError>`. They change every plugin step with that name.
  Post-import commands always run, even when records fail.
- Records referring to other records of the same table (parent account) are imported parents
  first. Across tables, list entities in dependency order.
- Comments are allowed in spec and data files.

Supported column types: text, whole and big whole numbers, decimal, float, currency, yes/no,
choice, **multi-select choice**, date and time, unique identifier, lookups (including customer
and regarding lookups) and **owner** (`ownerid`). Other types, such as image and file, are
rejected with an error naming the column and its type.

`importBehavior` controls what happens on **lookup and owner columns** when the referenced
record is missing in the target:

| Behavior | If the referenced record is missing | Use for |
|----------|-------------------------------------|---------|
| *(omitted)* = `FailIfNotExists` | Fail the import, naming the record | Default |
| `CreateIfNotExists` | Create it with just its name (not allowed for owner columns) | Simple reference data |
| `SkipRecordImportIfNotExists` | Skip the **whole record**; counted as skipped | Children that are meaningless without the parent |
| `SetToNullIfNotExists` | Import the record with the lookup cleared | Optional relationships |

Owners are found by full name (users) or name (teams). The record itself is always upserted:
it is updated if a record with its name exists, and created if not. A lookup to a table the tools
don't know can't be looked up by name: when its record is missing, `SetToNullIfNotExists` and
`SkipRecordImportIfNotExists` apply, and otherwise the import fails naming the column.

Line breaks in values are kept exactly. Characters XML 1.0 can't hold (such as control characters
pasted from Word) are removed on export, with a warning naming the record.

## Extracted data file (output of `export -ds`, input to `import -d`)

`export -ds` writes one `data.xml` to the output directory. It contains a copy of the spec and
every entity's and relationship's records:

```xml
<?xml version="1.0" encoding="utf-16"?>
<Data>
  <DataSpecs> <!-- copy of the spec's PreImport, Entities, Relationships, PostImport --> </DataSpecs>
  <Entities>
    <Entity logicalName="account">
      <Records>
        <Record>
          <name>Contoso</name>
          <parentaccountid><Id>…</Id><Name>Contoso Group</Name><LogicalName>account</LogicalName></parentaccountid>
          <ownerid><Id>…</Id><Name>Sales</Name><LogicalName>team</LogicalName></ownerid>
          <crm_channels><Value>1</Value><Value>3</Value></crm_channels>
          <createdon>2026-11-18T14:05:00.000Z</createdon>
        </Record>
      </Records>
    </Entity>
  </Entities>
  <Relationships>
    <Relationship name="teamroles_association" first="team" second="role">
      <Records><Record><First>Sales</First><Second>Salesperson</Second></Record></Records>
    </Relationship>
  </Relationships>
</Data>
```
- An empty element (`<crm_channels />`) clears the column in the target.
- Dates are UTC with a 24-hour clock. Numbers use invariant culture (`12.5`).
- A value that doesn't parse fails the import, naming the column.
- A lookup without `<LogicalName>` (older files) uses the lookup's first target table. An owner
  without it is treated as a user.

## Security file (output of `export-security`, input to `import -sf`)

UTF-8 XML, written in a fixed order so that it diffs cleanly:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Security version="1">
  <BusinessUnits>
    <BusinessUnit path="/" />                          <!-- the root; matches the target's root -->
    <BusinessUnit path="/Sales" name="Sales" />
    <BusinessUnit path="/Sales/EMEA" name="EMEA" disabled="true"><Description>…</Description></BusinessUnit>
  </BusinessUnits>
  <Roles>
    <Role id="…" name="Salesperson" inheritance="DirectAndTeam">   <!-- or TeamOnly -->
      <Privileges>
        <Privilege name="prvReadAccount" depth="Deep" />   <!-- Basic | Local | Deep | Global -->
      </Privileges>
    </Role>
  </Roles>
  <Teams rolesIncluded="true">
    <Team name="Sales EMEA" businessUnit="/Sales/EMEA" type="Owner" administrator="admin@contoso.com">
      <Roles><Role id="…" name="Salesperson" /></Roles>
    </Team>
    <Team default="true" businessUnit="/Sales">       <!-- a business unit's default team, listed only when it has roles -->
      <Roles><Role name="Salesperson" /></Roles>
    </Team>
  </Teams>
</Security>
```
- Paths start at `/` (the root). A `/` or `\` inside a business unit's name is written `\/` or `\\`.
- Team `type` is `Owner`, `Access` or `AadSecurityGroup`. Microsoft Entra ID group teams also
  carry `aadObjectId` and `membership`, and are matched by the group.
- Only root roles are listed (Dataverse copies them to each business unit). A team is given
  the copy of each role in its own business unit.
- Without `rolesIncluded="true"`, team roles are left alone on import.
- Don't hand-edit `id` values. To add a role or privilege, export it from an environment that
  has it.

## .flop package layout

```
<Project>.flop/
├── Api/       flwn_api/, flwn_apiversion/
├── Logic/     flwn_configuration/, flwn_eventdefinition/, flwn_eventhandler/,
│              flwn_localizedresource/, flwn_logicblock/, flwn_logicflow/,
│              flwn_logicrecipe/, flwn_schedule/, flwn_serviceconnection/
├── Mappings/  configuration / entity / localizedresources / serviceconnection .datamap.xml
├── Process/   flwn_businessprocess/, flwn_businessprocessversion/
└── manifest.xml
```
Each record is stored at `<entity>/<guid>/data.xml`. `manifest.xml` holds `ProjectName`,
`SolutionName`, `SolutionUniqueName`, `SolutionPrefix` and optionally `Title` and `Description`.
Read `SolutionUniqueName` from the manifest when a command needs the solution name
(`increment-solution-version -s`, `create-patch -sn`).

## Service account

The user in the connection string must be able to export or import solutions and read and write
the Logic Fabric records of the project. System Administrator is the simplest choice, and
importing a security file (business units, roles and teams) usually needs it. If the user wants a
narrower role, help them test it in a non-production environment first.
