# CORS Helper – Chrome Extension (MV3)

Developer-friendly Chrome extension to relax CORS for local testing.

## 📁 Structure
```
.
├── src/
│   ├── background/        # Service worker (background scripts)
│   ├── content/           # Content scripts injected into pages
│   ├── popup/             # Popup UI (html/js/css)
│   ├── options/           # Options page UI (html/js/css)
│   └── lib/               # Reusable helpers/utils
├── assets/
│   ├── icons/             # 16/32/48/128 png icons
│   ├── images/            # Screenshots & UI images
│   ├── css/               # Shared CSS
│   └── json/              # JSON samples or schema files
├── docs/                  # Architecture notes, screenshots
├── scripts/               # Packaging / tooling scripts
├── manifest.json          # Chrome MV3 manifest
├── package.json           # Optional (tooling)
├── .gitignore
├── LICENSE
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## ✨ Features (document here)
- Create folders & subfolders for conversations
- Multiple custom instruction profiles
- Prompt chains, templates, custom prompts
- Prompt history, favorites, public prompts
- Minimap overview of conversation
- Hide/show model lists; alphabetical sort
- Switch between GPT/Gemini/Claude etc.
- Pinned messages
- Export: PDF / Text / Markdown / JSON

> Keep this list accurate. If a feature needs extra permissions, explain why below.

## 🧩 Static Files & Manifest Mapping
- Icons → `assets/icons/` and referenced in `manifest.json`
- Popup → `src/popup/index.html` via `action.default_popup`
- Options → `src/options/index.html` via `options_page`
- Content scripts → `src/content/content.js` via `content_scripts[*].js`
- Public resources → `assets/*` via `web_accessible_resources`

## 🛠️ Local Dev
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

## 🚀 Build & Release
```bash
bash scripts/package.sh
```
Creates `release/<name>-<version>.zip` for the Chrome Web Store.

## 🔐 Permissions
- `storage` – store settings
- `activeTab` – contextual actions after user clicks
- `scripting` – inject scripts on-demand
- `tabs` – basic tab info (if needed for features)

Explain each permission you keep.

## 🧭 Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📝 Changelog
See [CHANGELOG.md](./CHANGELOG.md).

## 📄 License
MIT (replace if needed).
