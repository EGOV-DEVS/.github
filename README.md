# EGOV-DEVS

Perfil público da organização: [`profile/README.md`](profile/README.md).

O GitHub mostra esse arquivo na página da org. Este README é só do repositório.

## Atualizar o perfil

1. Edite frases, títulos ou a lista em [`featured.json`](featured.json).
2. Rode a Action **Update org profile** ou espere a execução de segunda-feira.
3. A Action regrava só o bloco entre `<!-- FEATURED:START -->` e `<!-- FEATURED:END -->`. Logo e texto de abertura ficam intactos.

A Action precisa do secret `ORG_READ_TOKEN`: fine-grained PAT da org `EGOV-DEVS`, com **Contents: Read** nos repositórios listados em `featured.json`.
