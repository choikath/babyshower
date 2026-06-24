import Foundation

/// Parsing for the capability URL a tag carries: `https://foxtales.app/p/<token>`.
/// The token is a 22-char base62 string (~131 bits) minted by the backend
/// (`src/token.ts`). We validate shape only — the backend is the authority on
/// whether a token resolves.
public enum CardLink {
    /// Extract the token from the trailing `/p/<token>` of a URL, or nil if the
    /// path doesn't look like a card link.
    public static func token(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2, parts[parts.count - 2] == "p" else { return nil }
        let candidate = parts[parts.count - 1]
        let ok = candidate.count == 22 && candidate.allSatisfy { $0.isLetter || $0.isNumber }
        return ok ? candidate : nil
    }
}
