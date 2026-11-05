// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RuxtKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "RuxtKit", targets: ["RuxtKit"])],
    targets: [
        .target(name: "RuxtKit"),
        .testTarget(name: "RuxtKitTests", dependencies: ["RuxtKit"]),
    ]
)
