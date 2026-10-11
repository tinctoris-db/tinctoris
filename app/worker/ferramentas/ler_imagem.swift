// Lê numa fotografia os códigos de barras (EAN: ISBN dos livros) e o texto, com as ferramentas da Apple
// (Vision, já incluídas no macOS: nada é descarregado e nada sai do Mac).
// Uso: ler-imagem <imagem> [<imagem>…] → uma linha JSON por imagem:
// {"ficheiro": "…", "codigos": ["9781858131047"], "linhas": [{"texto": "…", "x": 0.1, "y": 0.8, "w": 0.3, "h": 0.02}], "erro": ""}
// (x, y, w, h: caixa da linha, de 0 a 1, com a origem no canto inferior esquerdo da imagem)
// O serviço compila-o uma vez (swiftc) para app/cache/ler-imagem — ver referencias.js.
import Foundation
import Vision

func json(_ o: Any) -> String {
  guard let d = try? JSONSerialization.data(withJSONObject: o, options: []), let s = String(data: d, encoding: .utf8) else { return "{}" }
  return s
}

for caminho in CommandLine.arguments.dropFirst() {
  var saida: [String: Any] = ["ficheiro": caminho, "codigos": [String](), "linhas": [[String: Any]](), "erro": ""]
  let pedido = VNImageRequestHandler(url: URL(fileURLWithPath: caminho), options: [:])
  let codigos = VNDetectBarcodesRequest()
  codigos.symbologies = [.ean13, .ean8, .upce]
  let texto = VNRecognizeTextRequest()
  texto.recognitionLevel = .accurate
  texto.recognitionLanguages = ["pt-PT", "en-US", "es-ES", "fr-FR", "it-IT", "de-DE", "nl-NL"]
  texto.usesLanguageCorrection = true
  do {
    try pedido.perform([codigos, texto])
    saida["codigos"] = Array(Set((codigos.results ?? []).compactMap { $0.payloadStringValue }))
    saida["linhas"] = (texto.results ?? []).compactMap { r -> [String: Any]? in
      guard let c = r.topCandidates(1).first else { return nil }
      let b = r.boundingBox
      return ["texto": c.string, "x": b.origin.x, "y": b.origin.y, "w": b.size.width, "h": b.size.height]
    }
  } catch {
    saida["erro"] = error.localizedDescription
  }
  print(json(saida))
  fflush(stdout)
}
