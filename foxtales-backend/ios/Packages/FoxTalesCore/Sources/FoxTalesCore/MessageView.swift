import SwiftUI

/// The branded message surface for non-playing states (processing, revoked,
/// not found, unrecognized link). Mirrors the web player's message pages.
public struct MessageView: View {
    private let text: String

    public init(text: String) { self.text = text }

    public var body: some View {
        VStack(spacing: 12) {
            Text("FoxTales").font(.caption).tracking(3).foregroundStyle(.secondary)
            Text(text)
                .font(.system(.title3, design: .serif))
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}
