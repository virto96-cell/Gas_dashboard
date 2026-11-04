# Генератор ДЕМО-данных (синтетика). Запуск:  powershell -ExecutionPolicy Bypass -File tools\generate_demo_data.ps1
# Все цифры вымышлены и не являются официальными. Результат: data\*.csv и data\geo\russia_regions.geojson
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force (Join-Path $dataDir 'geo') | Out-Null
$enc = New-Object System.Text.UTF8Encoding($false)
$rnd = New-Object System.Random(2025)
$inv = [Globalization.CultureInfo]::InvariantCulture
$SRC = 'Демо-данные (синтетика)'
$years = 2021..2025
$fyears = 2026..2035
$FSRC = 'Демо-прогноз (синтетика)'
function Lerp($a, $b, $y) { $a + ($b - $a) * ($y - 2025) / 10 }

function F($v, $d = 1) { [Math]::Round([double]$v, $d).ToString("F$d", $inv) }
function Q($s) { if ($s -match '[",\n;]') { '"' + ($s -replace '"', '""') + '"' } else { $s } }
function Save($name, $header, $rows) {
    $lines = @($header -join ',') + ($rows | ForEach-Object { ($_ | ForEach-Object { Q ([string]$_) }) -join ',' })
    [IO.File]::WriteAllText((Join-Path $dataDir $name), (($lines -join "`r`n") + "`r`n"), $enc)
    Write-Host ("{0,-32} {1} строк" -f $name, $rows.Count)
}
function Noise($pct) { 1 + ($rnd.NextDouble() * 2 - 1) * $pct }

# ---------- 1. Экспортные потоки (млрд куб. м) ----------
$west  = @{2021 = 138.0; 2022 = 82.0; 2023 = 31.0; 2024 = 26.5; 2025 = 24.0 }
$east  = @{2021 = 10.0;  2022 = 15.5; 2023 = 22.5; 2024 = 31.0; 2025 = 38.0 }
$ca    = @{ 'Узбекистан' = @{2021 = 6.0; 2022 = 7.5; 2023 = 8.0; 2024 = 9.0; 2025 = 9.5 }
            'Казахстан'  = @{2021 = 12.0; 2022 = 12.5; 2023 = 13.0; 2024 = 13.5; 2025 = 14.0 }
            'Киргизия'   = @{2021 = 0.9; 2022 = 1.0; 2023 = 1.1; 2024 = 1.2; 2025 = 1.3 } }
$rows = @()
foreach ($y in $years) {
    $south = 0; foreach ($c in $ca.Keys) { $south += $ca[$c][$y] }
    $rows += , @($y, 'west',  (F $west[$y]), $SRC, 'Запад: «Турецкий поток» и прочие маршруты (демо)', 0)
    $rows += , @($y, 'east',  (F $east[$y]), $SRC, 'Восток: «Сила Сибири» (демо)', 0)
    $rows += , @($y, 'south', (F $south),    $SRC, 'Юг: страны Средней Азии (демо)', 0)
}
$tgtCA = @{ 'Узбекистан' = 14.0; 'Казахстан' = 17.0; 'Киргизия' = 2.2 }
foreach ($y in $fyears) {
    $south = 0; foreach ($c in $ca.Keys) { $south += Lerp $ca[$c][2025] $tgtCA[$c] $y }
    $rows += , @($y, 'west',  (F (Lerp 24.0 18.0 $y)), $FSRC, 'Запад: прогноз (демо)', 1)
    $rows += , @($y, 'east',  (F (Lerp 38.0 58.0 $y)), $FSRC, 'Восток: прогноз (демо)', 1)
    $rows += , @($y, 'south', (F $south), $FSRC, 'Юг: прогноз (демо)', 1)
}
Save 'export_flows.csv' @('year','direction','volume_bcm','source','note','is_forecast') $rows

