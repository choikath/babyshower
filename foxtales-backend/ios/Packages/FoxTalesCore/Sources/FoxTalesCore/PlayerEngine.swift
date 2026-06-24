import AVFoundation
import Combine

/// The AVPlayer wrapper. Because a tag tap launches a native target into the
/// foreground, playback may begin on load without an extra gesture (spec 6.1 —
/// native autoplay is allowed, unlike the web fallback).
@MainActor
public final class PlayerEngine: ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0
    @Published public var currentTime: Double = 0
    @Published public var duration: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?

    public init() {}

    public func load(urlString: String, story: ResolveResponse.Story) {
        guard let url = URL(string: urlString) else { return }
        NowPlaying.activateAudioSession()

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player

        // Delivered on the main queue, so it's safe to touch @MainActor state.
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] time in
            guard let self,
                  let dur = self.player?.currentItem?.duration.seconds,
                  dur.isFinite, dur > 0 else { return }
            self.currentTime = time.seconds
            self.duration = dur
            self.progress = time.seconds / dur
            NowPlaying.update(elapsed: time.seconds, duration: dur, rate: self.isPlaying ? 1 : 0)
        }

        NowPlaying.configureRemoteCommands(
            play: { [weak self] in self?.play() },
            pause: { [weak self] in self?.pause() },
            seek: { [weak self] seconds in self?.seek(toSeconds: seconds) }
        )
        NowPlaying.setMetadata(
            title: story.title,
            artist: (story.author.map { "by \($0) · " } ?? "") + "read by \(story.fromName)"
        )

        play() // autoplay on launch
    }

    public func toggle() { isPlaying ? pause() : play() }

    public func play() {
        player?.play()
        isPlaying = true
        NowPlaying.update(elapsed: currentTime, duration: duration, rate: 1)
    }

    public func pause() {
        player?.pause()
        isPlaying = false
        NowPlaying.update(elapsed: currentTime, duration: duration, rate: 0)
    }

    public func stop() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player?.pause()
        player = nil
        isPlaying = false
    }

    public func seek(toFraction fraction: Double) {
        guard duration > 0 else { return }
        seek(toSeconds: fraction * duration)
    }

    public func seek(toSeconds seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    public static func fmt(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
