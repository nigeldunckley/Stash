import SwiftUI

/// A page's header, as on the web: a 26pt title, a mono detail such as "8 unseen", and the
/// page's controls on the right. On Mac it sits in the page under the window strip; on iPhone
/// the title stays in the navigation bar and the controls go in its toolbar.
struct PageHeader<Trailing: View>: View {
  let title: String
  var detail: String?
  var accentDetail = false
  /// The mono line and double rule above the title.
  var folio: FolioContent?
  @ViewBuilder var trailing: () -> Trailing

  #if os(macOS)
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @Environment(\.autoHiddenSidebar) private var autoHiddenSidebar
  #endif
  /// The way back out, for a page you've drilled into.
  @Environment(\.pageBack) private var back

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      if let back {
        BackBar(back: back).padding(.bottom, folio == nil ? -6 : -8)
      }
      if let folio { FolioView(content: folio) }
      titleRow
    }
    .padding(.horizontal, PageLayout.gutter)
    #if os(macOS)
    // With the sidebar hidden, keep clear of the window buttons and the sidebar button.
    .padding(.leading, (sidebarHidden || autoHiddenSidebar) ? PageLayout.windowButtons : 0)
    #endif
    .padding(.top, 2)
    .padding(.bottom, 20)
  }

  /// Title and tools on one line when they fit; otherwise the tools go on their own line
  /// underneath, scrolling sideways if even that is too narrow, so nothing spills off the page.
  private var titleRow: some View {
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .center, spacing: 14) {
        titleText
        Spacer(minLength: 16)
        tools
      }
      .frame(height: 38)

      VStack(alignment: .leading, spacing: 12) {
        titleText.frame(height: 38)
        ScrollView(.horizontal, showsIndicators: false) { tools }
          .scrollBounceBehavior(.basedOnSize)
      }
    }
  }

  private var tools: some View {
    HStack(spacing: 8) { trailing() }.fixedSize()
  }

  private var titleText: some View {
    HStack(alignment: .center, spacing: 14) {
      Text(title)
        .font(.stPageTitle)
        .tracking(Tracking.pageTitle)
        .foregroundStyle(Color.stInk)
        .lineLimit(1)
      if let detail {
        Text(detail.uppercased())
          .rolls(detail)
          .font(.mono(11))
          .tracking(0.66)
          .monospacedDigit()
          .foregroundStyle(accentDetail ? Color.stAccentText : Color.stMuted)
          .padding(.top, 6)
          .lineLimit(1)
      }
    }
    .fixedSize()
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
  var folio: FolioContent?
  @ViewBuilder var trailing: () -> Trailing

  func body(content: Content) -> some View {
    #if os(macOS)
    VStack(spacing: 0) {
      PageHeader(title: title, detail: detail, accentDetail: accentDetail, folio: folio, trailing: trailing)
      content.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color.stPage)
    .navigationTitle(title)
    .toolbar(removing: .title)
    #else
    content
      .safeAreaInset(edge: .top, spacing: 0) {
        if let folio {
          FolioView(content: folio)
            .padding(.horizontal, PageLayout.gutter)
            .padding(.vertical, 6)
            .background(Color.stPage)
        }
      }
      .background(Color.stPage)
      .navigationTitle(title)
      .toolbar { ToolbarItemGroup(placement: .primaryAction) { trailing() } }
    #endif
  }
}

extension View {
  func stashPage<Trailing: View>(
    _ title: String, detail: String? = nil, accentDetail: Bool = false, folio: FolioContent? = nil,
    @ViewBuilder trailing: @escaping () -> Trailing
  ) -> some View {
    modifier(StashPage(title: title, detail: detail, accentDetail: accentDetail, folio: folio, trailing: trailing))
  }

  func stashPage(_ title: String, detail: String? = nil, accentDetail: Bool = false, folio: FolioContent? = nil) -> some View {
    modifier(StashPage(title: title, detail: detail, accentDetail: accentDetail, folio: folio) { EmptyView() })
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
  var expands = false

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
    .frame(maxWidth: expands ? .infinity : 240, minHeight: 28, maxHeight: 28)
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
