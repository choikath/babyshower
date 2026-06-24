// swift-tools-version: 5.9
import PackageDescription

// FoxTalesCore — the shared "resolve a token -> play the story" module.
//
// Both the full app and the App Clip depend on this package, so the player,
// the resolver client, lock-screen wiring, and the playback UI are written
// ONCE (spec Decision 6: "the App Clip is the full app's player module shipped
// early — shared SwiftUI target, zero throwaway work"). Built as a static
// library so it links into the App Clip without inflating the size budget.
let package = Package(
    name: "FoxTalesCore",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "FoxTalesCore", targets: ["FoxTalesCore"]),
    ],
    targets: [
        .target(name: "FoxTalesCore"),
        .testTarget(name: "FoxTalesCoreTests", dependencies: ["FoxTalesCore"]),
    ]
)
