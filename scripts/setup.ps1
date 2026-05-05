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

function Install-Prerequisites {
    if ($NoDeps) {
        Write-Info 'Skipping prerequisite installation (-NoDeps)'
        return
    }

    # Check for gh CLI
    if (-not (Command-Exists 'gh')) {
        Write-Info 'GitHub CLI (gh) is not installed.'
        Write-Info 'Install it from https://cli.github.com/ for the best experience.'
        Write-Info 'On Windows: winget install --id GitHub.cli'
        return
    }

    # Check gh auth
    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Info 'GitHub CLI needs authentication. Starting login...'
        if (-not $DryRun) {
            & gh auth login
        } else {
            Write-Info 'Would run: gh auth login'
        }
    }

    # GitHub Copilot CLI extension
    $copilotCheck = & gh copilot --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info 'Installing GitHub Copilot CLI extension...'
        if (-not $DryRun) {
            & gh extension install github/gh-copilot 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warn 'Could not install Copilot extension (may require Copilot license)'
            }
        }
    }
}

function New-GitHubRepo {
    if (-not (Command-Exists 'gh')) {
        Write-Warn 'gh is not installed. Skipping GitHub repository creation.'
        return
    }

    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'gh is not authenticated. Skipping GitHub repository creation.'
        return
    }

    # If a remote already exists, skip
    $remoteUrl = & git -C $RootDir remote get-url origin 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Git remote 'origin' already configured; skipping repo creation"
        return
    }

    $repoName = Split-Path -Leaf $RootDir
    Write-Info "Creating private GitHub repository '$repoName'..."

    if ($DryRun) {
        Write-Info "Would run: gh repo create $repoName --private --source $RootDir --push"
        return
    }

    # Initial commit so we have something to push
    & git -C $RootDir add -A
    & git -C $RootDir commit -q -m "Initial commit: EPS Parent Manager toolkit v$CurrentVersion" 2>&1 | Out-Null

    $result = & gh repo create $repoName --private --source $RootDir --push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Info 'GitHub repository created and pushed successfully'
    } else {
        Write-Warn "Could not create GitHub repository. You can do this manually later with: gh repo create"
    }
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

function Get-FrontMatterValue {
    param(
        [string]$FrontMatter,
        [string]$Key
    )

    foreach ($line in ($FrontMatter -split "`r?`n")) {
        if ($line -match "^$([regex]::Escape($Key)):\s*(.+)$") {
            return $matches[1].Trim().Trim('"')
        }
    }

    return $null
}

function Get-LabelMetadata {
    param([string]$Label)

    switch ($Label) {
        'onboarding' { return @{ Color = '0075ca'; Description = 'Setup and onboarding steps' } }
        'no-credentials-needed' { return @{ Color = '0e8a16'; Description = 'Safe to start anytime' } }
        'credentials' { return @{ Color = 'd73a4a'; Description = 'Involves secrets or passwords' } }
        'infinite-campus' { return @{ Color = '1d76db'; Description = 'Infinite Campus integration' } }
        'canvas' { return @{ Color = 'd93f0b'; Description = 'Canvas LMS integration' } }
        'most-complex' { return @{ Color = '5319e7'; Description = 'Read carefully - most involved step' } }
        'google' { return @{ Color = 'fbca04'; Description = 'Google Workspace integration' } }
        'obsidian' { return @{ Color = '7057ff'; Description = 'Obsidian vault setup' } }
        'verification' { return @{ Color = '0e8a16'; Description = 'Health check and verification' } }
        'optional' { return @{ Color = 'e4e669'; Description = 'Nice-to-have, not required' } }
        default { return @{ Color = 'ededed'; Description = 'Guided setup label' } }
    }
}

function Get-IssueNumberFromJson {
    param([string]$Json)

    if ([string]::IsNullOrWhiteSpace($Json)) {
        return $null
    }

    try {
        $parsed = $Json | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
            if ($parsed.Count -gt 0 -and $parsed[0].number) {
                return [string]$parsed[0].number
            }
        }
        elseif ($parsed.number) {
            return [string]$parsed.number
        }
    }
    catch {
        return $null
    }

    return $null
}

