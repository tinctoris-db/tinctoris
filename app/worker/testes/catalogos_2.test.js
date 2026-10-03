// Testes sem internet do grupo C (2/10/2026): Gallica sem ark, BSB antiga sem URN, rótulos do Bach digital.
// Correr: cd app/worker && node --test testes/*.test.js
// ATENÇÃO: os textos de páginas abaixo são EXEMPLOS INVENTADOS que imitam o formato descrito pelo Pedro
// (não são cópias de PDFs da biblioteca).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconhecerExemplar, IDENTIFICADORES } from '../src/fontes_externas/bibliotecas_digitais.js'
import { lerNoticiaGallica, gallicaPorDescricao } from '../src/fontes_externas/gallica.js'
import { COTA_BSB } from '../src/fontes_externas/bsb.js'
import { datacaoPt, tipoPt } from '../src/fontes_externas/bach_digital.js'

test('Gallica sem ark: título, autor, ano e fundo da folha inicial e da notícia (inventado)', () => {
  const t = 'Tratado inventado de música / par Autor Fictício\nSource gallica.bnf.fr / Ancien fonds du Conservatoire\n\fFictício, Autor (1500?-1560?). Auteur du texte. Tratado inventado de música... 1555.'
  const n = lerNoticiaGallica(t)
  assert.equal(n.titulo, 'Tratado inventado de música')
  assert.equal(n.autor, 'Fictício, Autor')
  assert.equal(n.ano, '1555')
  assert.equal(n.fundo, 'Ancien fonds du Conservatoire')
  const e = reconhecerExemplar({ texto: t })
  assert.equal(e.sigla, 'F-Pn')
  assert.equal(e.id, '')
})

test('BSB antiga: cota legível sem URN (inventado)', () => {
  const t = 'Fictício, Compositor\nIL PRIMO LIBRO INVENTATO\nVenedig 1560\n4 Mus.pr. 999#Beibd.2\nCopyright … Bayerischen Staatsbibliothek'
  assert.ok(IDENTIFICADORES.test(t))
  const e = reconhecerExemplar({ texto: t })
  assert.equal(e.sigla, 'D-Mbs')
  assert.equal(e.cota, '4 Mus.pr. 999#Beibd.2')
  assert.ok(COTA_BSB.test('2 Mus.pr. 16-1/2'))
})

test('Bach digital: rótulos em português', () => {
  assert.equal(tipoPt('0005', 'collective manuscript'), 'manuscrito coletivo')
  assert.equal(datacaoPt('0001.0004', 'second half of the 18th century (ca. 1760–1789)'), '2.ª metade do séc. XVIII (c. 1760–1789)')
  assert.equal(datacaoPt('0002', 'about 1800'), 'c. 1800')
  assert.equal(datacaoPt('0000', 'unknown / not clear'), '')
})

// C-1 (2/10): a notícia da Gallica inteira, nas três formas de autor. Os três textos abaixo são o texto REAL das duas
// primeiras páginas de três PDFs da Gallica (pdftotext, sem -layout), dado pelo Pedro; as respostas da Gallica no
// último teste são INVENTADAS (no formato do SRU da Gallica).
const EPITOME = `Epitome musical des tons,
sons et accordz , es voix
humaines, fleustes
d'Alleman, fleustes à neuf
trous, violes, & [...]

Source gallica.bnf.fr / Bibliothèque nationale de France

Jambe de Fer, Philibert (1515?-1566?). Auteur du texte. Epitome
musical des tons, sons et accordz , es voix humaines, fleustes
d'Alleman, fleustes à neuf trous, violes, & violons. Item. Un petit
devis des accordz de musique ; par forme de dialogue
interrogatoire & responsif entre deux interlocuteurs. P. & I.. 1556.`
const AGRICOLA = `Source gallica.bnf.fr / Ancien fonds du Conservatoire

Agricola, Martin (1486?-1556). Ovaes // Tiones vulga = // Tiores
in Musicam, pro // Magdeburgosis Scho= // Lac pueris digestae,
per // Martinum Agri = // Colom // 1543. // Item de recto
Testudenis collo // ex arte probate, de Tonorum // formatione,
Monocher // do. ac lectionum ac. // cen tibus // [Ce titre dans un
cadre orné] //. [s.d.].
1/ Les contenus accessibles sur le site Gallica sont pour la plupart …`
const CERTON = `Source gallica.bnf.fr / Bibliothèque nationale de France

Certon / Pierre / 1515-1572 / 0220. Premier livre de chansons en quatre volumes nouvellement composées en musique à quatre parties, par M. Pierre Certon, maistres des enfans
de la S. Chapelle du palays, à Paris. De l'imprimerie, d'Adrian le Roy, et Robert Balard, Imprimeurs du Roy, rue S. Iean de Beauvais, à l'enseigne S. Genevie. 1552.
1/ Les contenus accessibles sur le site Gallica …`

