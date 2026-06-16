import SwiftUI
import AVFoundation
import Combine

// The clip's player. Because a tag tap launches the app into the foreground,
// playback may begin on appear without an extra tap (spec 6.1 — native autoplay
// is allowed, unlike the web fallback). Keep the UI minimal: this is a moment,
// not an app.

struct PlayerView: View {
    let resolved: ResolveResponse
    @StateObject private var engine = PlayerEngine()

    private var byline: String {
        let author = resolved.story.author.map { "by \($0) · " } ?? ""
        return author + "read by \(resolved.story.fromName)"
    }

    var body: some View {
        VStack(spacing: 18) {
            Text("A story for you").font(.caption).tracking(3).foregroundStyle(.secondary)
            Text(resolved.story.title)
                .font(.system(.largeTitle, design: .serif)).multilineTextAlignment(.center)
            Text(byline).font(.subheadline).foregroundStyle(.secondary)
            if let note = resolved.story.note {
                Text(note).font(.system(.body, design: .serif)).italic().foregroundStyle(.secondary)
            }

            Slider(value: $engine.progress, in: 0...1) { editing in
                if !editing { engine.seek(toFraction: engine.progress) }
            }
            .tint(Color(red: 0.66, green: 0.54, blue: 0.36)) // brass
            .padding(.top, 8)

            HStack {
                Text(PlayerEngine.fmt(engine.currentTime)).font(.caption).monospacedDigit()
                Spacer()
                Text(PlayerEngine.fmt(engine.duration)).font(.caption).monospacedDigit()
            }.foregroundStyle(.secondary)

            Button {
                engine.toggle()
            } label: {
                Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title)
                    .frame(width: 66, height: 66)
                    .overlay(Circle().stroke(Color(red: 0.66, green: 0.54, blue: 0.36), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .padding(32)
        .onAppear { engine.load(urlString: resolved.stream.url, story: resolved.story) }
        .onDisappear { engine.stop() }
    }
}

@MainActor
final class PlayerEngine: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?

    func load(urlString: String, story: ResolveResponse.Story) {
        guard let url = URL(string: urlString) else { return }
        NowPlaying.activateAudioSession()
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p

        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] t in
            guard let self, let dur = self.player?.currentItem?.duration.seconds, dur.isFinite, dur > 0 else { return }
            self.currentTime = t.seconds
            self.duration = dur
            self.progress = t.seconds / dur
            NowPlaying.update(elapsed: t.seconds, duration: dur, rate: self.isPlaying ? 1 : 0)
        }

        NowPlaying.configureRemoteCommands(play: { [weak self] in self?.play() },
                                           pause: { [weak self] in self?.pause() },
                                           seek: { [weak self] s in self?.seek(toSeconds: s) })
        NowPlaying.setMetadata(title: story.title,
                               artist: (story.author.map { "by \($0) · " } ?? "") + "read by \(story.fromName)")
        play() // autoplay on launch
    }

    func toggle() { isPlaying ? pause() : play() }
    func play() { player?.play(); isPlaying = true }
    func pause() { player?.pause(); isPlaying = false }
    func stop() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player?.pause()
        player = nil
    }

    func seek(toFraction f: Double) {
        guard duration > 0 else { return }
        seek(toSeconds: f * duration)
    }
    func seek(toSeconds s: Double) {
        player?.seek(to: CMTime(seconds: s, preferredTimescale: 600))
    }

    static func fmt(_ s: Double) -> String {
        guard s.isFinite, s >= 0 else { return "0:00" }
        let total = Int(s)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
