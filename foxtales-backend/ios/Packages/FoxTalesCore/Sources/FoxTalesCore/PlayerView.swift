import SwiftUI

/// The player UI. Minimal on purpose — this is a moment, not an app. Autoplay
/// happens in `PlayerEngine.load` on appear, so by the time this is on screen the
/// story is already playing.
public struct PlayerView: View {
    private let resolved: ResolveResponse
    @StateObject private var engine = PlayerEngine()

    public init(resolved: ResolveResponse) { self.resolved = resolved }

    private var byline: String {
        let author = resolved.story.author.map { "by \($0) · " } ?? ""
        return author + "read by \(resolved.story.fromName)"
    }

    private let brass = Color(red: 0.66, green: 0.54, blue: 0.36)

    public var body: some View {
        VStack(spacing: 18) {
            Text("A story for you").font(.caption).tracking(3).foregroundStyle(.secondary)
            Text(resolved.story.title)
                .font(.system(.largeTitle, design: .serif))
                .multilineTextAlignment(.center)
            Text(byline).font(.subheadline).foregroundStyle(.secondary)
            if let note = resolved.story.note {
                Text(note)
                    .font(.system(.body, design: .serif)).italic()
                    .foregroundStyle(.secondary)
            }

            Slider(value: $engine.progress, in: 0...1) { editing in
                if !editing { engine.seek(toFraction: engine.progress) }
            }
            .tint(brass)
            .padding(.top, 8)

            HStack {
                Text(PlayerEngine.fmt(engine.currentTime)).font(.caption).monospacedDigit()
                Spacer()
                Text(PlayerEngine.fmt(engine.duration)).font(.caption).monospacedDigit()
            }
            .foregroundStyle(.secondary)

            Button {
                engine.toggle()
            } label: {
                Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title)
                    .frame(width: 66, height: 66)
                    .overlay(Circle().stroke(brass, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .padding(32)
        .onAppear { engine.load(urlString: resolved.stream.url, story: resolved.story) }
        .onDisappear { engine.stop() }
    }
}
