# Converts Daily_Update.xlsx to JSON files for the trading journal website.
# Run after updating the Excel file:
#   powershell -ExecutionPolicy Bypass -File "D:\Website\scripts\convert-excel.ps1"

param(
    [string]$ExcelPath = "D:\Website\Daily_Update.xlsx",
    [string]$OutputDir = "D:\Website\data",
    [string]$TempDir = "D:\Website\.xlsx-temp"
)

$ErrorActionPreference = "Stop"

$sheetConfig = [ordered]@{
    "Net_P&L_Jp"                  = @{ slug = "net-pnl-jp"; title = "Net P&L - Jp"; icon = "chart" }
    "Net_P&L_Dhanu"               = @{ slug = "net-pnl-dhanu"; title = "Net P&L - Dhanu"; icon = "chart" }
    "Quarterly_Result"            = @{ slug = "quarterly-result"; title = "Quarterly Result"; icon = "calendar" }
    "Trade_Journal"               = @{ slug = "trade-journal"; title = "Trade Journal"; icon = "book" }
    "Formula"                     = @{ slug = "formula"; title = "Formula"; icon = "formula" }
    "Covered_Call_Trade_Journal"  = @{ slug = "covered-call"; title = "Covered Call Journal"; icon = "layers" }
    "Swing_Trading"               = @{ slug = "swing-trading"; title = "Swing Trading"; icon = "trending" }
    "Govt. Bonds"                 = @{ slug = "govt-bonds"; title = "Govt. Bonds"; icon = "shield" }
    "Weight"                      = @{ slug = "weight"; title = "Weight Tracker"; icon = "activity" }
    "ITC"                         = @{ slug = "itc"; title = "ITC Analysis"; icon = "bar" }
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Expand-Workbook([string]$Source, [string]$Destination) {
    if (Test-Path $Destination) {
        Remove-Item $Destination -Recurse -Force
    }
    Ensure-Directory $Destination
    $zipPath = Join-Path $Destination "book.zip"
    Copy-Item $Source $zipPath -Force
    Expand-Archive -Path $zipPath -DestinationPath (Join-Path $Destination "unzipped") -Force
    Remove-Item $zipPath -Force
}

function Get-ColumnIndex([string]$ColumnLetters) {
    $index = 0
    foreach ($char in $ColumnLetters.ToCharArray()) {
        $index = ($index * 26) + ([int][char]$char - [int][char]'A' + 1)
    }
    return $index - 1
}

function Get-CellParts([string]$CellRef) {
    $letters = ($CellRef -replace '\d+', '')
    $row = [int]($CellRef -replace '\D+', '')
    return @{
        col = Get-ColumnIndex $letters
        row = $row - 1
    }
}

function Read-SharedStrings([string]$BasePath) {
    $sharedStrings = @()
    $path = Join-Path $BasePath "unzipped\xl\sharedStrings.xml"
    if (-not (Test-Path $path)) { return $sharedStrings }

    $xml = [xml](Get-Content $path -Raw -Encoding UTF8)
    if (-not $xml.sst.si) { return $sharedStrings }

    foreach ($si in @($xml.sst.si)) {
        if ($si.t) {
            $sharedStrings += [string]$si.t
        }
        elseif ($si.r) {
            $parts = @($si.r | ForEach-Object { [string]$_.t })
            $sharedStrings += ($parts -join '')
        }
        else {
            $sharedStrings += ''
        }
    }
    return $sharedStrings
}

function Get-CellValue($cell, $sharedStrings) {
    if (-not $cell.v) { return $null }
    if ($cell.t -eq 's') { return $sharedStrings[[int]$cell.v] }
    if ($cell.t -eq 'b') { return [bool]([int]$cell.v) }
    return [string]$cell.v
}

function Read-SheetGrid([string]$SheetPath, $sharedStrings) {
    $xml = [xml](Get-Content $SheetPath -Raw -Encoding UTF8)
    $rows = @($xml.worksheet.sheetData.row)
    if ($rows.Count -eq 0) {
        return @{
            rowCount = 0
            colCount = 0
            cells    = @()
        }
    }

    $grid = @{}
    $maxRow = 0
    $maxCol = 0

    foreach ($row in $rows) {
        foreach ($cell in @($row.c)) {
            $parts = Get-CellParts $cell.r
            $value = Get-CellValue $cell $sharedStrings
            $key = "$($parts.row):$($parts.col)"
            $grid[$key] = $value
            if ($parts.row -gt $maxRow) { $maxRow = $parts.row }
            if ($parts.col -gt $maxCol) { $maxCol = $parts.col }
        }
    }

    $cells = New-Object System.Collections.Generic.List[object]
    for ($r = 0; $r -le $maxRow; $r++) {
        $rowValues = New-Object System.Collections.Generic.List[object]
        for ($c = 0; $c -le $maxCol; $c++) {
            $key = "$r`:$c"
            if ($grid.ContainsKey($key)) {
                $rowValues.Add($grid[$key])
            }
            else {
                $rowValues.Add($null)
            }
        }
        $cells.Add($rowValues.ToArray())
    }

    return @{
        rowCount = $maxRow + 1
        colCount = $maxCol + 1
        cells    = $cells.ToArray()
    }
}

function Trim-Grid($grid) {
    $cells = [System.Collections.Generic.List[object]]::new()
    $cells.AddRange($grid.cells)

    while ($cells.Count -gt 0) {
        $last = $cells[$cells.Count - 1]
        $hasValue = $false
        foreach ($value in $last) {
            if ($null -ne $value -and "$value".Trim() -ne '') {
                $hasValue = $true
                break
            }
        }
        if ($hasValue) { break }
        $cells.RemoveAt($cells.Count - 1)
    }

    if ($cells.Count -eq 0) {
        return @{
            rowCount = 0
            colCount = 0
            cells    = @()
        }
    }

    $maxCol = 0
    foreach ($row in $cells) {
        for ($i = $row.Length - 1; $i -ge 0; $i--) {
            $value = $row[$i]
            if ($null -ne $value -and "$value".Trim() -ne '') {
                if ($i -gt $maxCol) { $maxCol = $i }
                break
            }
        }
    }

    $trimmed = New-Object System.Collections.Generic.List[object]
    foreach ($row in $cells) {
        $slice = @()
        for ($i = 0; $i -le $maxCol; $i++) {
            if ($i -lt $row.Length) { $slice += $row[$i] }
            else { $slice += $null }
        }
        $trimmed.Add($slice)
    }

    return @{
        rowCount = $trimmed.Count
        colCount = $maxCol + 1
        cells    = $trimmed.ToArray()
    }
}

function ConvertTo-JsonSafe([object]$Data) {
    return ($Data | ConvertTo-Json -Depth 20 -Compress)
}

Ensure-Directory $OutputDir
Ensure-Directory $TempDir
Expand-Workbook $ExcelPath $TempDir

$sharedStrings = Read-SharedStrings $TempDir
$workbookXml = [xml](Get-Content (Join-Path $TempDir "unzipped\xl\workbook.xml") -Raw -Encoding UTF8)
$relsXml = [xml](Get-Content (Join-Path $TempDir "unzipped\xl\_rels\workbook.xml.rels") -Raw -Encoding UTF8)

$sheetTargets = @{}
foreach ($rel in $relsXml.Relationships.Relationship) {
    if ($rel.Type -like "*worksheet") {
        $sheetTargets[$rel.Id] = $rel.Target -replace '^worksheets/', ''
    }
}

$manifest = New-Object System.Collections.Generic.List[object]
$sheetIndex = 1

foreach ($sheet in $workbookXml.workbook.sheets.sheet) {
    $sheetName = [string]$sheet.name
    if (-not $sheetConfig.Contains($sheetName)) { continue }

    $meta = $sheetConfig[$sheetName]
    $target = $sheetTargets[[string]$sheet.'r:id']
    if (-not $target) {
        $target = "sheet$sheetIndex.xml"
    }

    $sheetPath = Join-Path $TempDir "unzipped\xl\worksheets\$target"
    $grid = Read-SheetGrid $sheetPath $sharedStrings
    $grid = Trim-Grid $grid

    $payload = [ordered]@{
        sheetName = $sheetName
        slug      = $meta.slug
        title     = $meta.title
        icon      = $meta.icon
        updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        rowCount  = $grid.rowCount
        colCount  = $grid.colCount
        cells     = $grid.cells
    }

    $jsonPath = Join-Path $OutputDir "$($meta.slug).json"
    ConvertTo-JsonSafe $payload | Set-Content -Path $jsonPath -Encoding UTF8

    $manifest.Add([ordered]@{
        sheetName = $sheetName
        slug      = $meta.slug
        title     = $meta.title
        icon      = $meta.icon
        rowCount  = $grid.rowCount
        colCount  = $grid.colCount
        dataFile  = "data/$($meta.slug).json"
    })

    $sheetIndex++
}

$manifestPayload = [ordered]@{
    sourceFile = "Daily_Update.xlsx"
    updatedAt  = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    sheets     = $manifest.ToArray()
}

ConvertTo-JsonSafe $manifestPayload | Set-Content -Path (Join-Path $OutputDir "manifest.json") -Encoding UTF8

Write-Host "Converted $($manifest.Count) sheets to $OutputDir"
foreach ($item in $manifest) {
    Write-Host "  - $($item.title) ($($item.rowCount) rows)"
}
