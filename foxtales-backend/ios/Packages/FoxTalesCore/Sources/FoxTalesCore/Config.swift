import Foundation

/// Runtime configuration shared by both targets.
///
/// `baseURL` defaults to production but is overridable via the `FoxTalesBaseURL`
/// Info.plist key (handy for a staging build) or by assigning it at launch
/// before the first resolve. This replaces the hard-coded constant the original
/// scaffold carried in `StoryService.swift`.
public enum FoxTalesConfig {
    public static var baseURL: URL = resolveBaseURL()

    static func resolveBaseURL() -> URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FoxTalesBaseURL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://foxtales.app")!
    }
}
