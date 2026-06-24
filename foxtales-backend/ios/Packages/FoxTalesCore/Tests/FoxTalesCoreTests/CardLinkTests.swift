import XCTest
@testable import FoxTalesCore

final class CardLinkTests: XCTestCase {
    private let valid = "abcdEFGH1234ijklMNOP56" // 22 base62 chars

    func testExtractsTokenFromCapabilityURL() {
        let url = URL(string: "https://foxtales.app/p/\(valid)")!
        XCTAssertEqual(CardLink.token(from: url), valid)
    }

    func testIgnoresTrailingSlashAndQuery() {
        let url = URL(string: "https://foxtales.app/p/\(valid)?utm=x")!
        XCTAssertEqual(CardLink.token(from: url), valid)
    }

    func testRejectsWrongLength() {
        let url = URL(string: "https://foxtales.app/p/tooshort")!
        XCTAssertNil(CardLink.token(from: url))
    }

    func testRejectsNonCardPath() {
        let url = URL(string: "https://foxtales.app/play/\(valid)")!
        XCTAssertNil(CardLink.token(from: url))
    }

    func testRejectsNonAlphanumericToken() {
        let url = URL(string: "https://foxtales.app/p/aaaaaaaaaa-aaaaaaaaaa1")!
        XCTAssertNil(CardLink.token(from: url))
    }
}
