# Como colaborar com o TINCTORIS

Obrigado pelo interesse. O TINCTORIS é uma base de dados de fontes para musicologia, investigação artística e ensino,
mantida por Pedro Sousa Silva (ESMAE – Politécnico do Porto). Está em versão beta: todas as contribuições contam,
mesmo as mais pequenas, e quem contribui aparece nos [créditos](CREDITOS.md).

## Sem programar

- **Comentários e erros:** no próprio programa, «Enviar comentário» (no fundo da barra lateral) abre um formulário
  curto: não funciona, podia funcionar melhor, falta fazer ou dúvida de utilização. A versão do programa e do macOS e
  os últimos erros técnicos vão preenchidos automaticamente; nunca vão títulos, nomes de ficheiros nem fontes.
- **Tradução e revisão:** correções ao manual (`README.md`), ao guia de instalação (`GUIA-INSTALACAO.md`) ou aos
  textos da interface são bem-vindas. Pode indicá-las pelo formulário ou propô-las no GitHub (ver abaixo).
- **Conhecimento de arquivos e catálogos:** siglas RISM, abreviaturas de bibliotecas, catálogos de compositores ou
  bases de fontes que o TINCTORIS ainda não consulta. Diga-nos pelo formulário.

## Com código

1. Faça um *fork* deste repositório e trabalhe num ramo próprio.
2. Mantenha cada proposta pequena e com um só objetivo.
3. Corra os testes automáticos antes de propor:
   ```
   cd app/worker && npm install && node --test testes/*.test.js
   ```
4. Abra um *Pull Request* a explicar, em linguagem simples, o que muda para quem usa o programa e porquê.
5. Antes de juntar, o mantenedor testa a proposta no seu Mac, numa cópia isolada da sua biblioteca real.
   Só entra com o OK dele.

### Regras

- **Nunca** incluir fontes, bases de dados, cópias de segurança, registos, chaves ou palavras-passe (o `.gitignore`
  deixa-os de fora: não use `git add -f`).
- A interface fala com quem não programa: português de Portugal simples, sem jargão, a dizer o que acontece e o que
  fazer. Comentários no código e mensagens de *commit* também em português.
- Identidade gráfica: preto e branco, letra Inter, seleção a cinzento; **vermelho só para alertas** e para o que
  precisa da intervenção de quem usa o programa.
- A identificação de fontes segue decisões já tomadas (ver `CLAUDE.md`): catálogos de fontes (RISM, DIAMM, IMSLP)
  primeiro, o nome do ficheiro manda, a reanálise nunca esvazia um campo, manuscritos e fotografias nunca ficam
  «completos» por catálogos modernos. Uma proposta que mude estas regras deve explicá-lo no *Pull Request*.
- Alterações ao esquema da base de dados entram como migração nova em `app/pb_migrations/` (nunca editar uma antiga).

### Licença das contribuições

Ao propor uma contribuição, aceita que fique disponível nos termos das licenças do projeto: **GNU AGPL 3.0 ou
posterior** para o código (`LICENSE`) e **CC BY-SA 4.0** para a documentação (`LICENSE-docs.md`). Mantém os direitos de
autor sobre o que escreveu (ver `COPYRIGHT.md`).

## Créditos

Cada contribuição aceite entra nos créditos, com o seu nome e uma frase simples sobre o que mudou. Os créditos estão
em `app/pb_public/creditos.json` (a app mostra-os em «Acerca e ajuda» → Créditos) e o `CREDITOS.md` é gerado a partir dele
com `node app/worker/src/creditos.js`. Os beta testers só aparecem se o pedirem no formulário.

## Convivência

Trate todas as pessoas com respeito. Discordâncias técnicas resolvem-se com argumentos e exemplos concretos.

---

## Contributing (English summary)

TINCTORIS is a sources database for musicology, artistic research and teaching, maintained by Pedro Sousa Silva
(ESMAE – Polytechnic of Porto), currently in beta. Feedback and bug reports: use «Enviar comentário» (Send feedback)
inside the app. Code: fork, work on a branch, keep changes small, run `cd app/worker && npm install && node --test
testes/*.test.js`, and open a Pull Request explaining the change in plain language. The maintainer tests every
proposal on an isolated copy of a real library before merging. Never commit sources, databases, backups, logs or
secrets. The user interface is in European Portuguese (English is planned). Contributions are licensed under the
GNU AGPL 3.0 or later (code) and CC BY-SA 4.0 (documentation); contributors keep their copyright and are listed in
the credits.
