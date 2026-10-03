# TINCTORIS — installation guide (beta)

*Treatises, Inventories, Notation, Codices, Texts, Organology, Records, Iconography and Sources.*

TINCTORIS is a sources database for musicology, artistic research and teaching: manuscripts, prints, scores,
recordings, instruments, iconography. Each person installs it on their own Mac and keeps their own library.

> The interface is currently in **European Portuguese** (an English interface is planned for version 0.9.1).
> This guide gives the Portuguese labels you will see on screen, with an English gloss.
> Guia em português: [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md).

## Before you start

- **A Mac with an Apple processor** (M1 or later). To check:  → About This Mac → «Chip: Apple M…».
  The beta does not run on Intel Macs.
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
   - **Where to keep TINCTORIS** — choose a folder (for example, Documents); a «TINCTORIS» folder is created inside it,
     holding the programme and your sources. It can be on an external disk.
   - **Local AI** («IA local») — only offered on Macs with 16 GB of memory or more. It helps identify difficult covers
     and title pages, without sending anything off the Mac. It takes about 6 GB. You can answer «Não» (No) and
     install it later.
4. When Terminal asks for your **Password**, type the Mac's password and press Return.
   **Nothing appears on screen while you type: this is normal.**
5. Wait. Installing Homebrew can take 10 to 15 minutes without showing anything: do not close the window.
6. At the end, TINCTORIS opens in your web browser and the TINCTORIS folder appears in the Finder.

If anything fails, the installer opens the feedback form with the error already filled in: just press «Enviar» (Send).

## First use

1. **Create your account** (email and password). It stays on your Mac only.
2. **Type your name** in the welcome window («Bem-vindo ao TINCTORIS»). It lets TINCTORIS know that, in a PDF you
   scanned yourself, you are not the author of the source.
3. To add sources, drag files (PDFs, images, recordings…) into the **watch_folder** folder, inside the TINCTORIS
   folder. TINCTORIS identifies them and creates the records; those that need your help appear under **Por rever**
   (To review).

## Opening and closing

- **Open:** double-click **«Iniciar TINCTORIS»** in the TINCTORIS folder. A Terminal window opens (leave it open)
  and TINCTORIS appears in your browser. If a new version is available, it asks before updating.
- **Close:** close the Terminal window.

By default, TINCTORIS only opens on your own Mac. To open it also on an iPad or another computer on the same Wi-Fi
network: **Definições** (Settings) → «A sua biblioteca» (Your library) → switch off «Abrir só neste Mac» (Open only on
this Mac), then open TINCTORIS again.

## Exporting bibliographic references

On the **Fontes** (Sources) screen, the **«Exportar bibliografia»** (Export bibliography) button exports the selected
sources (tick boxes to the left of each source) or, if none is selected, every source in the current search. Choose
the style (APA, Chicago, MLA, Harvard, NP 405, ABNT), the language of the terms and the format. **Copiar** (Copy) puts
the list on the clipboard, ready to paste into Word; **Descarregar ficheiro** (Download file) saves it as text, RTF,
HTML, BibTeX, RIS or CSL-JSON (for Zotero, Mendeley or EndNote).

## Feedback

This is a beta: your feedback decides what improves. At the bottom of the sidebar, **«Enviar comentário»** (Send
feedback) opens a short bilingual form (doesn't work / could work better / missing feature / how do I…?). The
programme and macOS versions and the latest technical errors are filled in for you; titles, file names and sources
are never sent. Name and email are optional. If you wish, you can be listed in the **Créditos** (Credits), in the «Acerca e ajuda» (About and help) menu item,
which also shows the version, how to cite TINCTORIS and links to the manual and guides.

---

© 2026 Pedro Sousa Silva and TINCTORIS contributors. This guide: CC BY-SA 4.0. Software: GNU AGPL 3.0 or later.
