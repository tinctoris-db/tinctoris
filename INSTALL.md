# TINCTORIS — installation guide (beta)

*Treatises, Inventories, Notation, Codices, Texts, Organology, Records, Iconography and Sources.*

TINCTORIS is a sources database for musicology, artistic research and teaching: manuscripts, prints, scores,
recordings, instruments, iconography. Each person installs it on their own Mac (or, experimentally, on a Windows PC) and keeps their own library.

> The interface comes in **European Portuguese** and **English** (choose it in **Settings → Interface language**).
> Guia em português: [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md).

## Before you start

- **A Mac with an Apple processor** (M1 or later). To check:  → About This Mac → «Chip: Apple M…».
  The beta does not run on Intel Macs: in class, work in a pair with a colleague.
- **macOS 15 (Sequoia) or later**, ideally. Older versions work, but Homebrew no longer has ready-made packages for
  them and builds them on the Mac: installation may take several hours and fail. If you can, update first
  (System Settings → General → Software Update).
- **An administrator account** on the Mac, and its password (on a personal Mac, this is usually yours).
- **An internet connection** and **15 to 25 minutes** (the first installation downloads several components).
- Free disk space: about 3 GB, plus 6 GB if you want the local AI, plus the space your sources need.

## Install

1. Open **Terminal**: press ⌘ + space, type «Terminal» and press Return.
2. Copy this whole line, paste it into Terminal (⌘ + V) and press Return:

   ```
   /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/tinctoris-db/tinctoris/main/instalar-tinctoris.sh)"
   ```

3. Answer the windows that appear:
   - **Onde guardar o TINCTORIS** (Where to keep TINCTORIS) — choose a folder (for example, Documents); a «TINCTORIS» folder is created inside it,
     holding the programme and your sources. It can be on an external disk.
   - **IA local** (Local AI) — only offered on Macs with 16 GB of memory or more. It helps identify difficult covers
     and title pages, without sending anything off the Mac. It takes about 6 GB. You can answer «Não» (No) and
     install it later.
4. When Terminal asks for your **Password**, type the Mac's password and press Return.
   **Nothing appears on screen while you type: this is normal.**
5. Wait. Installing Homebrew can take 10 to 15 minutes without showing anything: do not close the window.
6. At the end, TINCTORIS opens in your web browser and the TINCTORIS folder appears in the Finder.

If anything fails, the installer opens the feedback form with the error already filled in: just press «Enviar» (Send).

## First use

1. **Create your account** (email and password). It stays on your Mac only.
2. **Type your name** in the welcome window (**Welcome to TINCTORIS**). It lets TINCTORIS know that, in a PDF you
   scanned yourself, you are not the author of the source.
3. To add sources, drag files (PDFs, images, recordings…) into the **watch_folder** folder, inside the TINCTORIS
   folder. TINCTORIS identifies them and creates the records; those that need your help appear under **To review**.

## Opening and closing

- **Open:** double-click **«Iniciar TINCTORIS»** in the TINCTORIS folder. A Terminal window opens (leave it open)
  and TINCTORIS appears in your browser. If a new version is available, it asks before updating.
- **Close:** close the Terminal window.

By default, TINCTORIS only opens on your own Mac. To open it also on an iPad or another computer on the same Wi-Fi
network: **Settings** → **Your library** → switch off **Open on this Mac only**, then open TINCTORIS again.

## Windows (experimental)

Since 0.12.0-beta, TINCTORIS also runs on **Windows 11** (or an up-to-date Windows 10), 64-bit.
1. Open **PowerShell** (Windows key, type "PowerShell", Enter).
2. Paste this line (right-click) and press Enter:

   ```
   irm https://raw.githubusercontent.com/tinctoris-db/tinctoris/main/instalar-tinctoris.ps1 | iex
   ```
3. The installer shows 7 steps and uses **winget** (built into Windows) to install Node.js, Poppler, Tesseract, FFmpeg
   and SQLite: answer **Yes** when Windows asks for permission. It takes about 20 minutes.
4. At the end a **TINCTORIS** icon appears on the Desktop. Double-click it: a black window opens (keep it open while you
   use the program) and then your browser.

The program lives in the `TINCTORIS` folder inside your user folder (the watch folder is `TINCTORIS\watch_folder`).
Differences from the Mac: what goes to the Bin on a Mac goes to a **"TINCTORIS - Lixo"** folder at the root of the drive;
iPhone HEIC photos are not read yet; barcode and text reading in cover photos is weaker; .pages files get no full text.
The local AI needs 16 GB of memory (with less, it stays off).

## Exporting bibliographic references

On the **Sources** screen, the **Export bibliography** button exports the selected
sources (tick boxes to the left of each source) or, if none is selected, every source in the current search. Choose
the style (APA, Chicago, MLA, Harvard, NP 405, ABNT), the language of the terms and the format. **Copy** puts
the list on the clipboard, ready to paste into Word; **Download file** saves it as text, RTF,
HTML, BibTeX, RIS or CSL-JSON (for Zotero, Mendeley or EndNote).

## Feedback

This is a beta: your feedback decides what improves. At the bottom of the sidebar, **Send feedback** opens a short bilingual form (doesn't work / could work better / missing feature / how do I…?). The
programme and macOS versions and the latest technical errors are filled in for you; titles, file names and sources
are never sent. Name and email are optional. If you wish, you can be listed in the **Credits**, on the **About** page,
which also shows the version, how to cite TINCTORIS and links to the manual and guides.

---

© 2026 Pedro Sousa Silva and TINCTORIS contributors. This guide: CC BY-SA 4.0. Software: GNU AGPL 3.0 or later.
