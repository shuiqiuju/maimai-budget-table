$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'artifacts'
$null = New-Item -ItemType Directory -Path $outputDirectory -Force
$releaseNames = @(
    '.env.example', '.gitignore', 'package.json', 'server.mjs', 'start.cmd',
    'README.md', 'DEMO.md', 'LICENSE', 'MCP_INTEGRATION.md',
    'CONTEST_DECLARATION.md', 'mcp-config.example.json',
    'public', 'lib', 'test', 'skills', 'docs', 'scripts'
)
$releasePaths = $releaseNames | ForEach-Object { Join-Path $projectRoot $_ }
foreach ($releasePath in $releasePaths) {
    if (-not (Test-Path -LiteralPath $releasePath)) { throw "Missing release item: $releasePath" }
}
$archivePath = Join-Path $outputDirectory 'maimai-budget-table-source.zip'
Compress-Archive -LiteralPath $releasePaths -DestinationPath $archivePath -Force
Write-Output "Source archive: $archivePath"
