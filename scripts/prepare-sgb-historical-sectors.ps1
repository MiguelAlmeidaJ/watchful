param(
  [Parameter(Mandatory = $true)][string]$Archive,
  [Parameter(Mandatory = $true)][Guid]$MunicipalityId,
  [Parameter(Mandatory = $true)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-Entry($Zip, [string]$Extension) {
  $matches = @($Zip.Entries | Where-Object { $_.Name.EndsWith($Extension, [StringComparison]::OrdinalIgnoreCase) })
  if ($matches.Count -ne 1 -or $matches[0].Length -gt 5000000) {
    throw "O pacote deve conter um único arquivo $Extension com até 5 MB."
  }
  $matches[0]
}

function Copy-Entry($Entry) {
  $stream = $Entry.Open()
  $copy = [IO.MemoryStream]::new()
  try { $stream.CopyTo($copy) } finally { $stream.Dispose() }
  $copy.Position = 0
  Write-Output -NoEnumerate $copy
}

$archivePath = (Resolve-Path -LiteralPath $Archive).ProviderPath
$digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $dbf = Copy-Entry (Get-Entry $zip '.dbf')
  $kmz = Copy-Entry (Get-Entry $zip '.kmz')
} finally { $zip.Dispose() }

try { $bytes = $dbf.ToArray() } finally { $dbf.Dispose() }
$encoding = [Text.Encoding]::GetEncoding(1252)
$rows = [BitConverter]::ToUInt32($bytes, 4)
$header = [BitConverter]::ToUInt16($bytes, 8)
$rowSize = [BitConverter]::ToUInt16($bytes, 10)
if ($header -lt 33 -or $rowSize -lt 2 -or $rows -gt 50 -or $header + $rows * $rowSize -gt $bytes.Length) {
  throw 'Cabeçalho ou comprimento DBF inválido.'
}

$columns = [ordered]@{}
$offset = 1
for ($field = 32; $field -lt $header -and $bytes[$field] -ne 13; $field += 32) {
  if ($field + 31 -ge $header) { throw 'Descritor DBF incompleto.' }
  $name = $encoding.GetString($bytes, $field, 11).Trim([char]0).Trim()
  $length = $bytes[$field + 16]
  $columns[$name] = @{ Offset = $offset; Length = $length }
  $offset += $length
}
if ($offset -ne $rowSize) { throw 'Tamanho de registro DBF inesperado.' }
$needed = @('NUM_SETOR', 'LOCAL', 'TIPOLOGIA', 'GRAU_RISCO', 'DATA_SETOR')
foreach ($name in $needed) { if (!$columns.Contains($name)) { throw "Campo DBF ausente: $name" } }

$sectors = @{}
for ($row = 0; $row -lt $rows; $row++) {
  $start = $header + $row * $rowSize
  if ($bytes[$start] -eq 42) { continue }
  $properties = @{}
  foreach ($name in $needed) {
    $column = $columns[$name]
    $properties[$name] = $encoding.GetString($bytes, $start + $column.Offset, $column.Length).Trim()
  }
  $id = $properties.NUM_SETOR
  if (!$id -or $sectors.ContainsKey($id)) { throw 'Código de setor ausente ou duplicado no DBF.' }
  $sectors[$id] = $properties
}

$innerZip = [IO.Compression.ZipArchive]::new($kmz, [IO.Compression.ZipArchiveMode]::Read)
try {
  $settings = [Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
  $settings.MaxCharactersInDocument = 5000000
  $content = (Get-Entry $innerZip '.kml').Open()
  try {
    $reader = [Xml.XmlReader]::Create($content, $settings)
    try {
      $kml = [Xml.XmlDocument]::new()
      $kml.Load($reader)
    } finally { $reader.Dispose() }
  } finally { $content.Dispose() }
} finally { $innerZip.Dispose(); $kmz.Dispose() }

$culture = [Globalization.CultureInfo]::InvariantCulture
$features = foreach ($marker in $kml.SelectNodes('//*[local-name()="Placemark"]')) {
  $id = $marker.SelectSingleNode('./*[local-name()="name"]').InnerText.Trim()
  if (!$sectors.ContainsKey($id)) { throw "Setor KML sem registro DBF correspondente: $id" }
  $record = $sectors[$id]
  $sectors.Remove($id)
  $polygons = @($marker.SelectNodes('.//*[local-name()="Polygon"]'))
  if (!$polygons.Count) { throw "Setor sem polígono: $id" }
  $coordinates = [Collections.Generic.List[object]]::new()
  foreach ($polygon in $polygons) {
    $rings = [Collections.Generic.List[object]]::new()
    foreach ($element in $polygon.SelectNodes('.//*[local-name()="LinearRing"]/*[local-name()="coordinates"]')) {
      $ring = [Collections.Generic.List[object]]::new()
      foreach ($tuple in ($element.InnerText.Trim() -split '\s+')) {
        $values = $tuple.Split(',')
        $ring.Add(@([double]::Parse($values[0], $culture), [double]::Parse($values[1], $culture)))
      }
      $rings.Add($ring.ToArray())
    }
    $coordinates.Add($rings.ToArray())
  }
  $name = if ($record.LOCAL) { $record.LOCAL } else { $id }
  $date = [DateTime]::ParseExact($record.DATA_SETOR, 'yyyyMMdd', $culture).ToString('yyyy-MM-dd', $culture)
  if (!$record.TIPOLOGIA -or !$record.GRAU_RISCO) { throw "Tipologia ou grau ausente no setor $id." }
  @{
    type = 'Feature'
    geometry = @{ type = 'MultiPolygon'; coordinates = $coordinates.ToArray() }
    properties = @{
      externalId = $id; name = $name; sourceHazard = $record.TIPOLOGIA
      sourceClassification = $record.GRAU_RISCO; surveyDate = $date
    }
  }
}
if ($sectors.Count -or @($features).Count -eq 0) { throw 'Setores KML e DBF divergentes.' }

$payload = @{
  municipalityId = $MunicipalityId.ToString()
  source = 'SGB/CPRM — setorização histórica de Além Paraíba (2012)'
  sourceUrl = 'https://rigeo.sgb.gov.br/items/780aa1d9-4846-4473-b1fd-da70097a77bd'
  sourceVersion = '2012-sha256-' + $digest
  collection = @{ type = 'FeatureCollection'; features = @($features) }
}
$destination = [IO.Path]::GetFullPath($OutputFile)
[IO.File]::WriteAllText($destination, (ConvertTo-Json $payload -Depth 15))
Write-Output "$(@($features).Count) setores preparados em $destination"
