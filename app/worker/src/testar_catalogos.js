// Verificação dos catálogos online (só leitura, sem mexer na base de dados): diz, para cada catálogo, se
// responde a partir deste computador e se a resposta tem o formato que a biblioteca espera.
//   ./biblioteca testar-catalogos [--guardar]
// Com --guardar, as respostas ficam em app/registos/catalogos-AAAA-MM-DD/ (para quem for programar uma base nova,
// por exemplo a PEM, ver como ela responde).
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS } from './config.js'
import { obterTexto } from './fontes_externas/util.js'

// Exemplos públicos (impressos e manuscritos conhecidos), não fontes da biblioteca
const TESTES = [
  ['RISM', 'https://rism.online/sources/1001145660', (t) => /rism/i.test(t)],
  ['DIAMM', 'https://www.diamm.ac.uk/sources/117/', (t) => /diamm/i.test(t)],
  ['Gallica (registo do exemplar)', 'https://gallica.bnf.fr/services/OAIRecord?ark=bpt6k12803212', (t) => /Missarum liber primus/.test(t)],
  ['Gallica (pesquisa)', 'https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&maximumRecords=1&query=dc.creator%20all%20%22morales%22', (t) => /numberOfRecords/.test(t)],
  ['Catálogo da BnF', 'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=unimarcxchange&maximumRecords=1&query=bib.persistentid%20all%20%22ark:/12148/cb39789542z%22', (t) => /RES F-714/.test(t)],
  ['BSB / MDZ (exemplar)', 'https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00016944/manifest', (t) => /Call number/.test(t)],
  ['BSB (catálogo MARC)', 'https://opacplus.bsb-muenchen.de/title/BV010983548?format=marc', (t) => /datafield/.test(t)],
  ['Cantus Index (fontes)', 'https://cantusindex.org/sources?prefix=P-', (t) => /pemdatabase\.eu\/source/.test(t)],
  ['Cantus Database', 'https://cantusdatabase.org/json-node/123610', (t) => /"siglum"/.test(t)],
  ['Bach digital (pesquisa)', 'https://www.bach-digital.de/api/v1/search?q=musicrepo_work01:%22BWV%20528%22&rows=1&fl=id', (t) => /BachDigitalWork_work_/.test(t)],
  ['Bach digital (fonte)', 'https://www.bach-digital.de/api/v1/objects/BachDigitalSource_source_00000404', (t) => /Am\.B 51/.test(t)],
  ['BNP / Biblioteca Nacional Digital (purl.pt)', 'https://purl.pt/14425', (t) => /Cota do exemplar digitalizado/i.test(t)],
  ['K10plus (catálogo alemão)', 'https://sru.k10plus.de/opac-de-627?version=1.1&operation=searchRetrieve&maximumRecords=1&recordSchema=marcxml&query=pica.per%3Dpraetorius%20and%20pica.jhr%3D1619', (t) => /datafield/.test(t)],
  ['Europeana', 'https://api.europeana.eu/record/v2/search.json?wskey=api2demo&rows=1&query=who:(morales)', (t) => /"success"\s*:\s*true/.test(t)],
  ['RECIPP (P.Porto)', 'https://recipp.ipp.pt/server/api/discover/search/objects?dsoType=ITEM&size=1&query=polifonia', (t) => /indexableObject/.test(t)],
  ['Google Books', 'https://www.googleapis.com/books/v1/volumes?q=intitle:counterpoint&maxResults=1', (t) => /"items"/.test(t)],
  ['PEM (página inicial)', 'https://pemdatabase.eu/', (t) => /pem/i.test(t)],
  ['PEM (uma fonte)', 'https://pemdatabase.eu/source/47990', (t) => /Braga|Ms\.?\s*0?32/i.test(t)],
]

export async function testarCatalogos({ guardar = false } = {}) {
  const pasta = guardar ? path.join(PASTAS.app, 'registos', `catalogos-${new Date().toISOString().slice(0, 10)}`) : ''
  if (pasta) fs.mkdirSync(pasta, { recursive: true })
  for (const [nome, url, confere] of TESTES) {
    const inicio = Date.now()
    try {
      const t = await obterTexto(url, { timeout: 30000 })
      const ok = confere(t)
      console.log(`${ok ? 'OK      ' : 'ESTRANHO'} ${nome} (${((Date.now() - inicio) / 1000).toFixed(1)} s)${ok ? '' : ' — respondeu, mas não com o que se esperava'}`)
      if (pasta) fs.writeFileSync(path.join(pasta, `${nome.replace(/[^\p{L}\d]+/gu, '_')}.txt`), `${url}\n\n${t}`)
    } catch (e) {
      console.log(`FALHOU   ${nome}: ${e.message}`)
    }
  }
  if (pasta) console.log(`\nRespostas guardadas em ${pasta}`)
}
