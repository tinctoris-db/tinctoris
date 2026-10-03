# TINCTORIS

*Treatises, Inventories, Notation, Codices, Texts, Organology, Records, Iconography and Sources.* The name honours
Johannes Tinctoris (c. 1435–1511), author of the *Terminorum musicae diffinitorium* (c. 1495), the first printed
dictionary of music.

A personal sources database for musicology, artistic research and teaching. Inspired by Zotero and Mendeley, but
designed for manuscripts, scores, recordings, instruments, digital sources, and any new type you care to create.

> The interface is currently in **European Portuguese** (an English interface is planned for version 0.9.1). This
> manual gives the Portuguese labels you will see on screen in **bold**, with an English gloss.
> Manual em português: [README.md](README.md).

**Install (beta):** see the [installation guide](INSTALL.md) — one line in the Terminal of a Mac with an Apple
processor. Licence: [AGPL 3.0](LICENSE) (software) and [CC BY-SA 4.0](LICENSE-docs.md) (this manual);
[credits](CREDITOS.md); [how to cite](CITATION.cff); [how to contribute](CONTRIBUTING.md).

Everything lives in the folder where TINCTORIS was installed (it can be an external disk):

```
TINCTORIS/
├── Iniciar TINCTORIS.command    ← double-click to start
├── README.md                    ← the manual (Portuguese)
├── watch_folder/                ← drop new files here
├── nao_processados/             ← things that are not sources (web pages, icons…)
├── biblioteca/                  ← files organised automatically
│   ├── Livro/2003/2003-08-07_SUTCLIFFE_The-Keyboard-Sonatas-….pdf
│   ├── _por_rever/              ← files waiting for your review
│   └── _duplicados/             ← repeated copies (can be deleted)
└── app/                         ← the programme (no need to touch it)
```

---

## 1. Starting and stopping

**Start:** double-click **`Iniciar TINCTORIS.command`**. A Terminal window opens (leave it open) and the library
appears in your browser at <http://127.0.0.1:8090>.

**Stop:** close that Terminal window (or press `Ctrl+C` in it).
**Always stop the library before ejecting the disk.**

While the library is running, the Mac does not go to sleep (the screen may switch off), so that processing many
files is not interrupted.

> If network access is switched on (see section 8), the first time macOS may ask whether «pocketbase» may accept
> network connections. Answer **Allow** if you want to use the library on an iPad or phone. If you answer «Deny», it
> keeps working on this computer.

**First use:** the page asks you to **create your account** (email and password). The account stays on this disk only
and stops other people on the Wi-Fi network from opening the library. For security, it can only be created on the Mac
where the library is installed.

**No login on this Mac:** the library opens directly with your account. The login screen only appears on other
devices (iPad, phone), so that nobody else on the same Wi-Fi can open it.

## 2. Adding sources

### a) Through the watch folder (automatic)
Drag files into the **`watch_folder`** folder. It accepts PDFs, scans (JPG, PNG, TIFF…), audio (MP3, WAV, FLAC…),
video (MP4, MOV…), digital scores (MusicXML, MIDI, Dorico, Sibelius…) and more. For each file, the library:

1. **Checks whether it is a repeat:** if it already exists (same content, any name), it goes to
   `biblioteca/_duplicados`.
2. **Reads the file**, in this order of confidence:
   - a JSTOR cover page, from which it takes the DOI;
   - the **document's cover**, using the size and position of the lettering (title, author, year; for theses also
     the degree, supervisor and institution). For scans it uses OCR for this;
   - the file name, if it comes from Mendeley ("Author_Year_Title");
   - the PDF's hidden metadata, only if they are credible.
   In **scores** (Finale, Sibelius…), notes that come through as characters ("œœœ") are set aside before reading the
   heading. Covers with "encrypted" text are read by OCR.
3. **If the rules are not enough, the local AI reads the first page "like a person"** (see section 11). It reports the
   title, the authors and their roles (composer, arranger…), the year, the type, the institution and supervisor, the
   catalogue number and the instrument.
4. **Checks whether the work is already in the library**, for example because it was imported from Mendeley. If so,
   it **attaches the file** to it instead of creating a duplicate source, tolerating typos in the title.