# ---------- 2. СПГ-экспорт (млн т) ----------
$lng = @(
  @('Ямал СПГ','Европа',@(11.5,10.8,9.6,9.0,8.4)),   @('Ямал СПГ','Азия',@(6.5,7.4,9.6,10.4,11.4)),
  @('Сахалин-2','Европа',@(0.4,0.1,0.0,0.0,0.0)),    @('Сахалин-2','Азия',@(10.0,10.4,10.6,10.7,10.8)),
  @('Арктик СПГ-2','Азия',@(0.0,0.0,0.0,1.2,3.0)))
$rows = @()
foreach ($l in $lng) { for ($i = 0; $i -lt 5; $i++) { if ($l[2][$i] -gt 0) { $rows += , @($years[$i], $l[0], $l[1], (F $l[2][$i]), $SRC, 0) } } }
$lngT = @{ 'Ямал СПГ|Европа' = 5.0; 'Ямал СПГ|Азия' = 15.0; 'Сахалин-2|Азия' = 11.0; 'Арктик СПГ-2|Азия' = 19.8 }
foreach ($l in $lng) { $k = $l[0] + '|' + $l[1]; if ($lngT.ContainsKey($k)) { foreach ($y in $fyears) { $rows += , @($y, $l[0], $l[1], (F (Lerp $l[2][4] $lngT[$k] $y)), $FSRC, 1) } } }
Save 'lng_exports.csv' @('year','project','buyer_region','volume_mt','source','is_forecast') $rows

# ---------- 3. Внутреннее потребление по регионам (млрд куб. м) ----------
$geoPath = Join-Path $dataDir 'geo\russia_regions.geojson'
if (-not (Test-Path $geoPath)) { throw 'Сначала постройте GeoJSON: tools\build_geojson.ps1' }
$geoNames = [regex]::Matches([IO.File]::ReadAllText($geoPath, [Text.Encoding]::UTF8), '"name":"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$W = @{ 'Ханты-Мансийский автономный округ — Югра'=40; 'Ямало-Ненецкий автономный округ'=24; 'Москва'=31; 'Московская область'=38; 'Санкт-Петербург'=16; 'Ленинградская область'=11
 'Татарстан'=27; 'Республика Башкортостан'=24; 'Краснодарский край'=27; 'Свердловская область'=24; 'Челябинская область'=23; 'Нижегородская область'=18; 'Пермский край'=17
 'Самарская область'=21; 'Ростовская область'=20; 'Волгоградская область'=17; 'Саратовская область'=16; 'Оренбургская область'=14; 'Ставропольский край'=13; 'Тульская область'=11
 'Красноярский край'=10; 'Воронежская область'=10; 'Белгородская область'=9; 'Новосибирская область'=9; 'Кемеровская область'=8; 'Липецкая область'=8; 'Томская область'=7
 'Омская область'=7; 'Ярославская область'=7; 'Тюменская область'=12; 'Якутия'=5; 'Республика Коми'=6; 'Вологодская область'=6; 'Дагестан'=6; 'Чечня'=3; 'Бурятия'=1
 'Забайкальский край'=1; 'Автономная Республика Крым'=5; 'Севастополь'=1.5; 'Чукотский автономный округ'=0.2; 'Магаданская область'=0.3; 'Камчатский край'=1; 'Тыва'=0.5
 'Республика Алтай'=0.3; 'Калмыкия'=1; 'Ненецкий автономный округ'=1; 'Мурманская область'=2; 'Карелия'=1.5; 'Приморский край'=4; 'Хабаровский край'=4; 'Сахалинская область'=3; 'Амурская область'=2 }
