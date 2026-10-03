// Bases de dados dedicadas a um compositor (modelo: Bach digital). Dizem, para cada obra, todas as fontes conhecidas
// (arquivo e cota, autógrafo ou cópia, datação) e descrevem cada fonte (copista, proveniência).
// Para acrescentar outra base: uma entrada nova em BASES, com o prefixo do catálogo de obras que a identifica
// (BWV → Bach digital) e as funções obra / fontesDaObra.
// Candidatas, a confirmar uma a uma (ver o Pull Request): Weber-Gesamtausgabe (tem interface JSON), Köchel-Verzeichnis
// online do Mozarteum, Beethoven-Haus (arquivo digital), C. P. E. Bach Complete Works.
import { bachObra, bachFontesDaObra } from './bach_digital.js'

const BASES = [
  {
    nome: 'Bach digital',
    catalogo: /^BWV\s/i,
    obra: bachObra,
    fontesDaObra: async (obra, email) => (await bachFontesDaObra(obra.id, email)).map((f) => f.linha),
  },
]

// Fontes conhecidas de uma obra pelo número de catálogo ("BWV 528"):
// { base, url, linhas: ["D-B Am.B 51 — collective manuscript, copy, …", …] } ou null
export async function fontesConhecidas(codigo, email) {
  const base = BASES.find((b) => b.catalogo.test(String(codigo || '')))
  if (!base) return null
  const obra = await base.obra(codigo, email)
  if (!obra) return null
  const linhas = await base.fontesDaObra(obra, email)
  return { base: base.nome, url: obra.url, linhas }
}
