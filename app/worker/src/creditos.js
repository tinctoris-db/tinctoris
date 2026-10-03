// Gera o CREDITOS.md (raiz do repositório) a partir de app/pb_public/creditos.json, a mesma fonte que a app mostra
// em «Acerca e ajuda» → Créditos. Correr depois de acrescentar uma contribuição:  node app/worker/src/creditos.js
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS } from './config.js'

const c = JSON.parse(fs.readFileSync(path.join(PASTAS.app, 'pb_public', 'creditos.json'), 'utf8'))
const pessoas = (lista) =>
  (lista || []).length
    ? lista.map((p) => [`**${p.nome}**${p.onde ? ` (${p.onde})` : ''}`, ...(p.alteracoes || []).map((a) => `- ${a.texto}${a.versao ? ` — ${a.versao}` : ''}`)].join('\n')).join('\n\n')
    : '*Ainda sem contribuições.*'

const md = `# Créditos do TINCTORIS

<!-- Gerado por app/worker/src/creditos.js a partir de app/pb_public/creditos.json: não editar à mão. -->

## Conceção e desenvolvimento

${c.nota}

## Contribuições para o código

${pessoas(c.codigo)}

## Tradução e revisão

${pessoas(c.traducao)}

## Beta testers

${pessoas(c.testers)}

Só aparecem os testers que deixaram o nome e marcaram «Aceito aparecer nos créditos» no formulário de comentários.

## Projetos e catálogos

O TINCTORIS existe graças ao trabalho aberto destes projetos:

${(c.projetos || []).map((p) => `- **${p.nome}**${p.papel ? `, ${p.papel}` : ''}`).join('\n')}

Licenças de cada componente: [TERCEIROS.md](TERCEIROS.md).
`
const destino = path.join(PASTAS.raiz, 'CREDITOS.md')
fs.writeFileSync(destino, md)
console.log(`Escrito ${destino}`)