5. **If not, looks for the metadata online**:
   - theses: first OpenAIRE (which includes RCAAP and the University of Aveiro's RIA) and **RECIPP** (the Polytechnic
     of Porto repository, with ESMAE theses: it also gives the institution and supervisor);
   - other writings: CrossRef, OpenAlex, Open Library, OpenAIRE, **Google Books** and RECIPP. Google Scholar and JSTOR
     do not allow automatic searching: links to them are left on the record;
   - recordings: MusicBrainz, Apple Music, Deezer and YouTube;
   - scores: IMSLP and RISM;
   - **early music sources** (manuscripts, prints before 1800, or files with a RISM siglum in the name): first
     **RISM** and **DIAMM**; then **Cantus** and **PEM** (plainchant) and, if nothing fits, **Gallica** (BnF) — see
     "Manuscripts and early prints" below.
6. **Generates keywords**:
   - the author's own, if the document has them ("Palavras-chave:", "Keywords");
   - otherwise, the repository's;
   - otherwise, the local AI's;
   - otherwise, computed from the text.

   They appear in the list under each source; clicking one searches for it.
7. **Renames and moves the file** into `biblioteca/`, for example `Livro/2003/2003_SUTCLIFFE_The-Keyboard-Sonatas.pdf`.
   If the identification is not certain, the file goes to `_por_rever`.
8. **Runs OCR** (text recognition) in the background so that you can search inside documents — but **only once the
   source is identified** and **never on scores** (OCR reads text, not notes). This way the Mac is not kept busy for
   hours with documents still awaiting review.

The file is **moved**, not copied: the `watch_folder` is left empty, and the folders you dropped there are removed
once empty.

**Manuscripts and early prints.** The library makes use of the file name:
- **date at the start**: `1538 …`, `1580-1590 …`, `c1520 …`, `17xx …` (becomes "18th century" and goes into the
  `17xx` folder), `séc. XVI …`;
- **RISM siglum + shelfmark**: `E-Tuy L I`, `P-Cug MM 37`, `D-Mbs Mus.ms. 34`. The siglum is checked against RISM (so
  `G-Dur` or `I-XII` never count as libraries) and fills in the archive, city and shelfmark;
  **variants** of the siglum also work when RISM has only one equivalent: `P-BRd` (abbreviation) is read as P-BRad,
  `P-Arouca` (city name) as P-AR; the record's note says which siglum was read. A siglum at the start of the name that
  RISM does not recognise (`P-Ev_alegria_cod_1`, which could be P-EVc, P-EVp…) makes the record a manuscript with the
  shelfmark from the name, **to review** with a note; modern book catalogues do not count;
- **composer** after the date (`1502 Josquin …`, `1410_Fernand Estevan_…`);
- **folios** (`fol 34v`) and words such as `Ms`, `manuscrito`, `codex`.

The local AI also says whether the page is **handwritten or printed**. Then:
- **with siglum + shelfmark**, the manuscript is looked up by shelfmark in RISM and DIAMM (near-exact identification:
  dating, support, dimensions, notation);
- **prints**: RISM is searched by year, composer and title on the source; when found, it fills in the **RISM number**
  (A/I or B/I, e.g. `RISM B/I 1538/4`), the printer, the place, the uniform title and the known copies;
- manuscripts get the type **Manuscrito** (Manuscript) and nature **primária** (primary), and skip OCR (it cannot read
  handwriting);
