import Foundation

// Decoded shape of the resolver's JSON face (`GET /p/<token>`,
// `Accept: application/json`). Mirrors what the backend returns in
// `src/routes/resolver.ts` — keep the two in sync.

public struct ResolveResponse: Codable, Equatable, Sendable {
    public struct Story: Codable, Equatable, Sendable {
        public let id: String
        public let title: String
        public let author: String?
        public let fromName: String
        public let note: String?
        public let durationSec: Double?
        public let peaksUrl: String?
    }

    public struct Stream: Codable, Equatable, Sendable {
        /// Short-lived signed media URL (default 10 min). Never cache it.
        public let url: String
        public let expiresAt: String
    }

    public let story: Story
    public let stream: Stream
}
