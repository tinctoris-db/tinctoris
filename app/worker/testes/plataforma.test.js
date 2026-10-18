// plataforma.js (versão Windows, fase 1): leitura da saída dos programas do Mac e do Windows, e os comandos do Mac
// iguais aos de antes. Corre em qualquer sistema (não chama os programas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { lerPmset, lerBateriaWindows, lerMount, lerVolumesWindows, comandoEmPoupanca, comandoGentil, lixoDoSistema, MAC, WINDOWS } from '../src/plataforma.js'

test('pmset: carregador, bateria e Mac de secretária', () => {
  assert.deepEqual(lerPmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t95%; charged; 0:00 remaining present: true\n"), { carregador: true, bateria: 95 })
  assert.deepEqual(lerPmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=4653155)\t80%; discharging; 5:12 remaining present: true\n"), { carregador: false, bateria: 80 })
  assert.deepEqual(lerPmset("Now drawing from 'AC Power'\n"), { carregador: true, bateria: null })
})

test('Windows (Win32_Battery): a descarregar, ligado, sem bateria, resposta estragada', () => {
  assert.deepEqual(lerBateriaWindows('{"BatteryStatus":1,"EstimatedChargeRemaining":63}'), { carregador: false, bateria: 63 })
  assert.deepEqual(lerBateriaWindows('{"BatteryStatus":2,"EstimatedChargeRemaining":100}'), { carregador: true, bateria: 100 })
  assert.deepEqual(lerBateriaWindows('[{"BatteryStatus":1,"EstimatedChargeRemaining":40},{"BatteryStatus":2}]'), { carregador: false, bateria: 40 })
  assert.deepEqual(lerBateriaWindows(''), { carregador: true, bateria: null })
  assert.equal(lerBateriaWindows('não é json'), null)
})

test('mount do Mac: discos, sistema de ficheiros e os escondidos', () => {
  const saida = [
    '/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)',
    'map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)',
    '/dev/disk5s1 on /Volumes/Rocinante (apfs, local, nodev, nosuid, journaled, noowners)',
    '/dev/disk8s2 on /Volumes/Senhor das Trevas (hfs, local, nodev, nosuid, journaled, noowners)',
    '/dev/disk9s1 on /Volumes/PEN (exfat, local, nodev, nosuid, noowners)',
    '/dev/disk3s6 on /System/Volumes/VM (apfs, local, noexec, journaled, noatime, nobrowse)',
  ].join('\n')
  const d = lerMount(saida)
  assert.equal(d.length, 6)
  assert.deepEqual(d[2], { ponto: '/Volumes/Rocinante', sistema: 'apfs', oculto: false })
  assert.deepEqual(d[3], { ponto: '/Volumes/Senhor das Trevas', sistema: 'hfs', oculto: false })
  assert.equal(d[4].sistema, 'exfat')
  assert.equal(d[1].oculto, true)
  assert.equal(d[5].oculto, true)
})

test('Get-Volume do Windows: só as unidades com letra', () => {
  const json = JSON.stringify([
    { DriveLetter: 'C', FileSystem: 'NTFS', FileSystemLabel: 'Windows' },
    { DriveLetter: null, FileSystem: 'NTFS', FileSystemLabel: 'Recovery' },
    { DriveLetter: 'e', FileSystem: 'exFAT', FileSystemLabel: 'TINCTORIS' },
  ])
  assert.deepEqual(lerVolumesWindows(json), [
    { ponto: 'C:\\', sistema: 'ntfs', oculto: false, nome: 'Windows' },
    { ponto: 'E:\\', sistema: 'exfat', oculto: false, nome: 'TINCTORIS' },
  ])
  assert.deepEqual(lerVolumesWindows('{"DriveLetter":"D","FileSystem":"FAT32","FileSystemLabel":""}'), [{ ponto: 'D:\\', sistema: 'fat32', oculto: false, nome: '' }])
  assert.deepEqual(lerVolumesWindows(''), [])
})

test('comandos: no Mac exactamente os de antes', { skip: !MAC }, () => {
  assert.deepEqual(comandoEmPoupanca('/opt/homebrew/bin/pdftoppm', ['-r', '100']), ['/usr/sbin/taskpolicy', ['-b', '/opt/homebrew/bin/pdftoppm', '-r', '100']])
  assert.deepEqual(comandoGentil(['/opt/homebrew/bin/pdftoppm', '-r', '72']), ['nice', ['-n', '15', '/opt/homebrew/bin/pdftoppm', '-r', '72']])
})

test('comandos: em Windows sem taskpolicy nem nice', { skip: !WINDOWS }, () => {
  assert.deepEqual(comandoEmPoupanca('pdftoppm.exe', ['-r', '100']), ['pdftoppm.exe', ['-r', '100']])
  assert.deepEqual(comandoGentil(['pdftoppm.exe', '-r', '72']), ['pdftoppm.exe', ['-r', '72']])
})

test('Lixo: LIXO_DIR passa à frente; no Mac, o Lixo do disco externo', () => {
  const antes = process.env.LIXO_DIR
  try {
    process.env.LIXO_DIR = '/tmp/lixo-de-teste'
    assert.equal(lixoDoSistema('/Volumes/Rocinante/Biblioteca/biblioteca'), '/tmp/lixo-de-teste')
    delete process.env.LIXO_DIR
    if (MAC) assert.match(lixoDoSistema('/Volumes/Rocinante/Biblioteca/biblioteca'), new RegExp(`^/Volumes/Rocinante/\\.Trashes/\\d+$`))
    if (WINDOWS) assert.equal(lixoDoSistema(process.cwd()), path.join(path.parse(process.cwd()).root, 'TINCTORIS - Lixo'))
  } finally {
    if (antes === undefined) delete process.env.LIXO_DIR
    else process.env.LIXO_DIR = antes
  }
})

test('ler_imagem: linhas do TSV do Tesseract com a caixa de 0 a 1 (origem em baixo, como o leitor da Apple)', async () => {
  const { linhasDoTsv } = await import('../src/ler_imagem.js')
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
    '4\t1\t1\t1\t1\t0\t100\t200\t500\t50\t-1\t',
    '5\t1\t1\t1\t1\t1\t100\t200\t200\t50\t95.1\tA',
    '5\t1\t1\t1\t1\t2\t350\t210\t250\t40\t93.0\tGarden',
    '5\t1\t1\t1\t2\t1\t100\t1800\t300\t100\t90.0\t9789728696085',
    '5\t1\t1\t1\t3\t1\t0\t0\t10\t10\t-1\t ',
  ].join('\n')
  assert.deepEqual(linhasDoTsv(tsv), [
    { texto: 'A Garden', x: 0.1, y: 0.875, w: 0.5, h: 0.025 },
    { texto: '9789728696085', x: 0.1, y: 0.05, w: 0.3, h: 0.05 },
  ])
  assert.deepEqual(linhasDoTsv(''), [])
})
