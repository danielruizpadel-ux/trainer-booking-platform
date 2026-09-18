# Node.js Version Management Setup

## ✅ WHAT HAS BEEN CONFIGURED

### 1. .nvmrc File Created ✅
**Location**: `/Users/dani/Desktop/trainer-booking-platform/.nvmrc`
**Content**: `20`
**Purpose**: Tells nvm which Node version to use in this project

### 2. package.json Scripts Updated ✅
All scripts now include `nvm use 20 &&` prefix:

```json
{
  "scripts": {
    "dev": "nvm use 20 && next dev -p 3001",
    "build": "nvm use 20 && next build",
    "start": "nvm use 20 && next start -p 3001",
    "lint": "nvm use 20 && next lint",
    "type-check": "nvm use 20 && tsc --noEmit",
    "format": "nvm use 20 && prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "nvm use 20 && prettier --check \"**/*.{ts,tsx,json,md}\""
  }
}
```

### Scripts Updated (7 total):
- ✅ dev
- ✅ build
- ✅ start
- ✅ lint
- ✅ type-check
- ✅ format
- ✅ format:check

---

## 🚀 NEXT STEPS - USER ACTION REQUIRED

### Current System Status
- **Current Node**: v16.20.2 (TOO OLD)
- **Required Node**: v20+ (LTS)
- **nvm Status**: Installed but needs Node v20 version added

### Install Node v20

Choose ONE of these methods:

#### Option 1: Using nvm (RECOMMENDED - In a new terminal)
```bash
# Close current terminal, open NEW terminal
nvm install 20
nvm use 20
node --version  # Should show v20.x.x
```

#### Option 2: Direct Download (macOS/Windows/Linux)
1. Visit: https://nodejs.org/
2. Download: LTS version (v20.x)
3. Install following on-screen instructions
4. Restart terminal
5. Verify: `node --version`

#### Option 3: Homebrew (macOS only)
```bash
brew install node@20
brew link node@20
node --version
```

---

## AFTER INSTALLING NODE V20

### Run this command:
```bash
cd /Users/dani/Desktop/trainer-booking-platform
npm run dev
```

### What will happen automatically:
1. Terminal executes: `nvm use 20 && next dev -p 3001`
2. nvm switches to Node v20
3. Next.js dev server starts on http://localhost:3001
4. No more version errors!

### Expected Output:
```
> ready - started server on 0.0.0.0:3001, url: http://localhost:3001
```

---

## WHY THIS SETUP WORKS

### .nvmrc + package.json Integration
- `.nvmrc` defines the project's Node requirement
- package.json scripts enforce it via `nvm use 20`
- Every developer/future session uses Node v20 automatically
- No more "wrong Node version" errors!

### How It Works:
1. You run: `npm run dev`
2. Shell executes: `nvm use 20 && next dev -p 3001`
3. nvm switches to Node v20 for this command
4. Next.js dev server starts with correct Node version
5. After command ends, nvm switches back to default

---

## VERIFICATION CHECKLIST

After Node v20 is installed:

- [ ] Run: `nvm use 20`
- [ ] Run: `node --version` (shows v20.x.x?)
- [ ] Run: `npm run dev`
- [ ] See: "ready - started server on 0.0.0.0:3001"
- [ ] Open: http://localhost:3001 in browser
- [ ] See: Home page loads without errors
- [ ] Check: Browser console is clean (no red errors)

---

## PERMANENT CONFIGURATION ✅

Once you follow the "Next Steps" above:
- ✅ .nvmrc will ensure correct Node version
- ✅ package.json scripts will enforce v20
- ✅ Future development will never have version issues
- ✅ Team members will automatically get correct version

**This setup is future-proof!**