test('C-1: notícia da Gallica inteira — Epitome (Auteur du texte), Agricola (sem papel) e Certon (Apelido / Nome / anos)', () => {
  const e = lerNoticiaGallica(EPITOME)
  assert.equal(e.autor, 'Jambe de Fer, Philibert')
  assert.equal(e.ano, '1556') // (não 1566, a morte do autor)
  assert.match(e.titulo, /^Epitome musical des tons, sons et accordz/)
  assert.doesNotMatch(e.titulo, /\[/)
  assert.equal(e.fundo, 'Bibliothèque nationale de France')
  const a = lerNoticiaGallica(AGRICOLA)
  assert.equal(a.autor, 'Agricola, Martin')
  assert.equal(a.ano, '1543')
  assert.equal(a.fundo, 'Ancien fonds du Conservatoire')
  assert.doesNotMatch(a.titulos.join(' '), /Les contenus/)
  const c = lerNoticiaGallica(CERTON)
  assert.equal(c.autor, 'Certon, Pierre')
  assert.equal(c.ano, '1552')
  assert.match(c.titulo, /^Premier livre de chansons/)
  for (const t of [EPITOME, AGRICOLA, CERTON]) assert.equal(reconhecerExemplar({ texto: t }).sigla, 'F-Pn')
})

test('C-1: pesquisa na Gallica só aceita um resultado único; registo sem data só pelo título e pelo fundo (respostas inventadas)', async () => {
  const registo = (ark, titulo, data, fonte) => `<srw:record><oai_dc:dc><dc:identifier>https://gallica.bnf.fr/ark:/12148/${ark}</dc:identifier><dc:title>${titulo}</dc:title>${data ? `<dc:date>${data}</dc:date>` : ''}<dc:source>${fonte}</dc:source></oai_dc:dc></srw:record>`
  let respostas = () => ''
  const pedidos = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const q = decodeURIComponent(new URL(String(url)).searchParams.get('query') || '')
    pedidos.push(q)
    return new Response(`<srw:searchRetrieveResponse><srw:records>${respostas(q)}</srw:records></srw:searchRetrieveResponse>`, { status: 200 })
  }
  try {
    // (Epitome: título + autor + ano dão um único registo)
    respostas = (q) => (q.includes('epitome') && q.includes('1556') ? registo('btv1b00000001x', 'Epitome musical des tons, sons et accordz', '1556', 'Bibliothèque nationale de France, département Musique, RES-0') : '')
    assert.equal(await gallicaPorDescricao(lerNoticiaGallica(EPITOME), ''), 'btv1b00000001x')
    // (dois registos diferentes com o mesmo título e ano, sem fundo para desempatar: nenhum)
    respostas = (q) => (q.includes('certon') && q.includes('1552') ? registo('btv1b00000002x', 'Premier livre de chansons en quatre volumes', '1552', 'BnF, RES-1') + registo('btv1b00000003x', 'Premier livre de chansons en quatre volumes', '1552', 'BnF, RES-2') : '')
    assert.equal(await gallicaPorDescricao(lerNoticiaGallica(CERTON), ''), '')
    // (Agricola: o registo da Gallica não tem data — «[s.d.]» —: só o título sem o ano, sem data e do mesmo fundo)
    // (na Gallica real, o título do registo é o mesmo texto estragado da notícia)
    const titulo = lerNoticiaGallica(AGRICOLA).titulo
    respostas = (q) => (q.includes('gallicapublication_date') ? '' : q.includes('agricola') && q.includes('ovaes') ? registo('bpt6k0000004x', titulo, '', 'Ancien fonds du Conservatoire, RES-0') + registo('btv1b00000005x', 'Musica instrumentalis deutsch', '1896', 'BnF, VM7-0') : '')
    assert.equal(await gallicaPorDescricao(lerNoticiaGallica(AGRICOLA), ''), 'bpt6k0000004x')
    // (o mesmo registo sem data mas de outro fundo: não é aceite)
    respostas = (q) => (q.includes('gallicapublication_date') ? '' : q.includes('agricola') && q.includes('ovaes') ? registo('bpt6k0000004x', titulo, '', 'Bibliothèque municipale inventada, 0') : '')
    assert.equal(await gallicaPorDescricao(lerNoticiaGallica(AGRICOLA), ''), '')
  } finally {
    globalThis.fetch = original
  }
})
