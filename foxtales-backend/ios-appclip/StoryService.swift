import Foundation

// Talks to the resolver's JSON face: GET /p/<token> with Accept: application/json.
// Maps HTTP status to the same states the web player handles.

struct ResolveResponse: Codable, Equatable {
    struct Story: Codable, Equatable {
        let id: String
        let title: String
        let author: String?
        let fromName: String
        let note: String?
        let durationSec: Double?
        let peaksUrl: String?
    }
    struct Stream: Codable, Equatable {
        let url: String
        let expiresAt: String
    }
    let story: Story
    let stream: Stream
}

enum FoxTales {
    // TODO: set to your production origin.
    static let baseURL = URL(string: "https://foxtales.app")!
}

final class StoryService {
    static let shared = StoryService()

    enum ResolveError: Error { case notReady, gone, notFound, bad }

    func resolve(token: String) async throws -> ResolveResponse {
        var req = URLRequest(url: FoxTales.baseURL.appendingPathComponent("p").appendingPathComponent(token))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ResolveError.bad }
        switch http.statusCode {
        case 200: return try JSONDecoder().decode(ResolveResponse.self, from: data)
        case 202, 409: throw ResolveError.notReady   // processing / unlinked
        case 410: throw ResolveError.gone            // revoked
        case 404: throw ResolveError.notFound
        default: throw ResolveError.bad
        }
    }
}
