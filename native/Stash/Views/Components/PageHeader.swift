import SwiftUI

/// A page's header, as on the web: a 26pt title, a mono detail such as "8 unseen", and the
/// page's controls on the right. On Mac it sits in the page under the window strip; on iPhone
/// the title stays in the navigation bar and the controls go in its toolbar.
struct PageHeader<Trailing: View>: View {
  let title: String
  var detail: String?
  var accentDetail = false
  @ViewBuilder var trailing: () -> Trailing

  #if os(macOS)
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  #endif

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      Text(title)
        .font(.stPageTitle)
        .tracking(Tracking.pageTitle)
        .foregroundStyle(Color.stInk)
        .lineLimit(1)
      if let detail {
        Text(detail.uppercased())
          .font(.mono(11))
          .tracking(0.66)
          .monospacedDigit()
          .foregroundStyle(accentDetail ? Color.stAccentText : Color.stMuted)
          .padding(.top, 6)
          .lineLimit(1)
      }
      Spacer(minLength: 16)
      HStack(spacing: 8) { trailing() }
    }
    .frame(height: 38)
    .padding(.horizontal, PageLayout.gutter)
    #if os(macOS)
    // With the sidebar hidden, keep clear of the window buttons and the sidebar button.
    .padding(.leading, sidebarHidden ? PageLayout.windowButtons : 0)
    #endif
    .padding(.top, 2)
    .padding(.bottom, 20)
  }
}

/// The page grid shared by every screen: 40pt from the edges on Mac, content at most 1,180pt.
enum PageLayout {
  #if os(macOS)
  static let gutter: CGFloat = 40
  #else
  static let gutter: CGFloat = 16
  #endif
  static let maxWidth: CGFloat = 1180
  /// Room for the window's traffic lights and sidebar button when the sidebar is hidden.
  static let windowButtons: CGFloat = 84
}

/// Gives a screen its page header on Mac, or its navigation title and toolbar on iPhone.
struct StashPage<Trailing: View>: ViewModifier {
  let title: String
  var detail: String?
  var accentDetail = false
  @ViewBuilder var trailing: () -> Trailing

  func body(content: Content) -> some View {
    #if os(macOS)
    VStack(spacing: 0) {
      PageHeader(title: title, detail: detail, accentDetail: accentDetail, trailing: trailing)
      content.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color.stPage)
    .navigationTitle(title)
    .toolbar(removing: .title)
    #else
    content
      .background(Color.stPage)
      .navigationTitle(title)
      .toolbar { ToolbarItemGroup(placement: .primaryAction) { trailing() } }
    #endif
  }
}

extension View {
  func stashPage<Trailing: View>(
    _ title: String, detail: String? = nil, accentDetail: Bool = false,
    @ViewBuilder trailing: @escaping () -> Trailing
  ) -> some View {
    modifier(StashPage(title: title, detail: detail, accentDetail: accentDetail, trailing: trailing))
  }

  func stashPage(_ title: String, detail: String? = nil, accentDetail: Bool = false) -> some View {
    modifier(StashPage(title: title, detail: detail, accentDetail: accentDetail) { EmptyView() })
  }

  /// Centres content at the page's maximum width, 40pt from the edges on Mac.
  func pageWidth() -> some View {
    padding(.horizontal, PageLayout.gutter)
      .frame(maxWidth: PageLayout.maxWidth + PageLayout.gutter * 2)
      .frame(maxWidth: .infinity)
  }
}

/// A 30pt search box for a page header, searching as you press Return.
struct PageSearchField: View {
  @Binding var text: String
  var prompt = "Search"
  var onSubmit: () -> Void = {}

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.ui(12))
        .foregroundStyle(Color.stMuted)
      TextField("", text: $text, prompt: Text(prompt).foregroundStyle(Color.stMuted))
        .textFieldStyle(.plain)
        .font(.ui(13))
        .onSubmit(onSubmit)
      if !text.isEmpty {
        Button {
          text = ""
          onSubmit()
        } label: {
          Image(systemName: "xmark.circle.fill").foregroundStyle(Color.stMuted)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, 10)
    .frame(width: 240, height: 28)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}

/// Whether this page is the one showing. On Mac every page you've visited stays alive behind
/// the current one, so hidden pages leave the window's toolbar to the page in front.
private struct ActivePageKey: EnvironmentKey {
  static let defaultValue = true
}

extension EnvironmentValues {
  var isActivePage: Bool {
    get { self[ActivePageKey.self] }
    set { self[ActivePageKey.self] = newValue }
  }
}
