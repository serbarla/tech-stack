import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let cg = rep.cgImage else { exit(2) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([req])
let w = CGFloat(cg.width), h = CGFloat(cg.height)
for obs in req.results ?? [] {
  guard let cand = obs.topCandidates(1).first else { continue }
  let b = obs.boundingBox
  let x = b.origin.x * w
  let y = (1 - b.origin.y - b.size.height) * h
  print(String(format: "%.0f\t%.0f\t%.0f\t%.0f\t%@", x, y, b.size.width * w, b.size.height * h, cand.string))
}
