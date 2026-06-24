import SwiftUI

/// The shared "resolve a token -> show the right surface" container.
///
/// This is the single entry point both targets render: the App Clip drops the
/// user straight here, and the full app routes a tapped Universal Link here too.
/// All the resolve/play/error logic lives once, in FoxTalesCore.
public struct PlaybackView: View {
    private let token: String
    @StateObject private var model = PlaybackModel()

    public init(token: String) { self.token = token }

    public var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                VStack(spacing: 14) {
                    Text("FoxTales").font(.caption).tracking(3).foregroundStyle(.secondary)
                    ProgressView().controlSize(.large)
                }
            case .ready(let resolved):
                PlayerView(resolved: resolved)
            case .message(let text):
                MessageView(text: text)
            }
        }
        // `.task(id:)` re-runs if the token changes — e.g. a second card is
        // tapped while the clip is still alive.
        .task(id: token) { await model.load(token: token) }
    }
}

@MainActor
final class PlaybackModel: ObservableObject {
    enum State: Equatable {
        case idle
        case loading
        case ready(ResolveResponse)
        case message(String)
    }

    @Published var state: State = .idle

    func load(token: String) async {
        state = .loading
        do {
            let resolved = try await StoryService.shared.resolve(token: token)
            state = .ready(resolved)
        } catch StoryService.ResolveError.notReady {
            state = .message("This story is still being prepared. Try again in a minute.")
        } catch StoryService.ResolveError.gone {
            state = .message("This card was turned off.")
        } catch StoryService.ResolveError.notFound {
            state = .message("We couldn't find that story.")
        } catch {
            state = .message("We couldn't load that story.")
        }
    }
}
