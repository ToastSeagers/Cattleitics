# Glenthorpe Cattleitics

**Glenthorpe Cattleitics** is a premium, offline-first cattle herd and pasture management web application. It is custom-designed for a small holding (like Glenthorpe outside of Makhanda in the Eastern Cape) to manage beef cattle records, family relationships, expected calvings, veterinary tasks, and pasture logistics—fully privately, and with **$0 hosting/cloud database costs**.

---

## Key Features

*   **Interactive Visual Farm Map**: View your paddocks beautifully illustrated based on landscape type (Homesteads, Riverine Fields, Highland Ridges, Wooded Slopes, Grasslands). Displays active head counts and scrollable mini cow portraits. You can click on a cow's thumbnail directly on the map to open its profile and medical log instantly.
*   **Bi-Directional Excel Synchronization**: The app automatically maintains a clean spreadsheet file in your workspace: `data/cattle.csv`. You can open and edit this file directly in Microsoft Excel or Google Sheets. When you save your spreadsheet and refresh the app, the changes are automatically synchronized back into the database while fully preserving your cow photos and medical history timelines!
*   **Deep Paddock Settings Manager**: Create, edit, and delete pasture boundaries. Includes a **Herd Protection Safeguard** that blocks you from deleting a pasture if there are still cattle assigned to graze inside it, ensuring you safely relocate them first.
*   **Complete Cattle Profiler & Pedigree Tree**: Track comprehensive biological profiles, pregnancy expected calving dates, and purchase/sale finances. View maternal, paternal, and offspring pedigree charts automatically linked to easily jump between generations.
*   **Vaccination & Vet Scheduler**: Plan seasonal procedures (Lumpy Skin Disease, deworming, tick spray dipping) with priority status indicators. Completing a task automatically records a permanent medical entry in the cow's history feed.
*   **Offline Image Uploader**: Capture or upload pictures of your cows from your phone camera or computer. The app compresses the image on-the-fly and saves it securely in your browser's database for absolute privacy.

---

## Quick Start Guide

Cattleitics is designed to be as easy to start and close as double-clicking a file! You only need to have **Node.js** installed on your computer.

### Step 1: Double-Click to Start
Navigate to your project folder on your computer and simply **double-click** this file:
👉 **`Glenthorpe_Cattleitics.bat`**

This will automatically:
1. Open a quiet terminal window to run the database sync server.
2. Automatically launch your default web browser and open the app dashboard at **`http://localhost:3000`**.

*(Your database folder `./data/` will be created immediately and pre-loaded with realistic mock Nguni, Bonsmara, and Brahman records!)*

### Step 2: Shutting Down Safely
When you are finished updating your herd records, **do not** just close your browser or terminal:
1. Click the red **`Shutdown Server`** button at the very bottom of your sidebar menu (<i class="fa-solid fa-power-off"></i>).
2. Click **OK** to confirm.
3. The application will automatically run a final synchronization save to secure all your Excel spreadsheets and database files, safely terminate the database server in the background, and close your browser tab!

---

## Standard Workflows & How to Use

### 1. Rotating Cattle Between Pastures
*   **Option A (From Map)**: Click on a paddock card inside the **Pasture Map** view. Scroll to the "Animals Currently Grazing Here" list, click on the cow, and click the **Move Pasture** button. Select the new pasture, write a reason (e.g., "Seasonal pasture rotation"), and click **Confirm Move**.
*   **Option B (From Herd)**: Click on a cow card in the **Cattle Herd** tab. In the profile sidebar, click **Move Pasture**.
*   *Note: Every time a cow is moved, a "Move" category entry is automatically logged in its veterinary history timeline (e.g., "Relocated from River Field to Ridge Pasture. Reason: Rotational grazing").*

### 2. Editing Herd Data in Excel
1.  Navigate to your workspace directory and open **`./data/cattle.csv`** in Excel.
2.  Edit names, breeds, dates of birth, purchase prices, or paddock assignments.
3.  Save the CSV file inside Excel (keep the CSV format if Excel asks).
4.  Refresh your web browser. The Node server will automatically detect the spreadsheet update, merge the fields, and preserve your cattle portraits and event histories.

### 3. Redefining Pasture Boundaries
1.  Go to the **Pasture Map** tab and click **Add Pasture** next to the header.
2.  Input the name, size (e.g. `15ha`), veld type (Sweetveld/Sourveld), and landscape category (this dictates its visual icon and background styling). Click **Save Pasture**.
3.  To edit or delete, click on the paddock visual card on the map, scroll to the detail panel, and click **Edit Pasture** or **Delete Pasture**.
4.  *Note: The app will block deletion of a pasture if its headcount is greater than 0, protecting your records.*

### 4. Completing Health & Vaccination Tasks
1.  Go to the **Task Board** tab to see pending, high-priority (Urgent), and completed tasks.
2.  To mark a chore as complete, click the checkbox. 
3.  If the task was targeted at a specific cow (e.g., *GT002*), the system will automatically append a medical vaccination log to that cow's timeline showing it was completed by you today.

---

## How to Share with Other Farmers

You can easily share Cattleitics with neighboring farmers in the Eastern Cape:

### Option A: Direct File Sharing (Zero NPM Install, Offline Fallback)
1.  Send them a **ZIP file** of your project folder (exclude the `node_modules` folder to keep it lightweight).
2.  The other farmer extracts the ZIP.
3.  **No Node.js? No Problem!** They can simply double-click **`index.html`** in their browser. The app will automatically detect it is running in standalone mode, switch to **Offline Browser Mode**, and securely save all their data privately inside their own browser's **IndexedDB** database for free.

### Option B: Free Cloud Hosting (One-Click Setup)
1.  Upload the project folder to a free static hosting service like **Netlify, Vercel, or GitHub Pages** (takes seconds and costs $0).
2.  WhatsApp the link (e.g., `https://cattleitics.netlify.app`) to other farmers.
3.  When they open the link, the app runs instantly on their phones or computers, saving their records privately in their browser cache. There is zero database configuration or ongoing hosting costs.

---

## Safe Data Operations
*   **Export Backups**: In the **Data Settings** view, you can download a complete CSV or JSON backup at any time.
*   **Import Spreadsheet**: In the **Data Settings** view, you can import an exported CSV or JSON file to reload your database instantly.
*   **Wipe Database**: Wipes the browser IndexedDB/Node cache completely. Use only when starting a fresh herd.
*   **Reload Mock Data**: Erases current data and seeds the database with the initial 8 mock cattle, tasks, and 4 paddocks.