$regions = @(); foreach ($nm in $geoNames) { $wt = 3; if ($W.ContainsKey($nm)) { $wt = $W[$nm] }; $regions += , @($nm, 0, 0, '', $wt) }
$wsum = 0; foreach ($r in $regions) { $wsum += $r[4] }
$totals = @{2021 = 482.0; 2022 = 474.0; 2023 = 478.0; 2024 = 489.0; 2025 = 493.0 }
$rows = @()
foreach ($r in $regions) {
    foreach ($y in $years) {
        $v = $totals[$y] * $r[4] / $wsum * (Noise 0.03)
        $rows += , @($y, $r[0], (F $v 2), 0, $SRC)
    }
}
foreach ($r in $regions) { foreach ($y in $fyears) { $v = (Lerp 493.0 540.0 $y) * $r[4] / $wsum * (Noise 0.01); $rows += , @($y, $r[0], (F $v 2), 1, $FSRC) } }
Save 'domestic_consumption.csv' @('year','region','volume_bcm','is_forecast','source') $rows

# ---------- 4. Добыча по кварталам (млрд куб. м). Годовые итоги по компаниям заданы, кварталы сходятся точно ----------
$prodAnnual = @{
 'Газпром' = @{2021 = 514.8; 2022 = 412.9; 2023 = 359.0; 2024 = 416.0; 2025 = 420.0 }
 'Роснефть'= @{2021 = 63.5;  2022 = 63.0;  2023 = 66.0;  2024 = 68.0;  2025 = 70.0 }
 'Новатэк' = @{2021 = 77.0;  2022 = 80.5;  2023 = 82.0;  2024 = 84.0;  2025 = 86.5 }
 'Прочие'  = @{2021 = 118.0; 2022 = 115.0; 2023 = 120.0; 2024 = 123.0; 2025 = 126.0 } }
$season = @(0.275, 0.225, 0.215, 0.285)
$rows = @(); $annRows = @(); $chk = @{}
foreach ($c in 'Газпром','Роснефть','Новатэк','Прочие') {
    foreach ($y in $years) {
        $tot = $prodAnnual[$c][$y]
        $w = 0..3 | ForEach-Object { $season[$_] * (Noise 0.015) }
        $ws = ($w | Measure-Object -Sum).Sum
        $acc = 0.0; $q = @()
        for ($i = 0; $i -lt 3; $i++) { $v = [Math]::Round($tot * $w[$i] / $ws, 1); $q += $v; $acc += $v }
        $q += [Math]::Round($tot - $acc, 1)
        for ($i = 0; $i -lt 4; $i++) { $rows += , @($y, "Q$($i+1)", $c, (F $q[$i]), 0, $SRC) }
        $annRows += , @($y, $c, (F $tot), $SRC)
    }
}
$prodT = @{ 'Газпром' = 450.0; 'Роснефть' = 90.0; 'Новатэк' = 140.0; 'Прочие' = 140.0 }
foreach ($c in 'Газпром','Роснефть','Новатэк','Прочие') {
    foreach ($y in $fyears) {
        $tot = [Math]::Round((Lerp $prodAnnual[$c][2025] $prodT[$c] $y), 1)
        $w = 0..3 | ForEach-Object { $season[$_] * (Noise 0.015) }
        $ws = ($w | Measure-Object -Sum).Sum
        $acc = 0.0; $q = @()
        for ($i = 0; $i -lt 3; $i++) { $v = [Math]::Round($tot * $w[$i] / $ws, 1); $q += $v; $acc += $v }
        $q += [Math]::Round($tot - $acc, 1)
        for ($i = 0; $i -lt 4; $i++) { $rows += , @($y, "Q$($i+1)", $c, (F $q[$i]), 1, $FSRC) }
        $annRows += , @($y, $c, (F $tot), $FSRC)
    }
}
Save 'domestic_production.csv' @('year','quarter','company','volume_bcm','is_forecast','source') $rows
# Контрольный файл: годовые итоги, с которыми должна сходиться сумма кварталов
Save 'domestic_production_annual_check.csv' @('year','company','volume_bcm_year','source') $annRows

