# Distribution Guide

This guide explains how to package Draft Punk for distribution to others.

## Prerequisites

- Node.js 18+ installed
- Electron installed globally: `npm install -g electron`
- All project dependencies installed: `npm install`

## Building the MSI Installer

### Quick Start

```bash
npm run package:msi
```

This will:
1. Build the app (compile TypeScript, bundle React, etc.)
2. Create an MSI installer at `dist/Draft Punk X.X.X.msi`

### Build Both Installers (NSIS + MSI)

```bash
npm run package:win
```

This creates both installer types:
- **NSIS** (`Draft Punk Setup X.X.X.exe`) - Recommended for most users
- **MSI** (`Draft Punk X.X.X.msi`) - Better for enterprise/managed environments

## Distribution Options

### 1. Direct Download
- Upload the MSI file to your website or file hosting service
- Users download and run the installer
- Standard Windows installation experience

### 2. Network Share
- Place the MSI on a network share
- Users can install directly from the share
- Useful for internal team distribution

### 3. Group Policy Deployment
- MSI files can be deployed via Active Directory Group Policy
- Ideal for enterprise environments

## Customization

### Add a Custom Icon

**Option 1: Generate from PNG (Recommended)**

1. Create or save a PNG icon file (1024x1024 recommended)
   - Place in the `assets` directory
   - Name it something like `icon_1024.png`

2. Generate the icon:
   ```bash
   npm run build:icon
   ```
   This creates `build/icon.ico` with multiple sizes embedded

3. Rebuild: `npm run package:msi`

**Option 2: Use an existing .ico file**

1. Create an icon file (`.ico` format)
   - Recommended size: 256x256 or larger
   - Can include multiple sizes: 16x16, 32x32, 48x48, 256x256
   - Tools: [IcoFX](https://icofx.ro/), [GIMP](https://www.gimp.org/), online converters

2. Save as `build/icon.ico`

3. Rebuild: `npm run package:msi`

### Update Version Number

Edit `package.json`:
```json
{
  "version": "1.0.0"
}
```

This version appears in the installer filename and app metadata.

### Update App Details

Edit `electron-builder.json`:
```json
{
  "appId": "com.draftpunk.app",
  "productName": "Draft Punk"
}
```

### Customize MSI Options

Edit the `msi` section in `electron-builder.json`:
```json
{
  "msi": {
    "oneClick": false,           // Show install wizard
    "perMachine": true,           // Install for all users
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "menuCategory": true          // Create Start Menu folder
  }
}
```

## Installer Details

### What's Included

- Application executable
- All dependencies bundled
- Desktop shortcut
- Start Menu shortcut
- Uninstaller

### Installation Location

- Default: `C:\Program Files\Draft Punk\`
- Users can choose a different location during install

### System Requirements

- Windows 10 or later (64-bit)
- ~200 MB disk space
- Internet connection (for draft polling)

## Testing the Installer

Before distributing:

1. **Clean install test**
   - Install on a fresh Windows machine or VM
   - Verify app launches and works correctly
   - Check that Electron global requirement is noted in docs

2. **Upgrade test**
   - Install an old version
   - Install the new version over it
   - Verify settings are preserved (localStorage)

3. **Uninstall test**
   - Uninstall via Windows Settings
   - Verify all files are removed
   - Check that user data (localStorage) behavior is as expected

## Troubleshooting

### Build Fails

**Error: "electron-builder not found"**
```bash
npm install --save-dev electron-builder
```

**Error: "Cannot create MSI"**
- Ensure you're running on Windows
- MSI building requires Windows WiX Toolset (installed automatically by electron-builder)

### Installer Issues

**Users report "Windows protected your PC"**
- This is normal for unsigned installers
- Users need to click "More info" → "Run anyway"
- To avoid: Sign the installer with a code signing certificate (costs money)

**App won't start after install**
- Ensure user has installed Electron globally: `npm install -g electron`
- This requirement is documented in the README

## Code Signing (Optional)

For a professional installer without security warnings:

1. Purchase a code signing certificate (~$100-400/year)
   - Providers: DigiCert, Sectigo, GlobalSign

2. Add to `electron-builder.json`:
```json
{
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "your-password"
  }
}
```

3. Rebuild

Signed installers won't trigger Windows SmartScreen warnings.

## Version Management

### Semantic Versioning

Follow [SemVer](https://semver.org/):
- **1.0.0** → **1.0.1** - Bug fixes
- **1.0.0** → **1.1.0** - New features (backward compatible)
- **1.0.0** → **2.0.0** - Breaking changes

### Changelog

Keep a `CHANGELOG.md` to track changes:
```markdown
## [1.1.0] - 2026-01-20
### Added
- Rookie pick mode with kicker tracking
- Dark mode punk aesthetic
- Improved name normalization

### Fixed
- Players with hyphens now matched correctly
```

## Support

For distribution issues:
- Check [electron-builder docs](https://www.electron.build/)
- Windows Installer: [MSI documentation](https://docs.microsoft.com/en-us/windows/win32/msi)
