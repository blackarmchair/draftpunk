# Draft Punk

A desktop application for tracking Sleeper dynasty draft picks in real-time. Built with Electron, React, and TypeScript.

## Features

- **CSV Rankings Import**: Load your player rankings from a CSV file
- **Real-time Draft Tracking**: Automatically marks players as taken based on Sleeper API picks
- **Smart Name Matching**: Handles name variations and common aliases
- **Manual Override**: Toggle taken/available status for any player
- **Advanced Filtering**: Search by name, filter by position, hide/show taken players
- **Tier Grouping**: Organize players by tier with pressure indicators
- **Activity Logging**: Track all sync events and errors
- **Settings Persistence**: Your draft settings are saved locally

## Requirements

- Node.js 18 or higher
- npm or yarn
- Electron installed globally (required for Windows)

## Installation

1. Clone or download this repository

2. Install Electron globally (Windows requirement):

```bash
npm install -g electron
```

3. Install project dependencies:

```bash
npm install
```

## Running the App

### Development Mode

```bash
npm run dev
```

This starts the app in development mode with hot-reload enabled.

### Production Build

```bash
npm run build
npm run preview
```

### Package for Distribution

```bash
npm run package
```

This creates a distributable package for your operating system in the `dist` folder.

### Create MSI Installer for Windows

To create an MSI installer that others can use to install the app:

```bash
npm run package:msi
```

Or to create both NSIS and MSI installers:

```bash
npm run package:win
```

The installers will be created in the `dist` folder:
- `Draft Punk Setup X.X.X.exe` - NSIS installer (recommended for most users)
- `Draft Punk X.X.X.msi` - MSI installer (for enterprise/managed deployments)

**Optional: Add a Custom Icon**

1. Create a `build` folder in the project root
2. Add a `icon.ico` file (256x256 or larger recommended)
3. Rebuild the package

The MSI installer includes:
- Desktop shortcut
- Start menu shortcut
- Per-machine installation (all users)
- Standard Windows installer experience

## Usage

### 1. Prepare Your Rankings CSV

Create a CSV file with the following columns (case-insensitive):

- `name` (required): Player name
- `tier` (required): Tier number or name
- `pos` or `position` (required): Player position (QB, RB, WR, TE, etc.)
- `assetType` (optional): Asset type (e.g., "PLAYER", "2026 1.01")

Example CSV:

```csv
name,tier,pos,assetType
Bijan Robinson,1,RB,PLAYER
Breece Hall,1,RB,PLAYER
Ja'Marr Chase,1,WR,PLAYER
2026 1.01,1,PICK,PICK
```

### 2. Load Your Rankings

1. Launch the app
2. Click "Load CSV File"
3. Select your rankings CSV file
4. The app will display the total number of players loaded

### 3. Configure Draft Settings

1. Find your Sleeper Draft ID:
   - Go to your Sleeper draft room
   - Look at the URL: `sleeper.com/draft/nfl/987654321098765432`
   - Copy the long number after `/draft/nfl/` (in this example: `987654321098765432`)

2. Enter the Draft ID in the settings panel
3. Optionally adjust the poll interval (default: 5000ms = 5 seconds)
4. Click "Start Polling"

### 4. Track Your Draft

- The app will poll the Sleeper API at the specified interval
- Players will be automatically marked as taken when picked
- Use the filters to find available players quickly
- Toggle "Hide Taken" to focus on available players only
- Group by tier to see tier pressure (remaining count)
- Manually override any player's taken status by clicking the checkbox

### 5. Filtering and Search

- **Search**: Type a player name to filter the table
- **Position Filter**: Select a position (QB, RB, WR, TE, etc.) to show only that position
- **Hide Taken**: Toggle to show/hide already-picked players
- **Group by Tier**: Toggle to organize players by tier with pressure indicators

## Name Matching

The app uses smart name normalization to match players:

- Handles case differences
- Removes punctuation (. , ' " -)
- Removes suffixes (Jr, Sr, II, III, IV)
- Supports common aliases (configurable in `src/renderer/src/data/aliases.ts`)

### Adding Custom Aliases

Edit [src/renderer/src/data/aliases.ts](src/renderer/src/data/aliases.ts) to add name variations:

```typescript
export const nameAliases: Record<string, string> = {
  'd k metcalf': 'dk metcalf',
  'gabe davis': 'gabriel davis',
  // Add your custom aliases here
}
```

## Troubleshooting

### Players Not Being Marked as Taken

1. Check that the Draft ID is correct
2. Verify the player names in your CSV match those in Sleeper
3. Check the Activity Log for sync errors
4. Try adding a custom alias for the player
5. Manually toggle the taken status as a workaround

### Sync Errors

- Ensure you have an active internet connection
- Verify the Draft ID is correct and the draft has started
- Check the Activity Log for specific error messages
- The app will continue retrying on each poll interval

### CSV Loading Errors

- Ensure your CSV has the required columns: name, tier, pos/position
- Check that the CSV is properly formatted (comma-separated)
- Remove any extra commas or special characters
- Verify the file encoding is UTF-8

## Tech Stack

- **Electron**: Desktop app framework
- **React**: UI framework
- **TypeScript**: Type-safe development
- **electron-vite**: Fast Vite-based build tool
- **Sleeper API**: Real-time draft pick data

## Project Structure

```
draftPunk/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Electron preload scripts
│   └── renderer/       # React app
│       └── src/
│           ├── components/    # React components
│           ├── services/      # API services
│           ├── utils/         # Utilities
│           ├── data/          # Static data (aliases)
│           └── types.ts       # TypeScript types
├── electron.vite.config.ts
├── package.json
└── README.md
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Credits

Built with [electron-vite](https://electron-vite.org/)

Draft data from [Sleeper API](https://docs.sleeper.com/)