# ---------- 5. Европа ----------
$euCons = @(520,480,455,460,465); $euLng = @(95,138,130,128,126); $euPipe = @(215,125,110,102,98); $euShare = @(38.0,16.5,12.0,11.5,10.0)
$rows = @()
for ($i = 0; $i -lt 5; $i++) {
  $y = $years[$i]
  $rows += , @($y,'потребление',(F $euCons[$i]),'bcm',0,$SRC)
  $rows += , @($y,'импорт_всего',(F ($euLng[$i] + $euPipe[$i])),'bcm',0,$SRC)
  $rows += , @($y,'импорт_СПГ',(F $euLng[$i]),'bcm',0,$SRC)
  $rows += , @($y,'импорт_трубопроводный',(F $euPipe[$i]),'bcm',0,$SRC)
  $rows += , @($y,'доля_России',(F $euShare[$i]),'%',0,$SRC)
}
foreach ($y in $fyears) {
  $c = Lerp 465 430 $y; $lg = Lerp 126 140 $y; $pp = Lerp 98 75 $y; $sh = Lerp 10.0 7.0 $y
  $rows += , @($y,'потребление',(F $c),'bcm',1,$FSRC); $rows += , @($y,'импорт_всего',(F ($lg + $pp)),'bcm',1,$FSRC)
  $rows += , @($y,'импорт_СПГ',(F $lg),'bcm',1,$FSRC); $rows += , @($y,'импорт_трубопроводный',(F $pp),'bcm',1,$FSRC); $rows += , @($y,'доля_России',(F $sh),'%',1,$FSRC)
}
# --- отраслевая структура потребления и собственная добыча (для Европы и Китая) ---
function ShareAt($s21, $s35, $y) { $s21 + ($s35 - $s21) * ($y - 2021) / 14 }
function SectorRows($y, $cons, $sh21, $sh35, $fc, $src, $withUnit) {
    $names = 'электроэнергетика','промышленность','население_и_услуги','прочее'; $out = @(); $acc = 0.0
    for ($i = 0; $i -lt 4; $i++) {
        if ($i -lt 3) { $v = [Math]::Round($cons * (ShareAt $sh21[$i] $sh35[$i] $y), 1); $acc += $v } else { $v = [Math]::Round($cons - $acc, 1) }
        if ($withUnit) { $out += , @($y, ('потребление_' + $names[$i]), (F $v), 'bcm', $fc, $rsrc) } else { $out += , @($y, ('потребление_' + $names[$i]), (F $v), $fc, $rsrc) }
    }
    $out
}
for ($i = 0; $i -lt 15; $i++) {
  $y = 2021 + $i
  if ($y -le 2025) { $c = $euCons[$i]; $imp = $euLng[$i] + $euPipe[$i]; $fc = 0; $rsrc = $SRC } else { $c = Lerp 465 430 $y; $imp = (Lerp 126 140 $y) + (Lerp 98 75 $y); $fc = 1; $rsrc = $FSRC }
  $rows += , @($y,'собственная_добыча',(F ($c - $imp)),'bcm',$fc,$rsrc)
  $rows += SectorRows $y $c @(0.27,0.31,0.34) @(0.23,0.29,0.38) $fc $rsrc $true
}
Save 'europe_market.csv' @('year','indicator','value','unit','is_forecast','source') $rows