- a manuscript without a legible title is identified by siglum and shelfmark (`E-TUY L I`);
- in **collections**, the list of works and composers comes from RISM (fields "Conteúdo" (Contents) and "Compositores
  no conteúdo" (Composers in contents));
- **digitised copy**: the same edition often survives in several copies, in several libraries. When the PDF starts
  with the digital library's title page, the app records **which copy you have**: library, shelfmark, permanent
  identifier (URN, ark, purl) and link to the digitisation (e.g. `Bayerische Staatsbibliothek (D-Mbs), 4 Mus.pr.
  56#Beibd.7`). It recognises the BSB, BnF/Gallica, ÖNB, Staatsbibliothek zu Berlin, SLUB Dresden, Wolfenbüttel,
  Göttingen, the Vatican Library, the British Library, the Bodleian, the Library of Congress, BNE, BNP (purl.pt),
  BPMP, the Biblioteca Geral of Coimbra, the Biblioteca Pública of Évora, the Estense, the Museo della Musica in
  Bologna, the KB, the Royal Danish Library, the Biblioteka Narodowa, e-rara and e-codices. The identifier also works
  when it appears in the name of the file or images (`bsb00016944_00001.jpg`, `btv1b52500918r.pdf`). Without an
  identifier: for **Gallica** PDFs that only say «Source gallica.bnf.fr», the app searches Gallica by the title,
  author and year on the title page and in the catalogue notice, and only accepts a single result (the year is that
  of the edition, not of the author's death; if the title is garbled, it tries author and year only, or, for a record
  with no date in the catalogue, the same title and the same collection); for old **BSB** PDFs that only carry the
  shelfmark («4 Mus.pr. 109#Beibd.3»), it finds the digitisation by exact shelfmark (via Europeana).
- **catalogue record of the copy** (for now, Gallica/BnF, BSB and BNP/purl.pt): with the identifier, the app fetches
  the exact record of the copy: title, authors, imprint, **provenance** (former owners, when the catalogue has them),
  the link to the catalogue record and the **other copies** of the same edition in that library. If RISM has several
  similar editions (e.g. the first and second books of masses from the same year), the copy helps choose the right
  one. If RISM and DIAMM cannot find the source, the copy's record identifies it.
- **plainchant (Cantus and PEM)**: with siglum + shelfmark, the app looks for the source in the **Cantus Index**,
  which lists the sources of eleven databases (Cantus Database, PEM — Portuguese Early Music Database —, Musica
  Hispanica…). From the **Cantus Database** and **PEM** come the dating, origin and provenance, liturgical contents,
  notation, support and dimensions; the field «Noutras bases» (In other databases) keeps the links to the source in
  each database and the number of chants inventoried. RISM and DIAMM still come first: Cantus and PEM only add what
  they did not provide. When the siglum and shelfmark come from the **file name**, Cantus and PEM are consulted even
  if the AI read the source as printed (a blank cover misleads it); if PEM or Cantus has the source, the record
  becomes «Manuscrito», with the note «A IA leu como impresso; a PEM descreve um manuscrito» (the AI read it as
  printed; PEM describes a manuscript). If the AI says «printed» without any sign of printing (no printer/publisher,
  place or date of printing, no imprint formula such as «apud», «typis», «appresso») and the shelfmark is not that of
  a print («Mus.pr.», «Res.», bsb, ark, purl), the record becomes «Manuscrito» straight away, with a note (e.g.
  `P-BRd_949_antifonario`), titled «siglum shelfmark — rest of the name», and **to review** unless PEM, Cantus, DIAMM
  or a RISM manuscript record identifies it.
- **composer databases** (for now, **Bach digital**): for a score or manuscript with a catalogue number (BWV), the
  field «Fontes conhecidas da obra» (Known sources of the work) lists every source the database knows for that work:
  archive and shelfmark, autograph or copy, dating, in Portuguese (e.g. `D-B Am.B 51 — manuscrito coletivo, cópia, 2.ª
  metade do séc. XVIII (c. 1760–1789)`). For a manuscript with siglum + shelfmark that is in Bach digital, the copyist,
  dating, dimensions and **chain of owners** (provenance) are added. Other composer databases can be added in the same
  way (a new entry in `compositores.js`).
- **Gallica**: if neither RISM nor DIAMM identifies a score or manuscript, the app searches Gallica (composer, title
  and year). The BnF copy goes into «Exemplares conhecidos» (Known copies).
- **K10plus** (joint catalogue of Berlin, Göttingen, Wolfenbüttel, Halle, Dresden, Stuttgart…): prints that neither
  RISM, DIAMM nor Gallica identified, when the year is known. It gives the **VD16/VD17/VD18** number and the
  shelfmarks of copies in those libraries («Outros exemplares», Other copies).
- **Europeana**: once a print is identified, the app looks for **other digitisations of the same edition** in other
  European libraries (same year, practically the same title) and lists them under «Outras digitalizações da mesma
  edição» (Other digitisations of the same edition). It uses the public demo key; in **Definições** (Settings) you can
  enter your own key (free, at europeana.eu).
- **BNP/PORBASE**: the BNP catalogue does not accept automatic searches; the record has a «BNP» link to search by
  hand. PDFs from the Biblioteca Nacional Digital (purl.pt) are recognised and get the shelfmark of the digitised
  copy.

**Standardised work titles.** When a score (or a manuscript of a work) has a catalogue number (BWV, BuxWV, HWV, RV,
TWV, K., Hob., Z., op.…), the app fetches the standardised title, in English, from **IMSLP**: "SONATA IV" + "BWV 528,
2" → *Organ Sonata No.4 in E minor, BWV 528*. The printed title is kept in «Título na fonte» (Title on the source); the
key, date of composition and link to the work on IMSLP are also saved. As a precaution, the title does **not** change
when the record's title has a different catalogue number, a different key, a different work number ("No. 6" ≠ "No.2"),
is of a different genre, is a dance movement that does not exist in the work, or is a collection. For older records:
`./biblioteca titulos-obras` shows what would change; `./biblioteca titulos-obras --aplicar` saves it (with a backup
first).

**Catalogue numbers read by the AI.** The local AI sometimes invents a number (especially "BWV 1047") when it cannot
see one on the page. So the number it gives only counts if it is written in the file name or in the document's text, or
if the corresponding work on IMSLP matches the printed title (same genre, key, words or movement in common). Otherwise
it goes into the field «Nº de catálogo sugerido pela IA (não confirmado)» (Catalogue no. suggested by the AI, not
confirmed), without changing the title. The file name counts too: Bach's "Cantata nº 093.pdf" is BWV 93.
`./biblioteca rever-catalogos` applies this check to older records (it shows first; `--aplicar` saves, with a backup
first).

`--excluir 12451,1098` leaves those records as they are (for example, when the catalogue number stored on the record
is wrong).

**Several files in one source** (part-books, works in several volumes). On the record, section **Ficheiros** (Files) →
**Juntar outras fichas a esta…** (Merge other records into this one…) and enter the numbers (e.g. `23, 24-47`). Those
records' files move to this one (with the label at the end of the name: `…_B.doc`, `…_Cantus.pdf`), as do reading notes
and tags; those records cease to exist, but **no file is deleted**. A backup is made first. Each file opens by clicking
its label; **(separar)** (split off) returns a file to a record of its own, to review. In the terminal:
`./biblioteca juntar 22 23-47`. A repeated file from one of those volumes, dropped into the watch folder, goes to
`_duplicados`.

**Old Word files (.doc, Word 97–2003):** those macOS cannot read are read by the `word-extractor` module (installed
with the library; nothing needed on the Mac).

A source is only **complete** («completo») with a title, an author (or «Anónimo» / «Vários», Anonymous / Various) and
a date (at least approximate). Otherwise it goes to «Por rever» (To review).

**Loose page images** of the same document, in the same folder and with the same base name ("matteo 1.jpeg",
"matteo 2.jpeg"…; "bsb00016944_00001.jpg"…), are **joined into a single multi-page PDF** with a single record. The
original images are kept in `nao_processados/imagens_juntadas/`.

**Safeguards:**
- **Anything that is not a source goes to `nao_processados/`**, with the same folder structure: web pages (.htm),
  icons and small images, system files.
- **Many files at once:** if more than 300 documents arrive, the library pauses and asks for confirmation (notice at
  the top of the page).
- **Interrupted work:** if the library is closed in the middle of a re-analysis, sources left «A processar»
  (Processing) go back into the queue at the next start. New files in the `watch_folder` and records re-analysed by
  hand (**Reanalisar** button) always take priority over those re-analyses. In **Atividade** (Activity) the card shows
  both numbers: "Novos" (New) and "Reanálise" (Re-analysis).
- **Pace of online searches:** online services are not overloaded. If one of them refuses requests, it is paused for
  10 minutes.

### b) Importing from Mendeley or Zotero
In the menu, **Importar (Mendeley, Zotero)** (Import) → **Escolher ficheiro…** (Choose file…) and select the `.bib`
(or `.ris`) file. A **summary** appears first, and nothing is saved until you press «Importar»:

- **Repeats** (within the file or already in the library) are detected and skipped. Anything that only existed in a
  repeat (for example the DOI or the year) is kept.
- **Types misclassified** by Mendeley are corrected when it is obvious (for example, a «book» with a journal, volume
  and issue becomes an Article).
- **Titles that are file names** (`Bent_2002_Counterpoint…`, `GAULDIN - A Practical Approach…`) are split into author,
  year and title.
- **Sources already in the library** (for example from the watch_folder) are not duplicated: **they are completed with
  the file's data**. If they were «to review», Mendeley's data replace the guesses read from the PDF. The order
  (importing first or dropping the files first) does not matter.
- **Incomplete references** (no author or no date) go to «Por rever». With the option «Procurar online o que falta»
  (Look up what is missing online), the library only completes them on its own when the author matches, so as not to
  confuse a book with a review of that book. Otherwise it keeps suggestions for you to choose from.
- If the file contains Mendeley **annotations**, they become reading notes; Mendeley **folders** become tags; and
  **attached PDFs**, if they exist on this computer, are copied into the library.

> The current Mendeley Reference Manager does not include PDFs, annotations or folders in the .bib file: only the
> bibliographic data. The PDFs can then be dropped into the watch_folder.

### c) By hand
Click **+ Nova fonte** (New source). Useful for instruments, performances, sources without a file, or to record
something quickly.

## 3. Reviewing sources («Por rever»)

When the library is not sure of the identification (for example, there are several recordings with the same title,
or it is a manuscript with no match online), the source appears under **Por rever** (To review), with a count in the
menu. For each one:

- **Pick a suggestion** («Usar esta», Use this one). Each suggestion shows where it comes from and a confidence
  percentage;
- or **fill in** the fields by hand;
- or press **Pesquisa aprofundada** (In-depth search) to consult *every* source: CrossRef, OpenAlex, Open Library,
  Google Books, Zenodo, DataCite, HAL, Semantic Scholar, Internet Archive, RECIPP, RISM, IMSLP, Gallica, MusicBrainz,
  Apple Music, Deezer and YouTube.

Then press **Guardar e confirmar** (Save and confirm): the file is renamed and filed in the right folder.

**Re-analyse:** on the record of a source with a file, **Reanalisar ficheiro** (Re-analyse file) identifies it again
with the latest rules and local AI. Re-analysis **does not spoil a good record**: a complete record that came from a
catalogue (RISM, IMSLP…) or from Mendeley stays complete; it only switches to another catalogue record if the new one
is the same work by the same composer (otherwise the new one is left as a suggestion in the note, to review); the more
precise date is kept («2019-07-17» does not become «2019»); and, in a thesis or article, a composer who appears in the
title does not become the author. A record by the wrong composer (for example, anonymous for a BWV work) or a
manuscript record for a PDF that is a modern edition is not accepted. Under **Por rever**, the **Reanalisar todas**
(Re-analyse all) button does the same for every source to review that has a file, after a backup.

Each source's record also has links to search **JSTOR** and **Google Scholar**, which do not allow automatic searching,
and also WorldCat, RISM, IMSLP, Cantus, BNP, Europeana and the Internet Archive.

### Duplicates (near-identical PDFs)

**Exactly identical** files never get a record: they go straight to `_duplicados`. **Near-identical** ones (the same
PDF saved again, under another name, with an extra cover or blank page) are found by the command
`./biblioteca duplicados`, which compares the appearance of the pages (1st, 2nd, 3rd, middle and last, then at high
resolution, so as not to confuse different parts of the same piece):

- **Certain copies** (same number of pages, all pages compared identical): `./biblioteca duplicados --aplicar` merges
  them. The more complete record stays (complete before «to review», with reading notes, author, date…); from the
  other come the reading notes, tags, contexts, the file name and the full text (if missing). The repeated file goes
  to `_duplicados` (it is never deleted) and the repeated record ceases to exist; the one that stays keeps the number
  and title of the one removed (`duplicados_retirados`). Backup first; records «A processar» are left for next time.
- **Doubtful ones** (very similar, or with extra pages): menu **Duplicados** (Duplicates). One pair at a time, the two
  PDFs side by side: **Ficar com esta ficha** (Keep this record; the other is removed as above), **São diferentes**
  (They are different; they will not appear again) or **Saltar** (Skip).

**Space taken by duplicates.** When the `_duplicados` folder exceeds **10 %** of the space taken by the sources, a
notice appears at the top of the page. On the **Duplicados** screen, section «Espaço ocupado pelos duplicados» (Space
taken by duplicates):
- **Verificar agora** (Check now) compares the content of each file in `_duplicados` with the library (the first time
  takes a few minutes).
- **Seguros** (Safe; they have an exactly identical copy in a record or in `_originais`, or are near-identical PDFs
  already merged): **Pôr no Lixo do Mac** (Move to the Mac's Trash). Each one is checked again before it goes; they sit
  in the Trash in a folder «Duplicados YYYY-MM-DD …» and can be recovered until the Trash is emptied. Nothing is ever
  permanently deleted by the library.
- **Por ver** (Unchecked; no identical copy): a list with the **largest first**; for each one, **Abrir** (Open),
  **Mostrar no Finder** (Show in Finder), **Pôr no Lixo** (Move to Trash), **Devolver à biblioteca** (Return to the
  library; it goes back to the watch folder and gets its own record) or **Manter** (Keep).

## 4. Reading notes

On each source's record, section **Notas de leitura** (Reading notes) → **+ Nova nota** (New note). Each note has:

- **Location:** page, folio (`fól. 3v`) or timecode (`12:30`);
- **Type:** Quotation, Paraphrase, Comment, Idea or Question;
- **Text**, **tags** and **context/course unit** («Contexto / UC»).

The **Notas de leitura** page gathers the notes from every source, with search and filters. **Exportar estas notas**
(Export these notes) produces a Markdown file with each source's reference in the chosen style, ready to open in Word,
Obsidian or Notion.

## 5. Searching

Each source has a **permanent number** (#0001, #0002…), which never changes or repeats. It appears in the list and on
the record. Type **#123** in the search box to go straight to that source. It is also useful for labelling physical
copies or citing the source in your notes.

The search box searches **everything at once**: titles, authors, publishers, specific fields, tags, reading notes and
the documents' **full text** (including text obtained by OCR).

- Accents and capitals are ignored: `evora` finds «Évora».
- Incomplete words also work: `polif` finds «polifonia».
- For an exact phrase, use quotation marks: `"basso continuo"`.
- The **Filtros** (Filters) button filters by author, title, type, context/course unit, nature (primary/secondary),
  status, range of years and tag.
- **Ordenar por** (Sort by), above the list: most recent, title, author (by surname) or date, ascending or descending.
  A text search also offers «Relevância» (Relevance). The order is that of a catalogue: it ignores capitals, accents
  and initial articles («The Birth of the Orchestra» files under B), and sources without an author or date always go
  last. The last order chosen is remembered.

## 6. Exporting bibliographies

In **Fontes** (Sources), select the sources (or select none to export all those in the current search) and press
**Exportar bibliografia** (Export bibliography). Choose:

- **Style:**
  - APA 7;
  - Chicago 18, author-date or notes and bibliography;
  - MLA 9;
  - Harvard (Cite Them Right);
  - ABNT;
  - **NP 405**, the Portuguese standard.
- **Language of the terms:** Portuguese («Em», «s.d.», «Disponível em») or English.
- **Format:**
  - text;
  - HTML;
  - **RTF**, which opens in Word with the italics;
  - BibTeX;
  - RIS (Zotero, Mendeley, EndNote);
  - CSL-JSON.

**Copiar** (Copy) puts the formatted bibliography on the clipboard, ready to paste into Word. **Descarregar ficheiro**
(Download file) saves a file.

To add other styles, download the `.csl` file from <https://www.zotero.org/styles> and place it in `app/estilos/`. It
appears in the list at the next start.

> Some styles leave out certain types of source when information is missing. For example, Chicago does not list
> manuscripts without the «Arquivo» (Archive) field filled in.

## 7. Source types and fields (extensible schema)

The **Tipos de fonte** (Source types) page comes with 28 ready-made types: manuscript, critical edition, score, book,
article, letter, concert programme, legislation, recording, rehearsal recording, record, historical instrument,
technology, database, etc.

- **New type:** give it a name, a category, the «tipo para citações» (citation type; defines how it appears in the
  bibliography) and its own fields.
- **Fields:** each field has a name, a value type (text, number, date, list of options…) and, optionally, its
  equivalent in the citation (for example, «Cota» → Shelfmark; «Revista» → Published in).
- You can also create a field **directly on a source's record** (**+ Novo campo**, New field), for that source only or
  for all sources of the same type.

The **Contexto / UC** (Context / course unit) field (Reading and Interpreting Sources, Advanced Research in Music,
Artistic Project and Thesis, Teaching, Artistic Production) exists on every source and note, and is used to filter by
purpose.

## 8. Using it on an iPad, phone or another computer

By default, TINCTORIS installed with the installation guide **only opens on your own Mac**. To use it on other
devices: **Definições** (Settings) → «A sua biblioteca» (Your library) → switch off «Abrir só neste Mac» (Open only on
this Mac) and open TINCTORIS again.

With network access switched on and the library running, open **Atividade** (Activity): it shows the address for your
home network (for example `http://192.168.1.69:8090`). Open it in the browser of any device on the **same Wi-Fi
network** and log in with your account. The library is not reachable from the internet.

## 9. Settings («Definições»)

- **Your name** («O seu nome»): the owner of the library. In a PDF you scanned you are not the author; in a
  transcription made in a score editor you are the editor. Separate several forms of your name with «;».
- **File name pattern:** by default `{data}_{AUTOR}_{Titulo}`. You can also use `{ano}`, `{autor}`, `{tipo}`,
  `{natureza}`, `{contexto}` and `{editora}`.
- **Subfolder pattern:** by default `{tipo}/{ano}`. For example, `{natureza}/{tipo}` files into Primary/Secondary.
- **OCR:** switch on/off and choose the languages. Fewer languages make OCR faster.
- **Automatic metadata:** switch on/off and set the minimum confidence to accept without review (by default, 80%).
- **Optional keys:**
  - **YouTube:** free key, obtained in the Google Cloud Console → «YouTube Data API v3». Without it, YouTube search is
    switched off.
  - **Semantic Scholar:** without a key, this source often answers «too many requests».
  - **Contact email:** makes CrossRef, OpenAlex and MusicBrainz give your requests priority.
  - **Europeana:** free key (europeana.eu → API). Without it, the public demo key is used, which may refuse requests
    when there are many.
  - **Google Books:** without a key, the shared quota is almost always used up, and Google Books only takes part in the
    «Pesquisa aprofundada» (In-depth search); with a key, also in the automatic search for books. To get one: sign in at
    <https://console.cloud.google.com> with a Google account, create a project, enable the «Books API» (under «APIs &
    Services») and, under «Credentials», press «Create credentials» → «API key». Copy the key into **Definições → Chave
    Google Books**.

The **Acerca e ajuda** (About and help) page, the last item in the menu, shows the version, licence, source code link,
how to cite TINCTORIS (ready to copy), links to the manuals and guides, the «Enviar comentário» (Send feedback)
button and the credits.

## 10. Backups

- The database makes **automatic backups** while the library is running, and also a backup **before every import**
  and **before re-reading the library**. Backups are kept in `app/pb_data/backups`. You can also create a backup at
  any time in **Definições → Painel de administração → Settings → Backups**.
- **Very important:** these backups are on the same disk. From time to time, copy the `app/pb_data` folder (the
  database, including notes) and the `biblioteca` folder (the files) to **another disk** or to the cloud.

## 11. Local AI (on the Mac itself)

The library can use an AI model that runs **on the Mac itself** (Qwen3-VL, through the Ollama programme). It is
**free and private**: it needs no account or key, and nothing leaves the computer. The model lives in `app/modelos`
(about 6 GB) and starts and stops with the library. It is optional: the installer offers it on Macs with 16 GB of
memory or more.

- It is only used when the rules and identifiers (DOI, ISBN, JSTOR cover) are not enough.
- It takes **~15 seconds per document**, in the background.
- The AI's reading is checked against the document's own text: if the title it read really is on the page, the source
  becomes complete; otherwise it goes to «to review» with the data already filled in.
- Switch it on and off in **Definições → IA local**. Its status appears in **Atividade** (Activity).

## 12. Terminal commands (optional)

With the library running, in Terminal, inside the `app` folder:

```bash
./biblioteca estado
./biblioteca adicionar
./biblioteca exportar --estilo apa --formato rtf --contexto "Ensino" --saida ensino.rtf
./biblioteca exportar --pesquisa "Scarlatti" --formato bibtex
./biblioteca estilos
./biblioteca reindexar
./biblioteca titulos-obras [--aplicar] [--excluir 12,345]
./biblioteca juntar 22 23-47
./biblioteca duplicados [--aplicar]
./biblioteca testar-catalogos [--guardar]
```

`testar-catalogos` checks whether the online catalogues (RISM, DIAMM, Gallica, BnF, BSB, BNP, K10plus, Europeana,
Cantus, PEM, Bach digital, RECIPP, Google Books) respond from this Mac. It does not touch the database and does not
need the library to be running.

## 13. Common problems

| Symptom | What to do |
|---|---|
| The page does not open | If TINCTORIS is on an external disk, check it is connected; then double-click `Iniciar TINCTORIS.command`. |
| «O serviço de fundo não está a responder» (The background service is not responding) | Close the Terminal window and start again. |
| A file was left in the watch_folder | See the error in **Atividade → Registo** (Activity → Log). Full logs are in `app/registos/`. |
| Search does not find something that exists | **Definições → Reconstruir índice de pesquisa** (Rebuild search index). |
| Files in `biblioteca/` without a record (for example, after restoring a backup) | **Definições → Reler os ficheiros da biblioteca** (Re-read the library's files). |
| The database reported an error | Stop the library and restore the latest backup in **Definições → Painel de administração → Settings → Backups**. |
| You changed computer | Connect the disk and run `app/instalar.sh` once in Terminal. |
| Something does not work as expected | **Enviar comentário** (Send feedback), at the bottom of the sidebar. |

---

## Technical notes

- **Engine:** PocketBase (SQLite + REST API, single binary, in `app/bin`), served on port 8090 (on `127.0.0.1` only
  when «Abrir só neste Mac» is on — file `app/.so_local` — otherwise on `0.0.0.0`). Every collection requires a
  superuser session.
- **Schema** (`app/pb_migrations`):
  - `tipos_fonte`: field definitions in JSON;
  - `fontes`: common fields in columns, specific fields in `metadados` (JSON);
  - `notas_leitura`;
  - `textos`: full text;
  - `definicoes`.

  The design is portable to Postgres: JSON fields become JSONB, and the FTS5 index is a derived index corresponding to
  `tsvector` with `unaccent`.
- **Full-text search:** SQLite FTS5 table `fontes_fts` (`unicode61 remove_diacritics 2`), maintained by hooks in
  `app/pb_hooks`. Weights: title > authors > notes > other > text.
- **Background service** (`app/worker`, Node.js), organised by function:

  | File | Purpose |
  |---|---|
  | `src/pb.js` | database |
  | `src/index.js`, `src/processador.js` | watch folder monitoring |
  | `src/ficheiros.js` | file organisation and naming |
  | `src/extracao.js` | text and identifier extraction |
  | `src/fontes_externas/` | metadata enrichment (bibliographic, academic, audiovisual; `musicologicas.js`: RISM and DIAMM, and the order of early sources) |
  | `src/fontes_externas/bibliotecas_digitais.js` | libraries recognised from the PDF's title page (siglum, signal, identifier, link); to add a library, one new line |
  | `src/fontes_externas/gallica.js`, `bsb.js` | copy record (Gallica + BnF catalogue in UNIMARC; BSB: IIIF manifest + MARC21) and Gallica search (SRU) |
  | `src/fontes_externas/repositorios.js` | institutional DSpace 7 repositories (RECIPP); to add another, one line in `REPOSITORIOS` |
  | `src/fontes_externas/bnp.js`, `k10plus.js`, `europeana.js` | BNP (purl.pt pages), K10plus (SRU, MARC21: VD16/17/18, copies) and Europeana (other digitisations) |
  | `src/fontes_externas/compositores.js`, `bach_digital.js` | composer databases: known sources of each work and description of each source (Bach digital: Solr at `/api/v1/search`, records at `/api/v1/objects`) |
  | `src/fontes_externas/cantus.js`, `pem.js` | Cantus Index (list of sources by country), Cantus Database (`json-node`) and PEM source pages |
  | `src/fontes_externas/xml.js` | simple XML reading (SRU, OAI, MARC) without dependencies |
  | `testes/` | offline tests (`node --test testes/*.test.js`), with invented examples |
  | `src/fontes_externas/obras.js` | standardised work titles by catalogue number (IMSLP) |
  | `src/musica_antiga.js` | file-name clues for early sources (date, siglum + shelfmark, folios) |
  | `src/ocr.js` | OCR and indexing (Tesseract + Poppler) |
  | `src/exportacao.js` | export (citation-js + CSL styles in `app/estilos`) |
  | `src/servidor.js` | internal API at `127.0.0.1:8091`, reachable through `/api/bib/servico/*` |
  | `src/creditos.js` | generates `CREDITOS.md` from `app/pb_public/creditos.json` |

- **Local AI:** `src/ia.js` (Ollama at `127.0.0.1:11434`, model in `app/modelos`, started by `iniciar.sh`).
- **Cover reading:** `src/capa.js` (layout with `pdftotext -bbox-layout` or Tesseract TSV; scores, encrypted text,
  JSTOR, theses in several languages, author keywords); computed keywords in `src/palavras.js`.
- **Interface:** `app/pb_public`, in plain HTML, CSS and JavaScript, with no build step; typeface Inter (bundled).
- **Import:** `src/importacao.js` (BibTeX/RIS via citation-js; repeat detection by DOI, ISBN and compact title with
  compatible years).
- **Not yet included:** access from outside the home network and sharing with other people.
