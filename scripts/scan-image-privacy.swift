import Foundation
import ImageIO
import Vision

struct ScanInput: Decodable {
    let id: String
    let path: String
}

struct BarcodeResult: Encodable {
    let frameIndex: Int
    let symbology: String
    let payload: String?
}

struct ScanOutput: Encodable {
    let id: String
    let width: Int?
    let height: Int?
    let framesTotal: Int
    let framesInspected: Int
    let ocrText: String
    let barcodes: [BarcodeResult]
    let error: String?
}

let encoder = JSONEncoder()
let outputLock = NSLock()

func emit(_ output: ScanOutput) {
    guard let data = try? encoder.encode(output),
          let line = String(data: data, encoding: .utf8) else {
        return
    }

    outputLock.lock()
    print(line)
    fflush(stdout)
    outputLock.unlock()
}

func scan(_ input: ScanInput) -> ScanOutput {
    let url = URL(fileURLWithPath: input.path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        return ScanOutput(
            id: input.id,
            width: nil,
            height: nil,
            framesTotal: 0,
            framesInspected: 0,
            ocrText: "",
            barcodes: [],
            error: "image_decode_failed"
        )
    }

    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
        as? [CFString: Any]
    let width = (properties?[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue
    let height = (properties?[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue

    let framesTotal = CGImageSourceGetCount(source)
    var framesInspected = 0
    var textLines: [String] = []
    var seenText = Set<String>()
    var barcodes: [BarcodeResult] = []

    for frameIndex in 0..<framesTotal {
        guard let image = CGImageSourceCreateImageAtIndex(source, frameIndex, nil) else {
            continue
        }

        let textRequest = VNRecognizeTextRequest()
        textRequest.recognitionLevel = .accurate
        textRequest.usesLanguageCorrection = true
        textRequest.recognitionLanguages = ["zh-Hans", "en-US"]
        textRequest.minimumTextHeight = 0.006

        let barcodeRequest = VNDetectBarcodesRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])

        do {
            try handler.perform([textRequest, barcodeRequest])
        } catch {
            continue
        }
        framesInspected += 1

        for observation in textRequest.results ?? [] {
            guard let text = observation.topCandidates(1).first?.string,
                  !text.isEmpty,
                  !seenText.contains(text) else {
                continue
            }
            seenText.insert(text)
            textLines.append(text)
        }
        barcodes.append(contentsOf: (barcodeRequest.results ?? []).map {
            BarcodeResult(
                frameIndex: frameIndex,
                symbology: $0.symbology.rawValue,
                payload: $0.payloadStringValue
            )
        })
    }

    let ocrText = String(textLines.joined(separator: "\n").prefix(12_000))
    let error = framesInspected == framesTotal
        ? nil
        : "frames_incomplete:\(framesInspected)/\(framesTotal)"

    return ScanOutput(
        id: input.id,
        width: width,
        height: height,
        framesTotal: framesTotal,
        framesInspected: framesInspected,
        ocrText: ocrText,
        barcodes: barcodes,
        error: error
    )
}

let inputs: [ScanInput] = sequence(first: readLine(), next: { _ in readLine() })
    .compactMap { $0 }
    .compactMap { $0.data(using: .utf8) }
    .compactMap { try? JSONDecoder().decode(ScanInput.self, from: $0) }

let queue = OperationQueue()
let requestedConcurrency = Int(ProcessInfo.processInfo.environment["ONEWORK_VISION_CONCURRENCY"] ?? "") ?? 3
queue.maxConcurrentOperationCount = max(1, min(requestedConcurrency, 6))

for input in inputs {
    queue.addOperation {
        autoreleasepool {
            emit(scan(input))
        }
    }
}

queue.waitUntilAllOperationsAreFinished()
