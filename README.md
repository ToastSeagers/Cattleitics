# Cattleitics

**Cattleitics** is a free, open-source cattle herd and pasture management web application built for small-scale farmers in Southern Africa. Manage beef cattle records, family pedigrees, expected calvings, veterinary tasks, and pasture logistics — all from your phone or computer.

**Live App**: [cattleitics.vercel.app](https://cattleitics.vercel.app)

---

## Key Features

*   **Cloud-Synced Herd Records**: Your cattle data is securely stored in the cloud. Access it from any device — phone, tablet, or computer. Each farmer gets their own private account.
*   **Interactive Visual Farm Map**: View your paddocks illustrated by landscape type. Displays active head counts and scrollable cow portraits. Click a cow's thumbnail on the map to open its profile instantly.
*   **CSV Import & Export**: Download your complete herd as a CSV spreadsheet at any time. Import cattle records from a CSV file to quickly migrate existing data into the system.
*   **Deep Paddock Manager**: Create, edit, and delete pasture boundaries. Includes a safeguard that blocks deletion of a pasture if cattle are still assigned to it.
*   **Complete Cattle Profiler & Pedigree Tree**: Track biological profiles, pregnancy dates, and purchase/sale finances. View maternal, paternal, and offspring pedigree charts with clickable links between generations.
*   **Vaccination & Vet Scheduler**: Plan seasonal procedures with priority indicators. Completing a task automatically logs a medical entry in the cow's history.
*   **Offline Image Uploader**: Capture or upload cow photos from your phone camera. Images are compressed on-the-fly and stored securely.
*   **Works Offline Too**: If you lose internet, the app falls back to browser storage and keeps working.

---

## Getting Started (Online)

### 1. Create an Account
1. Visit [cattleitics.vercel.app](https://cattleitics.vercel.app)
2. Click **"Create one free"** on the sign-in screen
3. Enter your farm name, email, and a password
4. You're in!

### 2. Import Your Herd
When you first sign in, you'll see an onboarding screen:
1. **Download the CSV template** — open it in Excel or LibreOffice
2. Fill in your cattle details (Tag ID, Name, Breed, Gender, etc.)
3. **Upload the completed CSV** back into the app
4. Click **"Start Using Cattleitics"**

You can also skip the import and add cattle manually one by one using the **+ Add Cattle** button.

### 3. Exporting Your Data
Your data is always yours. Go to **Data Settings** and click:
- **Export to CSV** — downloads a spreadsheet you can open in Excel
- **Export JSON** — downloads a complete backup of all records

This means even if the app disappears tomorrow, you still have your herd records in a standard format.

---

## Running Locally (Advanced / Developers)

If you prefer to run Cattleitics on your own computer without an internet connection:

### Requirements
- [Node.js](https://nodejs.org) installed on your computer

### Quick Start
1. Double-click **`Glenthorpe_Cattleitics.bat`** (Windows)
2. The app opens automatically at `http://localhost:3000`
3. Your data is saved as physical files in the `./data/` folder

### Local Mode Features
- **Bi-directional Excel sync**: Edit `data/cattle.csv` in Excel, save it, and refresh the browser — changes merge automatically while preserving photos and history
- **Physical file backups**: Your data lives as real files on your hard drive (`cattle.json`, `cattle.csv`)
- **No account needed**: Works immediately without sign-in

### Shutting Down (Local Mode)
Click the red **Shutdown Server** button in the sidebar. This saves all data and safely terminates the server.

---

## Standard Workflows

### Rotating Cattle Between Pastures
- **From the Map**: Click a paddock → find the cow → click it → click **Move Pasture** → select destination → confirm
- **From the Herd**: Click a cow card → click **Move Pasture** in the profile sidebar
- Every move is automatically logged in the cow's history timeline

### Redefining Pasture Boundaries
1. Go to **Pasture Map** → click **Add Pasture**
2. Enter name, size, veld type, and landscape category
3. To edit or delete, click the paddock card and use the detail panel buttons
4. The app blocks deletion if cattle are still assigned to that pasture

### Completing Health & Vaccination Tasks
1. Go to **Task Board** to see pending and urgent tasks
2. Click the checkbox to mark complete
3. If the task targets a specific cow, a medical log entry is automatically added to that cow's timeline

---

## How It Works (Technical)

Cattleitics operates in three modes depending on how you access it:

| Mode | When | Storage |
|------|------|---------|
| **Cloud Sync** | Visiting cattleitics.vercel.app | Supabase (PostgreSQL database) |
| **Local Server** | Running via batch file / `npm start` | Physical JSON & CSV files |
| **Offline Browser** | Opening index.html directly | Browser IndexedDB |

Each farmer's data is completely isolated — you can never see another farmer's records.

---

## Sharing with Other Farmers

Simply send them the link: **[cattleitics.vercel.app](https://cattleitics.vercel.app)**

They create their own free account and start managing their herd immediately. No installation, no technical setup, works on any phone or computer with a web browser.

---

## Data Safety

- **Cloud backups**: Your data is stored in a secure PostgreSQL database with row-level security
- **Export anytime**: Download CSV or JSON backups from Data Settings
- **Your data, your control**: Even without the app, your exported CSV opens in any spreadsheet program
- **Open source**: The full code is available on [GitHub](https://github.com/ToastSeagers/Cattleitics)

---

## Contributing

Cattleitics is open source. Pull requests, bug reports, and feature suggestions are welcome on GitHub.

## License

MIT — free to use, modify, and distribute.
