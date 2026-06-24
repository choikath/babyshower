import SwiftUI
import FoxTalesCore

// FoxTales App Clip — entry point.
//
// A tap on a tag launches this clip with the capability URL
// (https://foxtales.app/p/<token>), delivered as an NSUserActivity. We pull the
// token out and hand it to the shared PlaybackView. The clip's only job is:
// resolve -> play. Everything below the entry point lives in FoxTalesCore and is
// shared verbatim with the full app.
@main
struct FoxTalesClipApp: App {
    @State private var token: String?
    @State private var unrecognized = false

    var body: some Scene {
        WindowGroup {
            ClipRootView(token: token, unrecognized: unrecognized)
                // Tag tap / Universal Link arrives here.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    handle(activity.webpageURL)
                }
                // Fallback path (e.g. opened from a link).
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

struct ClipRootView: View {
    let token: String?
    let unrecognized: Bool

    var body: some View {
        if let token {
            PlaybackView(token: token)
        } else if unrecognized {
            MessageView(text: "This card link wasn't recognized.")
        } else {
            // Launched without an invocation URL (e.g. the App Store card preview).
            MessageView(text: "Tap a FoxTales card to your phone to play its story.")
        }
    }
}
