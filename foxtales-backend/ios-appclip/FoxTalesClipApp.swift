import SwiftUI

// FoxTales App Clip — entry point.
//
// A tap on a tag launches this clip with the capability URL
// (https://foxtales.app/p/<token>), delivered as an NSUserActivity. We pull the
// token out and hand it to the player. The clip's only job is: resolve -> play.
//
// REQUIRES Xcode + an Apple Developer account to build/sign. See README.md.

@main
struct FoxTalesClipApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                // Tag tap / Universal Link arrives here.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { model.handle(url: url) }
                }
                // Fallback path (e.g. opened from a link).
                .onOpenURL { url in model.handle(url: url) }
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    enum State: Equatable {
        case idle
        case loading
        case ready(ResolveResponse)
        case message(String)
    }

    @Published var state: State = .idle

    /// Pull the token from `/p/<token>` and resolve it.
    func handle(url: URL) {
        guard let token = Self.token(from: url) else {
            state = .message("This card link wasn't recognized.")
            return
        }
        state = .loading
        Task {
            do {
                let resolved = try await StoryService.shared.resolve(token: token)
                state = .ready(resolved)
            } catch StoryService.ResolveError.notReady {
                state = .message("This story is still being prepared. Try again in a minute.")
            } catch StoryService.ResolveError.gone {
                state = .message("This card was turned off.")
            } catch {
                state = .message("We couldn't load that story.")
            }
        }
    }

    /// Extract the 22-char token from a `/p/<token>` path.
    static func token(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2, parts[parts.count - 2] == "p" else { return nil }
        let candidate = parts[parts.count - 1]
        let ok = candidate.count == 22 && candidate.allSatisfy { $0.isLetter || $0.isNumber }
        return ok ? candidate : nil
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView().controlSize(.large)
        case .ready(let resolved):
            PlayerView(resolved: resolved)
        case .message(let text):
            MessageView(text: text)
        }
    }
}

struct MessageView: View {
    let text: String
    var body: some View {
        VStack(spacing: 12) {
            Text("FoxTales").font(.caption).tracking(3).foregroundStyle(.secondary)
            Text(text).font(.system(.title3, design: .serif)).multilineTextAlignment(.center)
        }.padding(32)
    }
}
