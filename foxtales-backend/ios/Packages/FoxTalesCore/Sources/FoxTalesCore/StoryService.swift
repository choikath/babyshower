import Foundation

/// Talks to the resolver's JSON face: `GET /p/<token>` with
/// `Accept: application/json`. Maps HTTP status to the same states the web
/// player handles (spec 1.1). This is the iOS side of the content-negotiation
/// fork — browsers get a 302 to the web player instead.
public final class StoryService: Sendable {
    public static let shared = StoryService()
    public init() {}

    public enum ResolveError: Error, Equatable {
        case notReady   // 202 processing / 409 unlinked
        case gone       // 410 revoked
        case notFound   // 404
        case bad        // anything else / transport failure
    }

    public func resolve(token: String) async throws -> ResolveResponse {
        let url = FoxTalesConfig.baseURL
            .appendingPathComponent("p")
            .appendingPathComponent(token)
        var req = URLRequest(url: url)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ResolveError.bad }
        switch http.statusCode {
        case 200: return try JSONDecoder().decode(ResolveResponse.self, from: data)
        case 202, 409: throw ResolveError.notReady
        case 410: throw ResolveError.gone
        case 404: throw ResolveError.notFound
        default: throw ResolveError.bad
        }
    }
}
