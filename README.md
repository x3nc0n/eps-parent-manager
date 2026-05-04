# EPS Parent Manager

EPS Parent Manager is a parent-owned toolkit for syncing school systems into a local workflow without sending family data upstream.

## Install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/x3nc0n/eps-parent-manager/main/scripts/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/x3nc0n/eps-parent-manager/main/scripts/install.ps1 | iex
```

## Local setup and updates

```bash
./scripts/setup.sh
./scripts/setup.sh --update
```

```powershell
.\scripts\setup.ps1
.\scripts\setup.ps1 -Update
```

Personal data lives in `vault/`, `.env`, and `config/personal.yaml`. Updates only replace template-layer files listed in `scripts/template-manifest.txt`.
