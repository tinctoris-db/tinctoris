// Fontes audiovisuais: MusicBrainz, iTunes/Apple Music, Deezer, YouTube.
import { obterJson, pessoa, candidato, limitador } from './util.js'
import { formatarDuracao } from '../extracao.js'

const esperaMusicBrainz = limitador(1100)

// ---------------- MusicBrainz (base de dados aberta de gravações)

export async function musicBrainzPesquisar({ titulo, artista, linhas = 5 }, email) {
  if (!titulo) return []
  const aspas = (s) => '"' + s.replace(/["\\]/g, ' ') + '"'
  let q = `recording:${aspas(titulo)}`
  if (artista) q += ` AND artist:${aspas(artista)}`
  await esperaMusicBrainz()
  const j = await obterJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=${linhas}`, { email })
  return (j.recordings || []).map((r) => {
    const rel = (r.releases || [])[0] || {}
    return candidato({
      fonte: 'MusicBrainz',
      tipo_sugerido: 'Gravação',
      titulo: r.title,
      autores: (r['artist-credit'] || []).map((a) => pessoa(a.artist?.['sort-name'] || a.name, 'intérprete')).filter(Boolean),
      data: r['first-release-date'] || rel.date || '',
      url: `https://musicbrainz.org/recording/${r.id}`,
      metadados: {
        album: rel.title || '',
        duracao: r.length ? formatarDuracao(r.length / 1000) : '',
      },
    })
  })
}

// ---------------- iTunes / Apple Music (catálogo comercial, sem chave)

export async function itunesPesquisar({ titulo, artista, linhas = 5 }, email) {
  if (!titulo) return []
  const termo = [artista, titulo].filter(Boolean).join(' ')
  const j = await obterJson(`https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&media=music&entity=song&limit=${linhas}`, { email })
  return (j.results || []).map((r) =>
    candidato({
      fonte: 'Apple Music',
      tipo_sugerido: 'Gravação',
      titulo: r.trackName,
      autores: [pessoa(r.artistName, 'intérprete')].filter(Boolean),
      data: (r.releaseDate || '').slice(0, 10),
      url: r.trackViewUrl || '',
      metadados: {
        album: r.collectionName || '',
        duracao: r.trackTimeMillis ? formatarDuracao(r.trackTimeMillis / 1000) : '',
        suporte: 'Streaming',
      },
    })
  )
}

// ---------------- Deezer (streaming, sem chave)

export async function deezerPesquisar({ titulo, artista, linhas = 5 }, email) {
  if (!titulo) return []
  const q = artista ? `track:"${titulo}" artist:"${artista}"` : titulo
  const j = await obterJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${linhas}`, { email })
  return (j.data || []).map((r) =>
    candidato({
      fonte: 'Deezer',
      tipo_sugerido: 'Gravação',
      titulo: r.title,
      autores: [pessoa(r.artist?.name, 'intérprete')].filter(Boolean),
      url: r.link || '',
      metadados: {
        album: r.album?.title || '',
        duracao: r.duration ? formatarDuracao(r.duration) : '',
        suporte: 'Streaming',
      },
    })
  )
}

// ---------------- YouTube (requer chave gratuita da YouTube Data API v3)

const entidades = (s) =>
  String(s || '').replace(/&(amp|quot|#39|lt|gt);/g, (_, e) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[e])

export async function youtubePesquisar({ titulo, artista, linhas = 5 }, email, chave) {
  if (!titulo || !chave) return []
  const q = [artista, titulo].filter(Boolean).join(' ')
  const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: String(linhas), q, key: chave })
  const j = await obterJson(`https://www.googleapis.com/youtube/v3/search?${p}`, { email })
  return (j.items || []).map((it) =>
    candidato({
      fonte: 'YouTube',
      tipo_sugerido: 'Vídeo',
      titulo: entidades(it.snippet?.title),
      autores: [],
      data: (it.snippet?.publishedAt || '').slice(0, 10),
      editora: entidades(it.snippet?.channelTitle),
      url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
      metadados: { plataforma: 'YouTube' },
    })
  )
}
