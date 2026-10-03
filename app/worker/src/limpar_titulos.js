// Títulos estragados por uma versão antiga: sem título melhor, o título vinha do nome que a própria
// biblioteca deu ao ficheiro ("SD ANONIMO SD-ANONIMO-Boismortier-Sonate-Trio-2-G-I"), e o prefixo repetia-se
// a cada reanálise. Nas fichas por rever, o título passa a ser o nome original do ficheiro e o ficheiro é
// renomeado de acordo (pelo serviço, que é quem move ficheiros).
import path from 'node:path'
import { pb } from './pb.js'

// "SD ANONIMO ", "1733 HEBREO ", "SD BACH SD-ANONIMO-…": prefixos do nome dado pela biblioteca
const PREFIXO = /^(?:(?:SD|\d{4}(?:-\d{2}){0,2}) [A-Z0-9][A-Z0-9-]* )+/
const EXTENSAO = /\.(pdf|mus|musx|mid|midi|kar|sib|mscz|xml|musicxml|mxl|doc|docx|rtf|txt|jpe?g|png|tiff?|gif|heic|mp3|wav|m4a|flac)$/i

export function tituloEstragado(titulo) {
  const m = PREFIXO.exec(String(titulo || ''))
  // (só quando o resto é o nome de ficheiro com hífenes, sem espaços: um título lido da capa nunca é assim)
  // ("… canzona-altus 2": o número de cópia no fim também conta)
  return !!m && !/\s/.test(titulo.slice(m[0].length).trim().replace(/\s+\d{1,2}$/, ''))
}

export function tituloDoOriginal(nome) {
  let b = path.basename(String(nome || '')).normalize('NFC')
  while (EXTENSAO.test(b)) b = b.replace(EXTENSAO, '')
  return b.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function limparTitulos({ aplicar = false, servico } = {}) {
  const lista = await pb.collection('fontes').getFullList({ filter: "estado = 'a_rever' && ficheiro != '' && ficheiro_original != ''", fields: 'id,numero,titulo,ficheiro_original' })
  const mudar = lista.filter((f) => tituloEstragado(f.titulo)).map((f) => ({ ...f, novo: tituloDoOriginal(f.ficheiro_original) })).filter((f) => f.novo && f.novo !== f.titulo)
  let feitas = 0
  let saltadas = 0
  if (aplicar) {
    for (const f of mudar) {
      // (a reanálise pode ter mexido nela entretanto: reler, e não tocar nas que mudaram ou estão a ser processadas)
      const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,titulo,estado' })
      if (atual.estado !== 'a_rever' || atual.titulo !== f.titulo) {
        saltadas++
        continue
      }
      await pb.collection('fontes').update(f.id, { titulo: f.novo })
      try {
        await servico('reorganizar', { id: f.id })
      } catch (e) {
        f.aviso = e.message
      }
      feitas++
    }
  }
  return { mudar, feitas, saltadas }
}
