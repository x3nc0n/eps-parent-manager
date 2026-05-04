[CmdletBinding()]
param(
    [switch]$Update,
    [string]$VaultPath,
    [string]$Branch = 'main',
    [switch]$DryRun,
    [switch]$NoDeps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$RepoOwner = 'x3nc0n'
$RepoName = 'eps-parent-manager'
$VersionFile = Join-Path $RootDir '.eps-toolkit-version'
$WorkDir = Join-Path $RootDir '.eps-setup-workdir'
$CurrentVersion = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { '0.1.0' }

function Write-Info([string]$Message) { Write-Host "[setup] $Message" }
function Write-Warn([string]$Message) { Write-Warning $Message }
function Fail([string]$Message) { throw "[setup] $Message" }
function Command-Exists([string]$Name) { return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Invoke-Step {
    param(
        [string]$Description,
        [scriptblock]$Action
    )

    if ($DryRun) {
        Write-Info "Would $Description"
    }
    else {
        & $Action
    }
}

function Write-VersionFile([string]$Value) {
    if ($DryRun) {
        Write-Info "Would write .eps-toolkit-version = $Value"
    }
    else {
        Set-Content -Path $VersionFile -Value $Value -NoNewline
    }
}

function Initialize-Git {
    $gitDir = Join-Path $RootDir '.git'
    if (Test-Path $gitDir) {
        Write-Info 'Git repository already exists; skipping git init'
        return
    }
    if (-not (Command-Exists 'git')) {
        Write-Warn 'git is not installed. Skipping repository initialization.'
        return
    }

    Invoke-Step 'initialize a fresh git repository' { git -C $RootDir init -q | Out-Null }
}

function Install-Dependencies {
    if ($NoDeps) {
        Write-Info 'Skipping dependency installation (-NoDeps)'
        return
    }

    $packageJson = Join-Path $RootDir 'package.json'
    if (-not (Test-Path $packageJson)) {
        Write-Warn 'package.json not found. Skipping npm install.'
        return
    }
    if (-not (Command-Exists 'node')) {
        Write-Warn 'node is not installed. Skipping npm install.'
        return
    }
    if (-not (Command-Exists 'npm')) {
        Write-Warn 'npm is not installed. Skipping npm install.'
        return
    }

    if ($DryRun) {
        Write-Info 'Would run npm install'
    }
    else {
        Write-Info 'Installing npm dependencies'
        Push-Location $RootDir
        try {
            npm install
        }
        finally {
            Pop-Location
        }
    }
}

function Ensure-PersonalFile {
    param(
        [string]$SourcePath,
        [string]$TargetPath
    )

    if (Test-Path $TargetPath) {
        Write-Info "Keeping existing $([System.IO.Path]::GetRelativePath($RootDir, $TargetPath))"
        return
    }
    if (-not (Test-Path $SourcePath)) {
        Write-Warn "Template file not found: $SourcePath"
        return
    }

    $parent = Split-Path -Parent $TargetPath
    if ($parent) {
        Invoke-Step "create $([System.IO.Path]::GetRelativePath($RootDir, $parent))" { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    }
    Invoke-Step "copy $([System.IO.Path]::GetRelativePath($RootDir, $TargetPath))" { Copy-Item -Path $SourcePath -Destination $TargetPath -Force }
}

function Seed-Vault {
    $vaultLink = Join-Path $RootDir 'vault'
    $templateDir = Join-Path $RootDir 'vault-template'

    if ($VaultPath) {
        if (-not (Test-Path $VaultPath)) {
            Fail "Vault path does not exist: $VaultPath"
        }

        if (Test-Path $vaultLink) {
            $existing = Get-Item $vaultLink -Force
            if ($existing.LinkType -in @('Junction', 'SymbolicLink')) {
                if ($existing.Target -eq $VaultPath) {
                    Write-Info "Vault link already points to $VaultPath"
                    return
                }
                Invoke-Step 'remove the existing vault link' { Remove-Item -Path $vaultLink -Force }
            }
            elseif ((Get-ChildItem -Path $vaultLink -Force | Select-Object -First 1)) {
                Write-Warn 'vault/ already exists with content. Leaving it in place instead of replacing it with a link.'
                return
            }
            else {
                Invoke-Step 'remove the empty vault directory' { Remove-Item -Path $vaultLink -Force }
            }
        }

        Invoke-Step "link vault/ to $VaultPath" { New-Item -ItemType Junction -Path $vaultLink -Target $VaultPath | Out-Null }
        return
    }

    if ((Test-Path $vaultLink) -and (Get-ChildItem -Path $vaultLink -Force | Select-Object -First 1)) {
        Write-Info 'Keeping existing vault/ contents'
        return
    }

    Invoke-Step 'create vault/' { New-Item -ItemType Directory -Path $vaultLink -Force | Out-Null }
    if (Test-Path $templateDir) {
        Invoke-Step 'seed vault/ from vault-template/' {
            Get-ChildItem -Path $templateDir -Force | Copy-Item -Destination $vaultLink -Recurse -Force
        }
    }
    else {
        Write-Warn 'vault-template/ not found; created empty vault/ directory'
    }
}

function Copy-OverlayPath {
    param(
        [string]$SourceRoot,
        [string]$RelativePath
    )

    switch -Wildcard ($RelativePath) {
        'vault/*' { Write-Warn "Skipping protected personal path from manifest: $RelativePath"; return }
        '.env' { Write-Warn "Skipping protected personal path from manifest: $RelativePath"; return }
        'config/personal.yaml' { Write-Warn "Skipping protected personal path from manifest: $RelativePath"; return }
        'config/schools.yaml' { Write-Warn "Skipping protected personal path from manifest: $RelativePath"; return }
        'node_modules/*' { Write-Warn "Skipping protected personal path from manifest: $RelativePath"; return }
    }

    $sourcePath = Join-Path $SourceRoot $RelativePath
    $targetPath = Join-Path $RootDir $RelativePath
    if (-not (Test-Path $sourcePath)) {
        Write-Warn "Manifest entry missing from downloaded template: $RelativePath"
        return
    }

    if ((Get-Item $sourcePath).PSIsContainer) {
        Invoke-Step "overlay directory $RelativePath" {
            New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
            Get-ChildItem -Path $sourcePath -Force | Copy-Item -Destination $targetPath -Recurse -Force
        }
    }
    else {
        $parent = Split-Path -Parent $targetPath
        Invoke-Step "overlay file $RelativePath" {
            if ($parent) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }
            Copy-Item -Path $sourcePath -Destination $targetPath -Force
        }
    }
}

function Invoke-UpdateMode {
    if (-not (Test-Path $VersionFile)) {
        Fail 'No .eps-toolkit-version found. Run setup.ps1 without -Update first.'
    }
    if (-not (Command-Exists 'tar')) {
        Fail 'tar is required to unpack updates.'
    }

    $previousVersion = (Get-Content $VersionFile -Raw).Trim()
    $tarballUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.tar.gz"
    $archivePath = Join-Path $WorkDir 'repo.tar.gz'
    $extractDir = Join-Path $WorkDir 'source'

    if ($DryRun) {
        Write-Info "Would download and extract $tarballUrl"
        return
    }

    if (Test-Path $WorkDir) {
        Remove-Item -Path $WorkDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    try {
        Write-Info "Updating template layer from $tarballUrl"
        Invoke-WebRequest -Uri $tarballUrl -OutFile $archivePath
        tar -xzf $archivePath -C $extractDir --strip-components=1

        $manifestPath = Join-Path $extractDir 'scripts/template-manifest.txt'
        if (-not (Test-Path $manifestPath)) {
            Fail 'Downloaded template is missing scripts/template-manifest.txt'
        }

        foreach ($entry in Get-Content $manifestPath) {
            $trimmed = ($entry -replace '#.*$', '').Trim()
            if ($trimmed) {
                Copy-OverlayPath -SourceRoot $extractDir -RelativePath $trimmed
            }
        }

        $nextVersion = if (Test-Path (Join-Path $extractDir '.eps-toolkit-version')) { (Get-Content (Join-Path $extractDir '.eps-toolkit-version') -Raw).Trim() } else { $previousVersion }
        Write-VersionFile $nextVersion
        Write-Info "Template updated: $previousVersion -> $nextVersion"
        Install-Dependencies
        Write-Info 'Update complete. Personal files in vault/, .env, and config/ were left untouched.'
    }
    finally {
        if (Test-Path $WorkDir) {
            Remove-Item -Path $WorkDir -Recurse -Force
        }
    }
}

function Invoke-InstallMode {
    Write-Info "Running first-time setup for EPS Parent Manager $CurrentVersion"
    Ensure-PersonalFile -SourcePath (Join-Path $RootDir '.env.example') -TargetPath (Join-Path $RootDir '.env')
    Ensure-PersonalFile -SourcePath (Join-Path $RootDir 'config/personal.yaml.example') -TargetPath (Join-Path $RootDir 'config/personal.yaml')
    Seed-Vault
    Initialize-Git
    Write-VersionFile $CurrentVersion
    Install-Dependencies

    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '  1. Fill in .env with your Infinite Campus, Canvas, and Google credentials.'
    Write-Host '  2. Review config/personal.yaml for your family details.'
    Write-Host '  3. Open vault/ in Obsidian and start using the templates.'
    Write-Host '  4. Run .\scripts\setup.ps1 -Update later to pull template updates.'
}

$hasPersonalLayer = (Test-Path (Join-Path $RootDir 'vault')) -or (Test-Path (Join-Path $RootDir '.env')) -or (Test-Path (Join-Path $RootDir 'config/personal.yaml'))
$mode = if ($Update -or ((Test-Path $VersionFile) -and $hasPersonalLayer)) { 'update' } else { 'install' }

if ($mode -eq 'update') {
    Invoke-UpdateMode
}
else {
    Invoke-InstallMode
}
