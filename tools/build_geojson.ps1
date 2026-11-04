# Строит data\geo\russia_regions.geojson из Natural Earth (admin-1, 50m, общественное достояние):
#   https://github.com/nvkelso/natural-earth-vector  ->  geojson/ne_50m_admin_1_states_provinces.geojson
# Что делает: оставляет субъекты РФ, берёт русские названия (name_ru), сшивает переход через 180° (Чукотка)
# и проецирует в коническую равновеликую проекцию Альберса (иначе Россия на карте выглядит растянутой).
# Запуск: powershell -ExecutionPolicy Bypass -File tools\build_geojson.ps1 -Source путь\к\ne_50m_admin_1_states_provinces.geojson
param([Parameter(Mandatory)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer; $ser.MaxJsonLength = [int]::MaxValue
$j = $ser.DeserializeObject([IO.File]::ReadAllText($Source, [Text.Encoding]::UTF8))
$inv = [Globalization.CultureInfo]::InvariantCulture
$rad = [Math]::PI / 180
$p1 = 52 * $rad; $p2 = 64 * $rad; $p0 = 55 * $rad; $l0 = 100
$n = ([Math]::Sin($p1) + [Math]::Sin($p2)) / 2
$Cc = [Math]::Pow([Math]::Cos($p1), 2) + 2 * $n * [Math]::Sin($p1)
$rho0 = [Math]::Sqrt($Cc - 2 * $n * [Math]::Sin($p0)) / $n
function Proj($lon, $lat) {
    if ($lon -lt 0) { $lon += 360 }
    $rho = [Math]::Sqrt($Cc - 2 * $n * [Math]::Sin($lat * $rad)) / $n
    $th = $n * ($lon - $l0) * $rad
    $x = 1000 * $rho * [Math]::Sin($th); $y = 1000 * ($rho0 - $rho * [Math]::Cos($th))
    '[' + $x.ToString('F1', $inv) + ',' + $y.ToString('F1', $inv) + ']'
}
function Ring($r) { '[' + (($r | ForEach-Object { Proj ([double]$_[0]) ([double]$_[1]) }) -join ',') + ']' }
function Poly($p) { '[' + (($p | ForEach-Object { Ring $_ }) -join ',') + ']' }
$feats = @()
foreach ($f in $j['features']) {
    $pr = $f['properties']; if ($pr['admin'] -ne 'Russia') { continue }
    $name = $pr['name_ru']; if ($pr['name'] -eq 'Altay') { $name = 'Алтайский край' }
    $g = $f['geometry']
    if ($g['type'] -eq 'Polygon') { $geom = '{"type":"Polygon","coordinates":' + (Poly $g['coordinates']) + '}' }
    else { $geom = '{"type":"MultiPolygon","coordinates":[' + (($g['coordinates'] | ForEach-Object { Poly $_ }) -join ',') + ']}' }
    $feats += '{"type":"Feature","properties":{"name":"' + $name + '"},"geometry":' + $geom + '}'
}
$out = '{"type":"FeatureCollection","note":"Natural Earth admin-1 (public domain), упрощённые границы, проекция Альберса","features":[' + "`n" + ($feats -join ",`n") + "`n]}"
$dst = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\geo\russia_regions.geojson'
[IO.File]::WriteAllText($dst, $out, (New-Object Text.UTF8Encoding($false)))
"{0} регионов, {1:N0} КБ -> {2}" -f $feats.Count, ((Get-Item $dst).Length / 1KB), $dst
