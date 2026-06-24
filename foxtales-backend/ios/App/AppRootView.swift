import SwiftUI
import FoxTalesCore

struct AppRootView: View {
    let token: String?
    let unrecognized: Bool

    var body: some View {
        if let token {
            PlaybackView(token: token)
        } else {
            HomeView(unrecognized: unrecognized)
        }
    }
}

/// Minimal home surface shown when the app is opened directly (not via a card).
/// Intentionally sparse for Phase 1 — the app's reason to exist beyond the clip
/// is the future feature set, not this screen.
struct HomeView: View {
    let unrecognized: Bool

    var body: some View {
        VStack(spacing: 16) {
            Text("FoxTales").font(.caption).tracking(3).foregroundStyle(.secondary)
            Text("A story for you")
                .font(.system(.largeTitle, design: .serif))
                .multilineTextAlignment(.center)
            Text(unrecognized
                 ? "That card link wasn't recognized."
                 : "Tap a FoxTales card to your phone to play a story.")
                .font(.system(.body, design: .serif))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}
