import SwiftUI
import FoxTalesCore

// FoxTales full app — entry point.
//
// The parent app an App Clip requires. For Phase 1 it is deliberately thin: it
// hosts the clip and handles Universal Links on /p/* by routing to the same
// shared PlaybackView. The features that justify the full app over the clip —
// offline downloads, push ("a new story arrived"), playlist management, in-app
// recording, child mode — are future work (spec Decision 6, the ladder).
@main
struct FoxTalesApp: App {
    @State private var token: String?
    @State private var unrecognized = false

    var body: some Scene {
        WindowGroup {
            AppRootView(token: token, unrecognized: unrecognized)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    handle(activity.webpageURL)
                }
                .onOpenURL { url in handle(url) }
        }
    }

    private func handle(_ url: URL?) {
        guard let url else { return }
        if let parsed = CardLink.token(from: url) {
            token = parsed
            unrecognized = false
        } else {
            unrecognized = true
        }
    }
}