# ---------- 6. Китай ----------
$cnCons = @(378,366,392,420,445); $cnPipe = @(50,60,68,77,86); $cnLng = @(109,102,95,103,108)
$rows = @()
for ($i = 0; $i -lt 5; $i++) {
  $y = $years[$i]
  $rows += , @($y,'потребление',(F $cnCons[$i]),0,$SRC)
  $rows += , @($y,'импорт_трубопроводный',(F $cnPipe[$i]),0,$SRC)
  $rows += , @($y,'импорт_СПГ',(F $cnLng[$i]),0,$SRC)
}
foreach ($y in $fyears) {
  $rows += , @($y,'потребление',(F (Lerp 445 590 $y)),1,$FSRC); $rows += , @($y,'импорт_трубопроводный',(F (Lerp 86 125 $y)),1,$FSRC); $rows += , @($y,'импорт_СПГ',(F (Lerp 108 160 $y)),1,$FSRC)
}
for ($i = 0; $i -lt 15; $i++) {
  $y = 2021 + $i
  if ($y -le 2025) { $c = $cnCons[$i]; $imp = $cnPipe[$i] + $cnLng[$i]; $fc = 0; $rsrc = $SRC } else { $c = Lerp 445 590 $y; $imp = (Lerp 86 125 $y) + (Lerp 108 160 $y); $fc = 1; $rsrc = $FSRC }
  $rows += , @($y,'собственная_добыча',(F ($c - $imp)),$fc,$rsrc)
  $rows += SectorRows $y $c @(0.18,0.45,0.22) @(0.22,0.40,0.25) $fc $rsrc $false
}
Save 'china_market.csv' @('year','indicator','value_bcm','is_forecast','source') $rows

# ---------- 7. Средняя Азия ----------
$rows = @()
foreach ($c in 'Узбекистан','Казахстан','Киргизия') { foreach ($y in $years) { $rows += , @($y,$c,(F $ca[$c][$y]),0,$SRC) } }
foreach ($c in 'Узбекистан','Казахстан','Киргизия') { foreach ($y in $fyears) { $rows += , @($y,$c,(F (Lerp $ca[$c][2025] $tgtCA[$c] $y)),1,$FSRC) } }
$cam = @(); $cp = @{ 'Узбекистан' = @(46.5, 52.0, 56.0, 66.0); 'Казахстан' = @(56.0, 70.0, 24.0, 32.0); 'Киргизия' = @(0.03, 0.05, 2.8, 3.6) }
$csh = @{ 'Узбекистан' = @(0.40,0.25,0.30); 'Казахстан' = @(0.30,0.35,0.30); 'Киргизия' = @(0.30,0.15,0.50) }
foreach ($c in 'Узбекистан','Казахстан','Киргизия') {
  for ($i = 0; $i -lt 15; $i++) {
    $y = 2021 + $i; $fc = 0; $rsrc = $SRC; if ($y -gt 2025) { $fc = 1; $rsrc = $FSRC }
    if ($y -le 2025) { $k = 1 - 0.025 * (2025 - $y); $pr = $cp[$c][0] * $k; $cs = $cp[$c][2] * $k } else { $pr = Lerp $cp[$c][0] $cp[$c][1] $y; $cs = Lerp $cp[$c][2] $cp[$c][3] $y }
    $cam += , @($y, $c, 'собственная_добыча', (F $pr 2), $fc, $rsrc)
    $cam += , @($y, $c, 'потребление', (F $cs 2), $fc, $rsrc)
    $names = 'электроэнергетика','промышленность','население_и_услуги'; $acc = 0.0
    for ($j = 0; $j -lt 3; $j++) { $v = [Math]::Round($cs * $csh[$c][$j], 2); $acc += $v; $cam += , @($y, $c, ('потребление_' + $names[$j]), (F $v 2), $fc, $rsrc) }
    $cam += , @($y, $c, 'потребление_прочее', (F ([Math]::Round($cs - $acc, 2)) 2), $fc, $rsrc)
  }
}
Save 'central_asia_market.csv' @('year','country','indicator','value_bcm','is_forecast','source') $cam
Save 'central_asia_exports.csv' @('year','country','volume_bcm','is_forecast','source') $rows

