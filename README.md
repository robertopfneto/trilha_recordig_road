# Trilha

App de captura de vídeo com trilha de GPS. Cada vídeo sabe onde começou, e cada
segundo do vídeo sabe por onde você estava passando.

Tudo fica no aparelho: nenhum dado sai do celular. React Native + Expo, Android e iOS.

---

## Como funciona

O erro comum ao construir esse tipo de app é tentar "gravar GPS dentro do vídeo".
Aqui os dois fluxos são independentes e se encontram por **timestamp absoluto**:

- o serviço de localização grava pontos no SQLite com `ts` em epoch (ms), rodando
  o tempo todo, gravando ou não;
- ao iniciar a gravação guardamos `startedAt = Date.now()`;
- a posição no instante `t` do vídeo são os pontos com `ts` entre início e fim,
  com offset `ts - startedAt`, interpolados.

Consequência prática: se o app morrer no meio de uma gravação, a trilha continua
íntegra no banco. Você perde o vídeo, não o percurso.

```
       GPS  ──▶  SQLite (track_points)  ──┐
                                          ├──▶  offsetMs = ts − startedAt
    Câmera  ──▶  arquivo .mp4 + startedAt ─┘
```

## Onde a localização é gravada

Três camadas, todas configuráveis em **Ajustes → Metadados**:

| Camada | Guarda | Lido por |
| --- | --- | --- |
| `moov > udta > ©xyz` dentro do `.mp4` | 1 ponto (onde começou) | Google Fotos, Windows, macOS Finder, ffmpeg, ExifTool |
| SQLite | trilha completa, sempre | o próprio app |
| `.json` / `.gpx` ao lado do vídeo | trilha completa do trecho | qualquer coisa; o GPX abre no Google Earth, QGIS, Strava, Garmin |

O átomo `©xyz` é escrito em **JavaScript puro**, sem módulo nativo e sem ffmpeg
(`src/media/mp4Location.ts`). Android e iOS finalizam a gravação escrevendo o
átomo `moov` no fim do arquivo, então só ele é reescrito — alguns kilobytes,
independentemente de o vídeo ter 3 MB ou 3 GB. O `mdat` não é tocado, então não
há re-encode nem perda de qualidade.

Se o `moov` estiver no início (arquivo com *faststart*, vindo de outra fonte),
o app desiste dessa camada e registra `metadata_embedded = 0` — mexer no tamanho
do `moov` ali deslocaria o `mdat` e exigiria corrigir todos os offsets de
`stco`/`co64`. Os arquivos ao lado continuam funcionando.

## Configurações

Perfis de GPS prontos, e todo parâmetro individual editável (mexer em qualquer
um deles muda o perfil para "personalizado"):

| Perfil | Precisão | Ponto a cada | Bateria |
| --- | --- | --- | --- |
| Economia | Balanced | 50 m / 30 s | dura o dia |
| Equilibrado | High | 10 m / 5 s | padrão recomendado |
| Preciso | BestForNavigation | 1 s, sem filtro de distância | trechos curtos |

O parâmetro que mais economiza bateria é `distanceInterval`: parado, o aparelho
simplesmente não gera pontos. O segundo é `deferredUpdatesInterval`, que agrupa
entregas em segundo plano para o sistema acordar o app menos vezes.

Também configuráveis: resolução do vídeo (480p a 4K, com estimativa de MB por
minuto), áudio, duração e tamanho máximos por arquivo, limiar de lacuna.

## Rodando

Localização em segundo plano **não funciona no Expo Go** — é preciso um
development build.

```bash
npm install
npx expo prebuild            # gera android/ e ios/
npm run android              # ou: npm run ios
```

Depois, com o Metro rodando:

```bash
npm start
```

Testes (não precisam de aparelho; os de MP4 usam ffmpeg local):

```bash
npm test
```

## Permissões

O Android exige que a permissão de primeiro plano seja concedida **antes** de a
de segundo plano ser pedida — pedir as duas juntas faz o sistema negar em
silêncio. O fluxo em `src/location/service.ts` já respeita essa ordem.

No Android, o serviço em primeiro plano mostra uma notificação persistente; é
obrigatório e não dá para esconder. Fabricantes como Xiaomi, Samsung e Motorola
ainda assim encerram serviços de forma agressiva — vale desativar a otimização
de bateria para o app nos ajustes do sistema.

## Estrutura

```
app/                    telas (expo-router)
  index.tsx             câmera, com indicador de sinal do GPS
  settings.tsx          ajustes
  library.tsx           gravações
src/
  db/index.ts           SQLite: esquema, sessões, pontos, gravações, kv
  location/task.ts      task de segundo plano (registrada no escopo do módulo)
  location/service.ts   permissões, start/stop, posição instantânea
  media/mp4Location.ts  átomo ©xyz — bytes puros, testável fora do aparelho
  media/embedLocation.ts   I/O: reescreve só o moov via FileHandle
  media/track.ts        interpolação, distância, lacunas
  media/sidecar.ts      .json e .gpx
  media/pipeline.ts     begin/finalize de uma gravação
  settings/             perfis, defaults e persistência
tests/                  testes de MP4 e de trilha (Node, sem aparelho)
```

## Notas de projeto

**A task de localização roda em outro contexto JS.** Quando o sistema acorda o
app em segundo plano, o bundle é executado do zero e não existe estado do React.
Por isso `TaskManager.defineTask` fica no escopo de módulo (importado por
`app/_layout.tsx`) e por isso as configurações vivem no SQLite, não em memória —
é o único ponto de encontro entre a interface e o rastreamento.

**Pontos são gravados na hora, nunca acumulados.** Custa mais escrita em disco e
economiza a única coisa que não dá para recuperar.

**Lacunas não são interpoladas.** Túnel, estacionamento ou app morto deixam um
buraco; acima do limiar configurado o traçado é quebrado em segmentos em vez de
desenhar uma reta atravessando a cidade.

## Estado

Fases 1 a 3 do plano: câmera, trilha em segundo plano, banco, metadados e
ajustes. Faltam o mapa (`react-native-maps`) e o player com marcador
sincronizado.

## Licença

MIT.