function Create-OnboardingIssues {
    $onboardingDir = Join-Path $ScriptDir 'onboarding'
    $stepOneTitle = '⭐ Step 1: Set up your family profile'
    $stepOneNumber = $null

    if (-not (Test-Path $onboardingDir)) {
        Write-Warn 'scripts/onboarding/ not found; skipping guided setup issues.'
        return
    }
    if (-not (Command-Exists 'gh')) {
        Write-Info 'Install GitHub CLI (gh) to get guided setup issues: https://cli.github.com/'
        return
    }

    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Info "GitHub CLI is installed, but not authenticated. Run 'gh auth login' to get guided setup issues."
        return
    }

    & gh repo view *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'GitHub CLI could not determine the current GitHub repository. Skipping guided setup issues.'
        return
    }

    $templates = Get-ChildItem -Path $onboardingDir -Filter '*.md' | Sort-Object Name
    if (-not $templates) {
        Write-Warn 'No onboarding issue templates found in scripts/onboarding/.'
        return
    }

    if ($DryRun) {
        Write-Info 'Would prepare onboarding issue bodies in .eps-setup-workdir'
    }
    else {
        New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
    }

    foreach ($template in $templates) {
        $raw = Get-Content -Path $template.FullName -Raw
        if ($raw -notmatch '(?ms)^---\r?\n(.*?)\r?\n---\r?\n?(.*)$') {
            Write-Warn "Template is missing valid frontmatter: $($template.FullName)"
            continue
        }

        $frontMatter = $matches[1]
        $body = $matches[2]
        $title = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'title'
        $labelsCsv = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'labels'
        $step = Get-FrontMatterValue -FrontMatter $frontMatter -Key 'step'

        if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($labelsCsv) -or [string]::IsNullOrWhiteSpace($step)) {
            Write-Warn "Template is missing required frontmatter: $($template.FullName)"
            continue
        }

        $labels = @($labelsCsv -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        foreach ($label in $labels) {
            $metadata = Get-LabelMetadata -Label $label
            if ($DryRun) {
                Write-Info "Would ensure GitHub label '$label' exists"
            }
            else {
                & gh label create $label --color $metadata.Color --description $metadata.Description --force *> $null
                if ($LASTEXITCODE -ne 0) {
                    Write-Warn "Could not ensure GitHub label '$label'. Skipping guided setup issues."
                    return
                }
            }
        }

        $existingJson = (& gh issue list --state all --limit 1 --search "`"$title`" in:title" --json number 2>$null) -join "`n"
        $issueNumber = Get-IssueNumberFromJson -Json $existingJson
        if ($issueNumber) {
            Write-Info "Guided setup issue already exists for step $step: $title"
            if ($title -eq $stepOneTitle) {
                $stepOneNumber = $issueNumber
            }
            continue
        }

        $bodyFile = Join-Path $WorkDir ("onboarding-body-{0}.md" -f $step)
        if ($DryRun) {
            Write-Info "Would create guided setup issue for step $step: $title"
            continue
        }

        try {
            Set-Content -Path $bodyFile -Value $body -NoNewline
            $createArgs = @('issue', 'create', '--title', $title, '--body-file', $bodyFile)
            foreach ($label in $labels) {
                $createArgs += @('--label', $label)
            }
            & gh @createArgs *> $null
            if ($LASTEXITCODE -eq 0) {
                Write-Info "Created guided setup issue for step $step"
                $createdJson = (& gh issue list --state all --limit 1 --search "`"$title`" in:title" --json number 2>$null) -join "`n"
                $createdNumber = Get-IssueNumberFromJson -Json $createdJson
                if ($title -eq $stepOneTitle) {
                    $stepOneNumber = $createdNumber
                }
            }
            else {
                Write-Warn "Could not create guided setup issue for step $step: $title"
            }
        }
        finally {
            if (Test-Path $bodyFile) {
                Remove-Item -Path $bodyFile -Force
            }
        }
    }

    if ($stepOneNumber) {
        if ($DryRun) {
            Write-Info "Would pin guided setup issue #$stepOneNumber"
        }
        else {
            & gh issue pin -h *> $null
            if ($LASTEXITCODE -eq 0) {
                & gh issue pin $stepOneNumber *> $null
            }
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

    # Install prerequisites first (gh, gh auth) so they're available for later steps
    Install-Prerequisites

    Ensure-PersonalFile -SourcePath (Join-Path $RootDir '.env.example') -TargetPath (Join-Path $RootDir '.env')
    Ensure-PersonalFile -SourcePath (Join-Path $RootDir 'config/personal.yaml.example') -TargetPath (Join-Path $RootDir 'config/personal.yaml')
    Seed-Vault
    Initialize-Git
    Write-VersionFile $CurrentVersion
    Install-Dependencies

    # Create GitHub repo, initial commit, and push
    New-GitHubRepo

    # Create onboarding issues (requires a GitHub remote to exist)
    Create-OnboardingIssues

    # Determine the repo URL for the final message
    $repoUrl = $null
    if ((Command-Exists 'gh')) {
        & gh auth status *> $null
        if ($LASTEXITCODE -eq 0) {
            & gh repo view *> $null
            if ($LASTEXITCODE -eq 0) {
                $repoUrl = (& gh repo view --json url -q '.url' 2>$null)
            }
        }
    }

    Write-Info 'Done!'
    Write-Host ''
    if ($repoUrl) {
        Write-Host "✅ Your family toolkit is ready!"
        Write-Host ''
        Write-Host "Your repo: $repoUrl"
        Write-Host "Issues:    $repoUrl/issues"
        Write-Host ''
        Write-Host "Next steps — work through the guided setup issues in order:"
        Write-Host "  $repoUrl/issues"
        Write-Host ''
        Write-Host 'Each issue walks you through one piece of configuration:'
        Write-Host '  credentials, family profile, integrations, and verification.'
        Write-Host ''
        Write-Host 'Later, run .\scripts\setup.ps1 -Update to pull template updates.'
    } else {
        Write-Host 'Next steps:'
        Write-Host "  1. Run 'gh auth login' and then 'gh repo create' to push to GitHub."
        Write-Host '  2. Fill in .env with your Infinite Campus, Canvas, and Google credentials.'
        Write-Host '  3. Review config/personal.yaml for your family details.'
        Write-Host '  4. Open vault/ in Obsidian and start using the templates.'
        Write-Host '  5. Run .\scripts\setup.ps1 -Update later to pull template updates.'
    }
}

$hasPersonalLayer = (Test-Path (Join-Path $RootDir 'vault')) -or (Test-Path (Join-Path $RootDir '.env')) -or (Test-Path (Join-Path $RootDir 'config/personal.yaml'))
$mode = if ($Update -or ((Test-Path $VersionFile) -and $hasPersonalLayer)) { 'update' } else { 'install' }

try {
    if ($mode -eq 'update') {
        Invoke-UpdateMode
    }
    else {
        Invoke-InstallMode
    }
}
finally {
    if ((-not $DryRun) -and (Test-Path $WorkDir)) {
        Remove-Item -Path $WorkDir -Recurse -Force
    }
}