# ---------- 8. Контракты (демо-покупатели обезличены) ----------
$rows = @(
 @('C-001','Ямал СПГ','Покупатель Е-1','Европа','2.9','','2018','2038','Нефтяная индексация (Brent)','11.5','% от Brent',$SRC),
 @('C-002','Ямал СПГ','Покупатель Е-2','Европа','2.5','','2018','2038','Нефтяная индексация (Brent)','11.2','% от Brent',$SRC),
 @('C-003','Ямал СПГ','Покупатель А-1','Азия','3.0','','2019','2039','Гибридная формула','10.9','% от Brent',$SRC),
 @('C-004','Ямал СПГ','Покупатель А-2','Азия','2.0','','2019','2034','Фиксированная цена','430','USD/т',$SRC),
 @('C-005','Сахалин-2','Покупатель А-3','Азия','3.5','','2009','2034','Нефтяная индексация (Brent)','12.0','% от Brent',$SRC),
 @('C-006','Сахалин-2','Покупатель А-4','Азия','2.2','','2011','2031','Нефтяная индексация (Brent)','11.8','% от Brent',$SRC),
 @('C-007','Арктик СПГ-2','Покупатель А-5','Азия','4.0','','2023','2043','Гибридная формула','10.5','% от Brent',$SRC),
 @('C-008','Арктик СПГ-2','Покупатель А-6','Азия','2.0','','2023','2038','Фиксированная цена','410','USD/т',$SRC),
 @('C-009','Сила Сибири','Покупатель К-1','Китай','','38','2019','2049','Нефтяная корзина с лагом','285','USD/тыс. куб. м',$SRC),
 @('C-010','Турецкий поток','Покупатель Е-3','Европа','','12','2020','2030','Нефтяная индексация (Brent)','290','USD/тыс. куб. м',$SRC))
Save 'contracts.csv' @('contract_id','project','buyer','buyer_region','volume_mtpa','volume_bcm_year','start_year','end_year','pricing_formula','price_value','price_unit','source') $rows

# ---------- 9. Цены (контрактные), факт 2021–2025 и прогноз 2026–2035 ----------
$pr = @(
 @('трубопроводный_Европа','USD/тыс. куб. м',@(285,560,340,295,290),@(285,288,292,296,300)),
 @('трубопроводный_Китай', 'USD/тыс. куб. м',@(235,262,285,288,290),@(292,295,298,301,304)),
 @('СПГ_Европа',           'USD/т',@(460,980,540,480,470),@(470,475,480,485,490)),
 @('СПГ_Азия',             'USD/т',@(520,880,580,530,515),@(515,520,525,530,535)))
$rows = @()
foreach ($p in $pr) {
  for ($i = 0; $i -lt 5; $i++) { $rows += , @($years[$i], $p[0], (F $p[2][$i] 0), $p[1], 0, $SRC) }
  for ($i = 0; $i -lt 5; $i++) { $rows += , @((2026 + $i), $p[0], (F $p[3][$i] 0), $p[1], 1, 'Демо-прогноз (синтетика)') }
  $step = $p[3][4] - $p[3][3]
  for ($i = 1; $i -le 5; $i++) { $rows += , @((2030 + $i), $p[0], (F ($p[3][4] + $step * $i) 0), $p[1], 1, 'Демо-прогноз (синтетика)') }
}
Save 'prices_annual.csv' @('year','segment','price_value','price_unit','is_forecast','source') $rows

# ---------- Проверка: сумма кварталов = годовому итогу ----------
$bad = 0
$prod = Import-Csv (Join-Path $dataDir 'domestic_production.csv')
foreach ($a in $annRows) {
  $s = 0.0; foreach ($p in $prod) { if ($p.year -eq [string]$a[0] -and $p.company -eq $a[1]) { $s += [double]::Parse($p.volume_bcm, $inv) } }
  if ([Math]::Abs($s - [double]::Parse($a[2], $inv)) -gt 0.001) { $bad++; Write-Host "РАСХОЖДЕНИЕ $($a[0]) $($a[1]): $s vs $($a[2])" }
}
if ($bad -eq 0) { Write-Host 'Проверка: суммы кварталов сходятся с годовыми итогами.' } else { throw 'Есть расхождения' }
