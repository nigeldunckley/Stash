#if os(macOS)
import SwiftUI

/// One item in the sidebar: 36pt tall (32 for collections), 8pt corners, grey when selected
/// or hovered, with an optional count on the right.
struct SidebarRow<Trailing: View>: View {
  let title: String
  var symbol: String?
  /// A collection's colour, drawn as a dot in place of an icon.
  var dot: Color?
  /// Saved rows show the ribbon, which lights up as saves land.
  var ribbon: MomentKind?
  /// What lands on this entry (saves, archives or deletes), swooshing into its icon.
  var landing: MomentKind?
  var selected = false
  var child = false
  let action: () -> Void
  @ViewBuilder var trailing: () -> Trailing

  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        icon
          .modifier(LandingSwallow(kind: landing))
          .background { if let landing { Color.clear.momentTarget(landing) } }
        Text(title)
          .font(.ui(14, selected ? .medium : .regular))
          .lineLimit(1)
        Spacer(minLength: 0)
        trailing()
      }
      .foregroundStyle(selected ? Color.stInk : Color.stInk2)
      .padding(.leading, child ? 28 : 10)
      .padding(.trailing, 10)
      .frame(height: child ? 32 : 36)
      .modifier(LandingSettle(
        kind: landing,
        fill: selected ? Color.stSelected : hovering ? Color.stSunken : Color.clear,
        shape: RoundedRectangle(cornerRadius: Radius.item, style: .continuous)
      ))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  @ViewBuilder
  private var icon: some View {
    if let dot {
      Circle().fill(dot).frame(width: 7, height: 7)
    } else if let ribbon {
      LandingRibbon(kind: ribbon).frame(width: 18)
    } else if let symbol {
      Image(systemName: symbol)
        .font(.system(size: 15, weight: .light))
        .frame(width: 18)
    }
  }
}

extension SidebarRow where Trailing == EmptyView {
  init(title: String, symbol: String? = nil, dot: Color? = nil, ribbon: MomentKind? = nil, landing: MomentKind? = nil, selected: Bool = false, child: Bool = false, action: @escaping () -> Void) {
    self.init(title: title, symbol: symbol, dot: dot, ribbon: ribbon, landing: landing, selected: selected, child: child, action: action) { EmptyView() }
  }
}

/// "READ" and "WATCH": mono caps labels that fold their group, as on the web.
struct SidebarGroupLabel: View {
  let title: String
  @Binding var isOpen: Bool

  @State private var hovering = false

  var body: some View {
    Button {
      withAnimation(StashMotion.systemReduceMotion ? nil : StashMotion.change) { isOpen.toggle() }
    } label: {
      HStack(spacing: 8) {
        Text(title.uppercased())
          .font(.mono(11, .medium))
          .tracking(1)
        Spacer(minLength: 0)
        Image(systemName: "chevron.down")
          .font(.system(size: 10, weight: .medium))
          .rotationEffect(.degrees(isOpen ? 0 : -90))
          .opacity(hovering || !isOpen ? 1 : 0.6)
      }
      .foregroundStyle(Color.stMuted)
      .padding(.horizontal, 10)
      .frame(height: 26)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .padding(.top, 10)
    .accessibilityLabel("\(title), \(isOpen ? "expanded" : "collapsed")")
  }
}

/// A small icon button for the panel's header and account row.
struct SidebarIconButton: View {
  let symbol: String
  let help: String
  let action: () -> Void

  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 13, weight: .regular))
        .foregroundStyle(hovering ? Color.stInk : Color.stMuted)
        .frame(width: 24, height: 24)
        .background(hovering ? Color.stSunken : Color.clear, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .help(help)
  }
}

#endif
