import AVFoundation
import MediaPlayer

// Lock-screen metadata, Control Center transport, and the audio session.
//
// ⚠️ THE LOAD-BEARING SPIKE (spec Decision 6): verify on a real device that audio
// keeps playing when the screen locks and that the Now Playing controls work
// *inside an App Clip*. App Clips are constrained (no general background
// execution, tight memory budget). Background audio relies on the `audio`
// UIBackgroundMode + an active `.playback` AVAudioSession. Validate this before
// committing to the App Clip route — it is the one unknown the whole experience
// rests on. See ios/SPIKE.md for the step-by-step.
public enum NowPlaying {
    public static func activateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [])
        try? session.setActive(true)
    }

    public static func setMetadata(title: String, artist: String) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = artist
        info[MPMediaItemPropertyAlbumTitle] = "FoxTales"
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    public static func update(elapsed: Double, duration: Double, rate: Float) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyPlaybackRate] = rate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    public static func configureRemoteCommands(
        play: @escaping () -> Void,
        pause: @escaping () -> Void,
        seek: @escaping (Double) -> Void
    ) {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { _ in play(); return .success }
        center.pauseCommand.addTarget { _ in pause(); return .success }
        center.changePlaybackPositionCommand.addTarget { event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            seek(e.positionTime)
            return .success
        }
    }
}
