<p align="center">
  <img src="src-tauri/icons/icon.png" alt="ShadowCrawler Logo" width="120" />
</p>

<h1 align="center" style="font-size:3em; font-weight:bold;">ShadowCrawler 🎮</h1>

> **The Ultimate Video Library Manager for Gamers!** 🚀

Transform your chaotic ShadowPlay recordings into an organized, video library! ShadowCrawler is designed specifically for **Windows gamers** who use **NVIDIA ShadowPlay** to capture moments with friends.

## ✨ What is ShadowCrawler?

ShadowCrawler automatically indexes and organizes your gaming videos, making it easy to:
- 📁 **Organize** videos by game, date, or custom folders  
- 🎬 **Preview** videos with thumbnails before playing
- ⚡ **Fast playback** with optimized video loading
- 🏷️ **Smart metadata** extraction (resolution, FPS, codec, duration)
- 🚀 **Multi-threaded processing** for lightning-fast database updates

Perfect for content creators, streamers, and gamers who want to quickly find that **epic clutch moment** or **funny fail** from last week!

## 🎯 Target Audience

- 🎮 **Gamers** using NVIDIA ShadowPlay/GeForce Experience
- 📹 **Content creators** managing large video libraries
- 🎪 **Streamers** organizing highlight reels
- 👥 **Gaming groups** sharing memorable moments
- 🏆 **Competitive players** reviewing gameplay footage

## 🖥️ System Requirements

- **Windows 10/11** (Primary platform)
- **NVIDIA GPU** with ShadowPlay/GeForce Experience
- **Node.js** and **pnpm** package manager
- **FFmpeg** and **FFprobe** command-line tools
- **Rust toolchain** with Windows GNU target

## 🚀 Quick Start

### 1. Prerequisites Installation

Open **PowerShell as Administrator** and install:

```powershell
# Install Node.js (if not already installed)
# Download from: https://nodejs.org/

# Install pnpm globally
npm install -g pnpm

# Install FFmpeg and FFprobe
# Download from: https://ffmpeg.org/download.html
# Or use chocolatey:
choco install ffmpeg

# Install Rust (if not already installed)
# Download from: https://rustup.rs/

```

### 2. Clone and Setup

```bash
git clone https://github.com/yourusername/shadowcrawler.git
cd shadowcrawler
pnpm install
```

### 3. Build the Application

```bash
pnpm tauri build 
```

### 4. First Run

1. 🎯 **Select your ShadowPlay directory** (usually `C:\Users\[Username]\Videos` or custom location)
2. 🔄 **Let ShadowCrawler index** your videos (first run may take a while)
3. 🎉 **Start browsing** your organized video library!

## ⚡ Performance Features

ShadowCrawler uses **multi-threading** to process your video library at lightning speed:

- 🧵 **Multi-threaded indexing** - Processes multiple videos simultaneously
- ⚡ **Parallel metadata extraction** - Analyzes video properties concurrently  
- 🚀 **Optimized database updates** - Batch operations for maximum speed
- 📊 **Load-balanced processing** - Distributes work across CPU cores efficiently

This means even libraries with **thousands of videos** can be indexed in minutes, not hours!

## 📁 Database Storage

ShadowCrawler stores its video database at:
```
%APPDATA%\shadowcrawler\videos.db
```

The database contains:
- Video metadata (resolution, FPS, codec, duration)
- Folder organization data
- Search indexes
- Thumbnail references

## Technology Stack

- **Tauri** - Desktop application framework
- **React 19** - Frontend framework
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **SQLite** - Database storage

## Features

- Search functionality (by name, game, or metadata)
- User interface with video player
- Thumbnail generation
- Automatic metadata extraction
- Folder management
- Video playback controls

## Contributing

Contributions are welcome. Please feel free to submit issues, feature requests, or pull requests.

<!-- ## License

This project is open source and available under the [MIT License](LICENSE). -->
