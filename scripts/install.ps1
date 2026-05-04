Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoOwner = 'x3nc0n'
$RepoName = 'eps-parent-manager'
$Branch = 'main'
$DryRun = $false
$ForwardArgs = New-Object System.Collections.Generic.List[string]

function Write-Info([string]$Message) { Write-Host "[install] $Message" }
function Fail([string]$Message) { throw "[install] $Message" }
function Command-Exists([string]$Name) { return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

for ($i = 0; $i -lt $args.Count; $i++) {
    switch ($args[$i]) {
        '--branch' {
            if ($i + 1 -ge $args.Count) { Fail '--branch requires a value' }
            $Branch = $args[$i + 1]
            $ForwardArgs.Add($args[$i])
            $ForwardArgs.Add($args[$i + 1])
            $i++
        }
        '--dry-run' {
            $DryRun = $true
            $ForwardArgs.Add($args[$i])
        }
        default {
            $ForwardArgs.Add($args[$i])
        }
    }
}

if (-not (Command-Exists 'tar')) { Fail 'tar is required to unpack the toolkit.' }
$targetDir = Join-Path (Get-Location) $RepoName
$archivePath = Join-Path (Get-Location) ".${RepoName}-$Branch.tar.gz"
$tarballUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.tar.gz"

if ((Test-Path $targetDir) -and (Get-ChildItem -Path $targetDir -Force | Select-Object -First 1)) {
    Fail "Target directory '$targetDir' already exists and is not empty. Choose a new folder and rerun the installer."
}

Write-Info "Preparing $RepoName from branch '$Branch'"
if ($DryRun) {
    Write-Info "Would download $tarballUrl"
    Write-Info "Would extract into $targetDir and run scripts/setup.ps1 $($ForwardArgs -join ' ')"
    return
}

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
try {
    Invoke-WebRequest -Uri $tarballUrl -OutFile $archivePath
    tar -xzf $archivePath -C $targetDir --strip-components=1
    & (Join-Path $targetDir 'scripts/setup.ps1') @ForwardArgs
}
finally {
    if (Test-Path $archivePath) {
        Remove-Item -Path $archivePath -Force
    }
}
